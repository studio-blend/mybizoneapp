'use server';

import { db } from '@/lib/db';
import { type ActionResult, safeAction } from '@/lib/server-action';
import { requireUser } from '@/lib/session';
import { uploadFile } from '@/lib/storage';
import { auditLogs, billCounters, businesses, products, saleItems, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { calculateSaleTotals } from '@mybizone/domain/sale';
import { and, eq, gte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || null);
const moneyText = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'expected money up to 2dp');
const qtyText = z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/, 'expected qty up to 3dp');
const PAYMENT_METHODS = ['cash', 'upi', 'card', 'other'] as const;

const SaleLineInput = z.object({
  productId: uuid,
  qty: qtyText,
});

const CreateSaleInput = z.object({
  storeId: uuid,
  customerName: optionalText(120),
  customerPhone: optionalText(30),
  customerGstin: optionalText(20),
  paymentMethod: z.enum(PAYMENT_METHODS),
  discount: z.union([z.literal(''), moneyText]).transform((v) => (v === '' ? '0' : v)),
  notes: optionalText(500),
  isInterstate: z.boolean().default(false),
  lines: z.array(SaleLineInput).min(1, 'add at least one product'),
});

interface CreateSaleResult {
  id: string;
  billNo: string;
  total: string;
}

/**
 * Create a sale atomically. The transaction:
 *   1. UPSERTs bill_counters → atomic sale_no per business.
 *   2. Loads each cart product (snapshot price/unit/gst at sale time).
 *   3. Computes totals via the pure domain calculator.
 *   4. Inserts sales + sale_items.
 *   5. Decrements products.inventory with a floor check in the same UPDATE
 *      (`WHERE inventory >= qty`) — zero rows updated → throw InsufficientStock.
 *   6. Writes an audit_log.
 *
 * Either every step persists or none does — no partial inventory drift.
 */
export const createSaleAction = safeAction(CreateSaleInput, async (input, { user, tx }) => {
  // Snapshot product rows — RLS already scopes to tenant, store check verifies the cart's store.
  const productRows = await tx
    .select({
      id: products.id,
      storeId: products.storeId,
      name: products.name,
      unitSymbol: products.unitSymbol,
      price: products.price,
      hsnCode: products.hsnCode,
      gstRate: products.gstRate,
      active: products.active,
    })
    .from(products)
    .where(eq(products.businessId, user.businessId));
  const byId = new Map(productRows.map((p) => [p.id, p]));

  for (const l of input.lines) {
    const p = byId.get(l.productId);
    if (!p) throw new Error(`product ${l.productId} not found`);
    if (!p.active) throw new Error(`product "${p.name}" is deleted`);
    if (p.storeId !== input.storeId) {
      throw new Error(`product "${p.name}" does not belong to selected store`);
    }
  }

  // Read business GST settings (also snapshot for invoice gen later).
  const [biz] = await tx
    .select({ gstEnabled: businesses.gstEnabled, gstin: businesses.gstin })
    .from(businesses)
    .where(eq(businesses.id, user.businessId));
  if (!biz) throw new Error('business not found');

  const calc = calculateSaleTotals({
    gstEnabled: biz.gstEnabled,
    isInterstate: input.isInterstate,
    discount: Number(input.discount),
    lines: input.lines.map((l) => {
      const p = byId.get(l.productId);
      if (!p) throw new Error('unreachable');
      return {
        qty: Number(l.qty),
        unitPrice: Number(p.price),
        gstRate: p.gstRate ? Number(p.gstRate) : null,
      };
    }),
  });

  // Bump per-tenant counter atomically. ON CONFLICT path increments existing row.
  const [counter] = await tx
    .insert(billCounters)
    .values({ businessId: user.businessId, lastSaleNo: 1 })
    .onConflictDoUpdate({
      target: billCounters.businessId,
      set: { lastSaleNo: sql`${billCounters.lastSaleNo} + 1` },
    })
    .returning({ lastSaleNo: billCounters.lastSaleNo });
  if (!counter) throw new Error('counter assignment failed');
  const billNo = `BILL-${String(counter.lastSaleNo).padStart(6, '0')}`;

  // Insert sale row.
  const [saleRow] = await tx
    .insert(sales)
    .values({
      businessId: user.businessId,
      storeId: input.storeId,
      employeeId: user.id,
      billNo,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerGstin: input.customerGstin,
      subtotal: calc.subtotal.toFixed(2),
      discount: calc.discount.toFixed(2),
      taxTotal: calc.taxTotal.toFixed(2),
      total: calc.total.toFixed(2),
      paymentMethod: input.paymentMethod,
      notes: input.notes,
    })
    .returning({ id: sales.id });
  if (!saleRow) throw new Error('sale insert failed');

  // Insert sale_items + decrement inventory atomically with floor check.
  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i];
    const calcLine = calc.lines[i];
    if (!l || !calcLine) throw new Error('calc/line mismatch');
    const p = byId.get(l.productId);
    if (!p) throw new Error('unreachable');

    await tx.insert(saleItems).values({
      businessId: user.businessId,
      saleId: saleRow.id,
      productId: p.id,
      productName: p.name,
      qty: l.qty,
      unitSymbol: p.unitSymbol,
      unitPrice: p.price,
      hsnCode: p.hsnCode,
      gstRate: p.gstRate,
      lineTotal: calcLine.lineTotal.toFixed(2),
      gstAmount: calcLine.gstAmount.toFixed(2),
    });

    const decrement = await tx
      .update(products)
      .set({ inventory: sql`${products.inventory} - ${l.qty}` })
      .where(
        and(
          eq(products.id, p.id),
          eq(products.businessId, user.businessId),
          gte(products.inventory, l.qty),
        ),
      )
      .returning({ id: products.id });
    if (decrement.length === 0) {
      throw new Error(`insufficient stock for "${p.name}"`);
    }
  }

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'sale.create',
    entity: 'sale',
    entityId: saleRow.id,
    after: { billNo, total: calc.total },
  });

  revalidatePath('/sales');
  revalidatePath('/dashboard');
  return { id: saleRow.id, billNo, total: calc.total.toFixed(2) } satisfies CreateSaleResult;
});

/**
 * Optional bill-image upload for the proof-of-physical-bill workflow. Same
 * pattern as product images: takes raw FormData because Server Action JSON
 * pipes can't carry binary.
 */
export async function uploadSaleBillImageAction(
  formData: FormData,
): Promise<ActionResult<{ key: string }>> {
  const user = await requireUser();
  const idValue = formData.get('id');
  const fileValue = formData.get('file');
  if (typeof idValue !== 'string' || !/^[0-9a-f-]{36}$/i.test(idValue)) {
    return { ok: false, error: 'invalid sale id' };
  }
  if (!(fileValue instanceof Blob) || fileValue.size === 0) {
    return { ok: false, error: 'no file selected' };
  }

  const buf = Buffer.from(await fileValue.arrayBuffer());
  let key: string;
  try {
    const out = await uploadFile({
      category: 'bills',
      businessId: user.businessId,
      body: buf,
      allowed: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    });
    key = out.key;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'upload failed' };
  }

  await withTenant(db, user.businessId, async (tx) => {
    await tx
      .update(sales)
      .set({ billImageKey: key, updatedAt: new Date() })
      .where(and(eq(sales.id, idValue), eq(sales.businessId, user.businessId)));
  });

  revalidatePath('/sales');
  return { ok: true, data: { key } };
}
