'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, billSeries, dcItems, deliveryChallans, products } from '@mybizone/db';
import { financialYear, formatBillNo } from '@mybizone/domain/bill-series';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const optionalUuid = z.union([uuid, z.literal('')]).transform((v) => (v === '' ? null : v));
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || null);
const moneyText = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'expected money up to 2dp');
const qtyText = z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/, 'expected qty up to 3dp');

const DC_STATUSES = ['dispatched', 'delivered', 'cancelled'] as const;

const DcLineInput = z.object({
  productId: uuid,
  qty: qtyText,
  unitPrice: moneyText,
});

const CreateDcInput = z.object({
  customerId: optionalUuid.optional().default(''),
  customerName: optionalText(120),
  customerPhone: optionalText(30),
  notes: optionalText(500),
  items: z.array(DcLineInput).min(1, 'add at least one item'),
});

export const createDcAction = safeAction(CreateDcInput, async (input, { user, tx }) => {
  // Generate dcNo via bill_series (docType='dc', prefix='DC')
  const now = new Date();
  const fy = financialYear(now);
  const [seriesRow] = await tx
    .insert(billSeries)
    .values({
      businessId: user.businessId,
      docType: 'dc',
      financialYear: fy,
      prefix: 'DC',
      lastSeq: 1,
    })
    .onConflictDoUpdate({
      target: [billSeries.businessId, billSeries.docType, billSeries.financialYear],
      set: { lastSeq: sql`${billSeries.lastSeq} + 1` },
    })
    .returning({ lastSeq: billSeries.lastSeq, prefix: billSeries.prefix });
  if (!seriesRow) throw new Error('bill series assignment failed');
  const dcNo = formatBillNo(seriesRow.prefix, fy, seriesRow.lastSeq);

  // Snapshot product details
  const productRows = await tx
    .select({
      id: products.id,
      name: products.name,
      unitSymbol: products.unitSymbol,
      active: products.active,
    })
    .from(products)
    .where(eq(products.businessId, user.businessId));
  const byId = new Map(productRows.map((p) => [p.id, p]));

  for (const item of input.items) {
    const p = byId.get(item.productId);
    if (!p) throw new Error(`product ${item.productId} not found`);
    if (!p.active) throw new Error(`product "${p.name}" is deleted`);
  }

  // Compute totals
  let subtotal = 0;
  const computedLines = input.items.map((item) => {
    const lineTotal = Number(item.qty) * Number(item.unitPrice);
    subtotal += lineTotal;
    return { ...item, lineTotal };
  });
  const total = subtotal;

  // Insert delivery_challans row
  const [dcRow] = await tx
    .insert(deliveryChallans)
    .values({
      businessId: user.businessId,
      customerId: input.customerId ?? null,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      dcNo,
      status: 'draft',
      subtotal: subtotal.toFixed(2),
      total: total.toFixed(2),
      notes: input.notes,
    })
    .returning({ id: deliveryChallans.id });
  if (!dcRow) throw new Error('delivery challan insert failed');

  // Insert dc_items
  for (const line of computedLines) {
    const p = byId.get(line.productId);
    if (!p) throw new Error('unreachable');
    await tx.insert(dcItems).values({
      dcId: dcRow.id,
      productId: line.productId,
      productName: p.name,
      qty: line.qty,
      unitSymbol: p.unitSymbol,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal.toFixed(2),
    });
  }

  // Audit log
  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'dc.create',
    entity: 'delivery_challan',
    entityId: dcRow.id,
    after: { dcNo, total: total.toFixed(2) },
  });

  revalidatePath('/delivery-challans');

  return { id: dcRow.id, dcNo };
});

const UpdateDcStatusInput = z.object({
  id: uuid,
  status: z.enum(DC_STATUSES),
});

export const updateDcStatusAction = safeAction(
  UpdateDcStatusInput,
  async (input, { user, tx }) => {
    const now = new Date();
    const extraFields: {
      dispatchedAt?: Date;
      deliveredAt?: Date;
    } = {};

    if (input.status === 'dispatched') {
      extraFields.dispatchedAt = now;
    } else if (input.status === 'delivered') {
      extraFields.deliveredAt = now;
    }

    const [row] = await tx
      .update(deliveryChallans)
      .set({ status: input.status, updatedAt: now, ...extraFields })
      .where(
        and(
          eq(deliveryChallans.id, input.id),
          eq(deliveryChallans.businessId, user.businessId),
        ),
      )
      .returning({ id: deliveryChallans.id });
    if (!row) throw new Error('delivery challan not found');

    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'dc.status_update',
      entity: 'delivery_challan',
      entityId: input.id,
      after: { status: input.status, ...extraFields },
    });

    revalidatePath('/delivery-challans');
    return { ok: true };
  },
);
