import { type Database, products, stockBatchMovements, stockBatches } from '@mybizone/db';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { indiaToday, stockText, stockUnits, validExpiry } from './stock-batch-policy';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Kind = 'purchase' | 'sale' | 'sales_return' | 'purchase_return' | 'damage';

export async function lockedStockProduct(tx: Tx, businessId: string, productId: string) {
  const [product] = await tx
    .select({
      id: products.id,
      storeId: products.storeId,
      inventory: products.inventory,
      batchTracking: products.batchTracking,
      name: products.name,
      active: products.active,
      unitType: products.unitType,
      unitSymbol: products.unitSymbol,
    })
    .from(products)
    .where(and(eq(products.businessId, businessId), eq(products.id, productId)))
    .for('update');
  if (!product) throw new Error('Product not found');
  return product;
}

export async function batchChoices(tx: Tx, businessId: string) {
  return tx
    .select({
      id: stockBatches.id,
      productId: stockBatches.productId,
      code: stockBatches.code,
      expiresOn: stockBatches.expiresOn,
      state: stockBatches.state,
      quantity: stockBatches.quantity,
    })
    .from(stockBatches)
    .where(and(eq(stockBatches.businessId, businessId), gt(stockBatches.quantity, '0')))
    .orderBy(asc(stockBatches.expiresOn), asc(stockBatches.createdAt), asc(stockBatches.id));
}

// Call immediately after the aggregate stock UPDATE, in that same transaction.
// Reload the locked product so activation cannot race a stale checkout snapshot.
export async function moveStockBatches(
  tx: Tx,
  input: {
    businessId: string;
    productId: string;
    qty: string;
    kind: Kind;
    documentId: string;
    batchId?: string;
    batchCode?: string;
    expiresOn?: string;
    originalPurchaseId?: string;
  },
) {
  const { businessId, productId, qty, kind, documentId } = input;
  const product = await lockedStockProduct(tx, businessId, productId);
  if (!product.batchTracking) return;
  const units = stockUnits(qty);
  if (units <= 0) throw new Error('Batch quantity must be positive');
  const batches = await tx
    .select()
    .from(stockBatches)
    .where(and(eq(stockBatches.businessId, businessId), eq(stockBatches.productId, productId)))
    .orderBy(asc(stockBatches.expiresOn), asc(stockBatches.createdAt), asc(stockBatches.id))
    .for('update');
  const incoming = kind === 'purchase' || kind === 'sales_return';
  const total = batches.reduce((n, batch) => n + stockUnits(batch.quantity), 0);
  if (total + (incoming ? units : -units) !== stockUnits(product.inventory))
    throw new Error('Batch stock needs reconciliation; no transaction was saved');

  const movement = async (batchId: string, quantity: string) => {
    await tx
      .insert(stockBatchMovements)
      .values({ businessId, batchId, kind, documentId, quantity });
  };
  if (incoming) {
    const quarantine = kind === 'sales_return';
    const code = quarantine ? `RETURN-${documentId}` : input.batchCode?.trim();
    const expiry = quarantine ? null : input.expiresOn;
    if (!code || code.length > 80 || (!quarantine && (!expiry || !validExpiry(expiry))))
      throw new Error(`Batch code and valid expiry are required for ${product.name}`);
    const existing = batches.find((batch) => batch.code === code);
    if (
      existing &&
      (existing.expiresOn !== expiry ||
        existing.state !== (quarantine ? 'quarantine' : 'available'))
    )
      throw new Error('This batch code already has different expiry or quarantine details');
    let batchId = existing?.id;
    if (existing) {
      await tx
        .update(stockBatches)
        .set({ quantity: stockText(stockUnits(existing.quantity) + units) })
        .where(eq(stockBatches.id, existing.id));
    } else {
      const [created] = await tx
        .insert(stockBatches)
        .values({
          businessId,
          productId,
          code,
          expiresOn: expiry,
          state: quarantine ? 'quarantine' : 'available',
          quantity: qty,
        })
        .returning({ id: stockBatches.id });
      if (!created) throw new Error('Batch receipt failed');
      batchId = created.id;
    }
    await movement(batchId!, qty);
    return;
  }

  if (kind !== 'sale' && !input.batchId) throw new Error('Select the physical batch being removed');
  let candidates =
    kind === 'sale'
      ? batches.filter(
          (batch) =>
            batch.state === 'available' && batch.expiresOn && batch.expiresOn > indiaToday(),
        )
      : batches.filter((batch) => batch.id === input.batchId);
  if (kind === 'purchase_return' && input.originalPurchaseId) {
    const received = await tx
      .select({ batchId: stockBatchMovements.batchId })
      .from(stockBatchMovements)
      .innerJoin(stockBatches, eq(stockBatches.id, stockBatchMovements.batchId))
      .where(
        and(
          eq(stockBatchMovements.businessId, businessId),
          eq(stockBatchMovements.kind, 'purchase'),
          eq(stockBatchMovements.documentId, input.originalPurchaseId),
          eq(stockBatches.productId, productId),
        ),
      );
    // Historical receipts predate tracking. The explicit physical batch is then the operator's assertion.
    if (received.length)
      candidates = candidates.filter((batch) => received.some((item) => item.batchId === batch.id));
  }
  if (candidates.reduce((n, batch) => n + stockUnits(batch.quantity), 0) < units)
    throw new Error(
      kind === 'sale'
        ? `Insufficient sellable batch stock for ${product.name}; check expiry and quarantine`
        : 'Selected batch has insufficient stock or does not belong to the original purchase',
    );
  let remaining = units;
  for (const batch of candidates) {
    if (!remaining) break;
    const taken = Math.min(remaining, stockUnits(batch.quantity));
    if (!taken) continue;
    await tx
      .update(stockBatches)
      .set({ quantity: stockText(stockUnits(batch.quantity) - taken) })
      .where(eq(stockBatches.id, batch.id));
    await movement(batch.id, `-${stockText(taken)}`);
    remaining -= taken;
  }
}

// Keep outer references qualified: Drizzle unqualifies Column objects in a
// single-table SELECT, which would bind them to the subquery's batch instead.
export const sellableStockSql = sql<string>`CASE WHEN "products".batch_tracking THEN
  COALESCE((SELECT sum(b.quantity) FROM stock_batches b WHERE b.product_id = "products".id
    AND b.business_id = "products".business_id AND b.state = 'available'
    AND b.expires_on > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date), 0)::text
  ELSE "products".inventory::text END`;
