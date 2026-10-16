import { type Database, purchases, sales, stockSerialEvents, stockSerials } from '@mybizone/db';
import { and, eq, inArray } from 'drizzle-orm';
import { serialCodes, serialCount, warrantyEnd } from './serial-policy';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export interface SerialProduct {
  id: string;
  inventory: string;
  serialTrackingSince: Date | null;
  warrantyMonths: number;
  warrantyIssuer: string | null;
}
export interface SerialMove {
  businessId: string;
  productId: string;
  qty: string;
  kind: 'purchase' | 'sale' | 'sales_return' | 'purchase_return' | 'damage';
  documentId: string;
  serialNumbers?: string[];
  originalSaleId?: string;
  originalPurchaseId?: string;
}
export async function moveStockSerials(tx: Tx, input: SerialMove, product: SerialProduct) {
  const { businessId, productId, kind, documentId } = input;
  const count = serialCount(input.qty);
  const codes = serialCodes(input.serialNumbers ?? []);
  if (!count || codes.length !== count)
    throw new Error('Enter one distinct serial number for every piece');
  const rows = await tx
    .select()
    .from(stockSerials)
    .where(and(eq(stockSerials.businessId, businessId), eq(stockSerials.productId, productId)))
    .for('update');
  const physical = rows.filter((row) => ['available', 'quarantine'].includes(row.state)).length;
  const incoming = kind === 'purchase' || kind === 'sales_return';
  if (physical + (incoming ? count : -count) !== serialCount(product.inventory))
    throw new Error('Serial stock needs reconciliation; no transaction was saved');
  let saleDate: Date | undefined;
  let receiptDate: Date | undefined;
  if (kind === 'purchase_return') {
    if (!input.originalPurchaseId) throw new Error('Original purchase is required');
    const [receipt] = await tx
      .select({ at: purchases.createdAt })
      .from(purchases)
      .where(and(eq(purchases.id, input.originalPurchaseId), eq(purchases.businessId, businessId)));
    if (!receipt) throw new Error('Original purchase not found');
    receiptDate = receipt.at;
  }
  if (kind === 'sale' || kind === 'sales_return') {
    const saleId = kind === 'sale' ? documentId : input.originalSaleId;
    if (!saleId) throw new Error('Original sale is required');
    const [sale] = await tx
      .select({ at: sales.createdAt })
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.businessId, businessId)));
    if (!sale) throw new Error('Sale not found');
    saleDate = sale.at;
  }
  for (const code of codes) {
    let unit = rows.find((row) => row.code === code);
    let target: string;
    if (kind === 'purchase') {
      if (unit && unit.state !== 'supplier_return')
        throw new Error(`Serial ${code} is already registered`);
      target = 'available';
    } else if (kind === 'sales_return') {
      if (unit && (unit.state !== 'sold' || unit.lastSaleId !== input.originalSaleId))
        throw new Error(`Serial ${code} was not sold on this bill or has already been returned`);
      if (
        !unit &&
        (!product.serialTrackingSince || !saleDate || saleDate >= product.serialTrackingSince)
      )
        throw new Error(`Serial ${code} was not sold on this bill`);
      target = 'quarantine';
    } else {
      if (
        !unit ||
        !(kind === 'sale' ? ['available'] : ['available', 'quarantine']).includes(unit.state)
      )
        throw new Error(`Serial ${code} is unavailable for this transaction`);
      if (
        kind === 'purchase_return' &&
        unit.receiptId &&
        unit.receiptId !== input.originalPurchaseId
      )
        throw new Error(`Serial ${code} was not received on the original purchase`);
      if (
        kind === 'purchase_return' &&
        !unit.receiptId &&
        (!receiptDate || !product.serialTrackingSince || receiptDate >= product.serialTrackingSince)
      )
        throw new Error(`Opening serial ${code} was not received on this purchase`);
      target = kind === 'sale' ? 'sold' : kind === 'damage' ? 'damaged' : 'supplier_return';
    }
    if (!unit) {
      const duplicates = await tx
        .select({ id: stockSerials.id })
        .from(stockSerials)
        .where(and(eq(stockSerials.businessId, businessId), eq(stockSerials.code, code)));
      if (duplicates.length) throw new Error(`Serial ${code} belongs to another product`);
      const [created] = await tx
        .insert(stockSerials)
        .values({
          businessId,
          productId,
          code,
          state: target,
          receiptId: kind === 'purchase' ? documentId : null,
          lastSaleId: kind === 'sales_return' ? input.originalSaleId : null,
        })
        .returning();
      if (!created) throw new Error('Serial receipt failed');
      unit = created;
    } else {
      await tx
        .update(stockSerials)
        .set({
          state: target,
          ...(kind === 'purchase' ? { receiptId: documentId } : {}),
          ...(kind === 'sale' ? { lastSaleId: documentId } : {}),
        })
        .where(eq(stockSerials.id, unit.id));
    }
    const months = kind === 'sale' ? product.warrantyMonths : 0;
    await tx.insert(stockSerialEvents).values({
      businessId,
      serialId: unit.id,
      kind,
      documentId,
      relatedSaleId: kind === 'sales_return' ? input.originalSaleId : null,
      warrantyMonths: months,
      warrantyEndsOn: months && saleDate ? warrantyEnd(saleDate, months) : null,
      warrantyIssuer: months ? product.warrantyIssuer : null,
    });
  }
}

export async function serialChoices(tx: Tx, businessId: string, productIds?: string[]) {
  if (productIds && !productIds.length) return [];
  return tx
    .select({
      code: stockSerials.code,
      productId: stockSerials.productId,
      state: stockSerials.state,
    })
    .from(stockSerials)
    .where(
      and(
        eq(stockSerials.businessId, businessId),
        inArray(stockSerials.state, ['available', 'quarantine']),
        productIds ? inArray(stockSerials.productId, productIds) : undefined,
      ),
    )
    .orderBy(stockSerials.code)
    .limit(5000);
}
