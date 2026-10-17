'use server';
import { getUserRoles } from '@/lib/get-user-roles';
import { canCollectOrders, canReadOrder } from '@/lib/order-access';
import {
  type OrderTx,
  adjustOrderDebt,
  applyOrderFunds,
  lockOrder,
  orderLedger,
  requestHash,
} from '@/lib/order-ledger';
import { centsText, deliveredShare, moneyCents } from '@/lib/order-policy';
import { handoverPack } from '@/lib/pack-policy';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { stockText, stockUnits, validExpiry } from '@/lib/stock-batch-policy';
import { moveStockBatches } from '@/lib/stock-batches';
import { assertCustomerCredit, packFields, resolvePack } from '@/lib/wholesale';
import { creditDueDate } from '@/lib/wholesale-policy';
import {
  auditLogs,
  billSeries,
  businesses,
  customerOrderDeliveries,
  customerOrderDeliveryItems,
  customerOrderItems,
  customerOrderPayments,
  customerOrders,
  customers,
  products,
  saleItems,
  sales,
  stores,
} from '@mybizone/db';
import { financialYear, formatBillNo } from '@mybizone/domain/bill-series';
import { calculateSaleTotals } from '@mybizone/domain/sale';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';
const uuid = z.string().uuid();
const money = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/);
const positiveMoney = money.refine((v) => Number(v) > 0, 'Amount must be positive');
const qty = z
  .string()
  .regex(/^\d{1,9}(?:\.\d{1,3})?$/)
  .refine((v) => Number(v) > 0, 'Quantity must be positive');
const date = z.string().refine(validExpiry, 'Enter a valid date');
const note = z.string().trim().min(3).max(500);
const text = (max: number) => z.string().trim().max(max).default('');
async function number(tx: OrderTx, businessId: string, type: string, prefix: string) {
  const fy = financialYear(new Date());
  const [row] = await tx
    .insert(billSeries)
    .values({ businessId, docType: type, financialYear: fy, prefix, lastSeq: 1 })
    .onConflictDoUpdate({
      target: [billSeries.businessId, billSeries.docType, billSeries.financialYear],
      set: { lastSeq: sql`${billSeries.lastSeq}+1` },
    })
    .returning({ seq: billSeries.lastSeq, prefix: billSeries.prefix });
  if (!row) throw new Error('Document number assignment failed');
  return { no: formatBillNo(row.prefix, fy, row.seq), fy };
}
function refresh(id: string) {
  for (const p of [
    '/orders',
    `/orders/${id}`,
    '/sales',
    '/dashboard',
    '/customers',
    '/products',
    '/inventory/batches',
    '/inventory/serials',
    '/warranties',
    '/reports/due-bills',
    '/reports/balance-sheet',
  ])
    revalidatePath(p);
}
export const createOrderAction = safeAction(
  z.object({
    id: uuid,
    storeId: uuid,
    customerId: uuid,
    deliveryAddress: z.string().trim().min(1).max(1000),
    promisedOn: date,
    billType: z.enum(['gst_bill', 'non_gst_bill']),
    tradeType: z.enum(['standard', 'wholesale']).default('standard'),
    isInterstate: z.boolean().default(false),
    notes: text(500),
    items: z
      .array(
        z.object({
          productId: uuid,
          qty,
          unitPrice: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/),
          ...packFields,
        }),
      )
      .min(1)
      .max(100),
  }),
  async (input, { user, tx }) => {
    await requirePermission(user, 'create_sale');
    // Serialize identical request IDs before allocating the shared document series.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${user.businessId}:${input.id}`},0))`,
    );
    const hash = requestHash(input);
    const [existing] = await tx
      .select()
      .from(customerOrders)
      .where(and(eq(customerOrders.id, input.id), eq(customerOrders.businessId, user.businessId)));
    if (existing) {
      if (existing.requestHash !== hash)
        throw new Error('Request ID was already used for different order details');
      return { id: existing.id };
    }
    if (new Set(input.items.map((i) => i.productId)).size !== input.items.length)
      throw new Error('Use one order line per product');
    const [store] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, input.storeId), eq(stores.businessId, user.businessId)));
    if (!store) throw new Error('Store not found');
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.businessId, user.businessId)));
    if (!customer) throw new Error('Customer not found');
    const [biz] = await tx
      .select({ enabled: businesses.gstEnabled, gstin: businesses.gstin })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));
    if (!biz) throw new Error('Business not found');
    const rows = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.businessId, user.businessId),
          inArray(
            products.id,
            input.items.map((i) => i.productId),
          ),
        ),
      );
    const mapped = await Promise.all(
      input.items.map(async (item) => {
        const product = rows.find((p) => p.id === item.productId);
        if (!product?.active || product.storeId !== input.storeId)
          throw new Error('Choose active products from the selected store');
        const converted = await resolvePack(tx, user.businessId, product, item);
        if (product.unitType === 'piece' && stockUnits(converted.qty) % 1000)
          throw new Error('Pieces require whole quantities');
        return {
          item: { ...item, qty: converted.qty },
          product,
          packSnapshot: converted.packSnapshot,
        };
      }),
    );
    const gstEnabled = biz.enabled && input.billType === 'gst_bill';
    if (gstEnabled && !biz.gstin)
      throw new Error('Configure the business GSTIN before creating a GST order');
    const calc = calculateSaleTotals({
      gstEnabled,
      isInterstate: input.isInterstate,
      lines: mapped.map(({ item, product }) => ({
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        gstRate: product.gstRate ? Number(product.gstRate) : null,
      })),
    });
    centsText(Math.round(calc.total * 100));
    const doc = await number(tx, user.businessId, 'customer_order', 'ORD');
    await tx.insert(customerOrders).values({
      id: input.id,
      businessId: user.businessId,
      storeId: input.storeId,
      customerId: customer.id,
      orderNo: doc.no,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerGstin: customer.gstin,
      deliveryAddress: input.deliveryAddress,
      promisedOn: input.promisedOn,
      creditDays: customer.creditDays,
      tradeType: input.tradeType,
      billType: input.billType,
      gstEnabled,
      businessGstin: gstEnabled ? biz.gstin : null,
      isInterstate: gstEnabled && input.isInterstate,
      total: calc.total.toFixed(2),
      notes: input.notes || null,
      requestHash: hash,
      createdBy: user.id,
    });
    await tx.insert(customerOrderItems).values(
      mapped.map(({ item, product, packSnapshot }, i) => {
        const line = calc.lines[i];
        if (!line) throw new Error('Order calculation mismatch');
        return {
          businessId: user.businessId,
          orderId: input.id,
          productId: product.id,
          departmentId: product.departmentId,
          productName: product.name,
          unitType: product.unitType,
          unitSymbol: product.unitSymbol,
          qty: item.qty,
          unitPrice: item.unitPrice,
          packSnapshot,
          hsnCode: product.hsnCode,
          gstRate: product.gstRate,
          subtotal: line.lineSubtotal.toFixed(2),
          taxTotal: line.gstAmount.toFixed(2),
          lineTotal: line.lineTotal.toFixed(2),
        };
      }),
    );
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'order.create',
      entity: 'customer_order',
      entityId: input.id,
      after: { orderNo: doc.no, total: calc.total.toFixed(2) },
    });
    refresh(input.id);
    return { id: input.id };
  },
);
export const recordOrderPaymentAction = safeAction(
  z.object({
    id: uuid,
    orderId: uuid,
    kind: z.enum(['receipt', 'refund']),
    amount: positiveMoney,
    method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'other']),
    reference: text(100),
    note,
  }),
  async (input, { user, tx }) => {
    const order = await lockOrder(tx, user.businessId, input.orderId);
    const roles = await getUserRoles(user);
    if (!canReadOrder(roles, order.storeId) || !canCollectOrders(roles))
      throw new Error('Permission denied');
    const hash = requestHash(input);
    const [existing] = await tx
      .select()
      .from(customerOrderPayments)
      .where(
        and(
          eq(customerOrderPayments.id, input.id),
          eq(customerOrderPayments.businessId, user.businessId),
        ),
      );
    if (existing) {
      if (existing.requestHash !== hash || existing.orderId !== order.id)
        throw new Error('Request ID was already used for a different payment');
      return { id: order.id };
    }
    const ledger = await orderLedger(tx, order);
    const amount = moneyCents(input.amount);
    if (input.kind === 'receipt' && amount > ledger.balance)
      throw new Error('Payment exceeds the remaining order balance');
    if (input.kind === 'refund' && amount > ledger.held)
      throw new Error('Refund exceeds the unused advance held on this order');
    await tx
      .insert(customerOrderPayments)
      .values({ ...input, businessId: user.businessId, requestHash: hash, createdBy: user.id });
    if (input.kind === 'receipt') await applyOrderFunds(tx, order, 'receipt', input.id);
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: `order.${input.kind}`,
      entity: 'customer_order_payment',
      entityId: input.id,
      after: { orderId: order.id, amount: input.amount, method: input.method },
    });
    refresh(order.id);
    return { id: order.id };
  },
);
export const deliverOrderAction = safeAction(
  z.object({
    id: uuid,
    orderId: uuid,
    note,
    items: z
      .array(
        z.object({
          itemId: uuid,
          qty,
          serialNumbers: z.array(z.string().max(100)).max(500).optional(),
        }),
      )
      .min(1)
      .max(100),
  }),
  async (input, { user, tx }) => {
    await requirePermission(user, 'create_sale');
    const order = await lockOrder(tx, user.businessId, input.orderId);
    const hash = requestHash(input);
    const [existing] = await tx
      .select()
      .from(customerOrderDeliveries)
      .where(
        and(
          eq(customerOrderDeliveries.id, input.id),
          eq(customerOrderDeliveries.businessId, user.businessId),
        ),
      );
    if (existing) {
      if (existing.orderId !== order.id || existing.requestHash !== hash)
        throw new Error('Request ID was already used for a different handover');
      return { id: order.id, saleId: existing.saleId };
    }
    if (order.status !== 'open') throw new Error('This order remainder is cancelled');
    if (new Set(input.items.map((i) => i.itemId)).size !== input.items.length)
      throw new Error('Use one delivery line per order item');
    const [biz] = await tx
      .select({ gstin: businesses.gstin, enabled: businesses.gstEnabled })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));
    if (order.gstEnabled && (!biz?.enabled || biz.gstin !== order.businessGstin))
      throw new Error('Business GST identity changed; reconcile the order before billing');
    const items = await tx
      .select()
      .from(customerOrderItems)
      .where(
        and(
          eq(customerOrderItems.businessId, user.businessId),
          eq(customerOrderItems.orderId, order.id),
        ),
      );
    const chosen = input.items
      .map((raw) => {
        const item = items.find((i) => i.id === raw.itemId);
        if (!item) throw new Error('Order item not found');
        const subtotal = deliveredShare(item.subtotal, item.qty, item.deliveredQty, raw.qty);
        const tax = deliveredShare(item.taxTotal, item.qty, item.deliveredQty, raw.qty);
        return {
          raw,
          item,
          subtotal,
          tax,
          total: centsText(moneyCents(subtotal) + moneyCents(tax)),
        };
      })
      .sort((a, b) => a.item.productId.localeCompare(b.item.productId));
    const subtotal = chosen.reduce((n, l) => n + moneyCents(l.subtotal), 0);
    const tax = chosen.reduce((n, l) => n + moneyCents(l.tax), 0);
    const total = subtotal + tax;
    const fundsBefore = await orderLedger(tx, order);
    const doc = await number(
      tx,
      user.businessId,
      'sale',
      order.billType === 'gst_bill' ? 'GST' : 'BILL',
    );
    const [sale] = await tx
      .insert(sales)
      .values({
        businessId: user.businessId,
        storeId: order.storeId,
        employeeId: user.id,
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerGstin: order.customerGstin,
        financialYear: doc.fy,
        billNo: doc.no,
        subtotal: centsText(subtotal),
        discount: '0',
        taxTotal: centsText(tax),
        gstEnabledAtSale: order.gstEnabled,
        businessGstinAtSale: order.businessGstin,
        isInterstate: order.isInterstate,
        cgst: centsText(order.isInterstate ? 0 : Math.round(tax / 2)),
        sgst: centsText(order.isInterstate ? 0 : tax - Math.round(tax / 2)),
        igst: centsText(order.isInterstate ? tax : 0),
        total: centsText(total),
        paymentMethod: 'order',
        paymentStatus: total ? 'due' : 'paid',
        billType: order.billType,
        dueDate: creditDueDate(order.creditDays),
        notes: `Order ${order.orderNo} · ${input.note}`,
      })
      .returning({ id: sales.id });
    if (!sale) throw new Error('Delivery bill failed');
    await tx.insert(customerOrderDeliveries).values({
      id: input.id,
      businessId: user.businessId,
      orderId: order.id,
      saleId: sale.id,
      note: input.note,
      requestHash: hash,
      createdBy: user.id,
    });
    for (const line of chosen) {
      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, line.item.productId), eq(products.businessId, user.businessId)))
        .for('update');
      if (
        !product?.active ||
        product.storeId !== order.storeId ||
        product.unitSymbol !== line.item.unitSymbol ||
        product.unitType !== line.item.unitType
      )
        throw new Error('Product store, units or availability changed; reconcile this order');
      if (product.unitType === 'piece' && stockUnits(line.raw.qty) % 1000)
        throw new Error('Pieces require whole quantities');
      await tx.insert(saleItems).values({
        businessId: user.businessId,
        saleId: sale.id,
        productId: product.id,
        productName: line.item.productName,
        qty: line.raw.qty,
        unitSymbol: line.item.unitSymbol,
        unitPrice: line.item.unitPrice,
        packSnapshot: handoverPack(line.item.packSnapshot, line.raw.qty),
        hsnCode: line.item.hsnCode,
        gstRate: line.item.gstRate,
        lineTotal: line.total,
        gstAmount: line.tax,
        costPriceAtSale: product.costPrice,
        itemDiscount: '0',
        isFreeItem: false,
      });
      const [changed] = await tx
        .update(products)
        .set({ inventory: sql`${products.inventory}-${line.raw.qty}::numeric` })
        .where(
          and(
            eq(products.id, product.id),
            eq(products.businessId, user.businessId),
            gte(products.inventory, line.raw.qty),
          ),
        )
        .returning({ id: products.id });
      if (!changed) throw new Error(`Insufficient stock for ${line.item.productName}`);
      await moveStockBatches(tx, {
        businessId: user.businessId,
        productId: product.id,
        qty: line.raw.qty,
        kind: 'sale',
        documentId: sale.id,
        serialNumbers: line.raw.serialNumbers,
      });
      await tx
        .update(customerOrderItems)
        .set({
          deliveredQty: stockText(stockUnits(line.item.deliveredQty) + stockUnits(line.raw.qty)),
        })
        .where(
          and(
            eq(customerOrderItems.id, line.item.id),
            eq(customerOrderItems.businessId, user.businessId),
          ),
        );
      await tx.insert(customerOrderDeliveryItems).values({
        businessId: user.businessId,
        orderId: order.id,
        deliveryId: input.id,
        orderItemId: line.item.id,
        qty: line.raw.qty,
      });
    }
    await adjustOrderDebt(tx, order, total);
    await applyOrderFunds(tx, order, 'delivery', input.id);
    if (total > fundsBefore.held) await assertCustomerCredit(tx, user.businessId, order.customerId);
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'order.deliver',
      entity: 'customer_order_delivery',
      entityId: input.id,
      after: { orderId: order.id, saleId: sale.id, billNo: doc.no, total: centsText(total) },
    });
    refresh(order.id);
    return { id: order.id, saleId: sale.id };
  },
);
export const cancelOrderAction = safeAction(
  z.object({ orderId: uuid, note }),
  async (input, { user, tx }) => {
    await requirePermission(user, 'create_sale');
    const order = await lockOrder(tx, user.businessId, input.orderId);
    if (order.status === 'cancelled') return { id: order.id };
    const items = await tx
      .select()
      .from(customerOrderItems)
      .where(
        and(
          eq(customerOrderItems.orderId, order.id),
          eq(customerOrderItems.businessId, user.businessId),
        ),
      );
    if (items.every((i) => i.deliveredQty === i.qty))
      throw new Error('The order is already fully delivered');
    const ledger = await orderLedger(tx, order);
    if (ledger.held > 0)
      throw new Error('Refund the unused advance before cancelling the remainder');
    await tx
      .update(customerOrders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(customerOrders.id, order.id), eq(customerOrders.businessId, user.businessId)));
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'order.cancel_remainder',
      entity: 'customer_order',
      entityId: order.id,
      after: { note: input.note },
    });
    refresh(order.id);
    return { id: order.id };
  },
);
export const rescheduleOrderAction = safeAction(
  z.object({
    orderId: uuid,
    promisedOn: date,
    deliveryAddress: z.string().trim().min(1).max(1000),
    note,
  }),
  async (input, { user, tx }) => {
    await requirePermission(user, 'create_sale');
    const order = await lockOrder(tx, user.businessId, input.orderId);
    if (order.status !== 'open') throw new Error('This order remainder is cancelled');
    await tx
      .update(customerOrders)
      .set({
        promisedOn: input.promisedOn,
        deliveryAddress: input.deliveryAddress,
        updatedAt: new Date(),
      })
      .where(and(eq(customerOrders.id, order.id), eq(customerOrders.businessId, user.businessId)));
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'order.reschedule',
      entity: 'customer_order',
      entityId: order.id,
      before: { promisedOn: order.promisedOn, deliveryAddress: order.deliveryAddress },
      after: input,
    });
    refresh(order.id);
    return { id: order.id };
  },
);
