'use server';
import { ingredientValue, kitchenCosts, recipeQuantity } from '@/lib/kitchen-policy';
import { type OrderTx, requestHash } from '@/lib/order-ledger';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { indiaToday, stockText, stockUnits, validExpiry } from '@/lib/stock-batch-policy';
import { moveStockBatches } from '@/lib/stock-batches';
import {
  auditLogs,
  damageLogs,
  kitchenConsumptions,
  kitchenRecipeItems,
  kitchenRecipes,
  kitchenTickets,
  kitchenWaste,
  products,
} from '@mybizone/db';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';
const uuid = z.string().uuid();
const optionalBatch = uuid
  .optional()
  .or(z.literal(''))
  .transform((v) => v || undefined);
const qty = z
  .string()
  .regex(/^\d{1,9}(?:\.\d{1,3})?$/)
  .refine((v) => stockUnits(v) > 0, 'Quantity must be positive')
  .transform((v) => stockText(stockUnits(v)));
const note = z.string().trim().max(500).default('');
const hash = (input: unknown) => requestHash(input);
async function requestLock(tx: OrderTx, businessId: string, id: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`kitchen:${businessId}:${id}`},0))`,
  );
}
function refresh(id?: string) {
  for (const path of [
    '/kitchen',
    '/kitchen/recipes',
    '/kitchen/waste',
    '/products',
    '/inventory/batches',
    '/dashboard',
    '/sales/new',
    ...(id ? [`/kitchen/${id}`] : []),
  ])
    revalidatePath(path);
}
async function audit(
  tx: OrderTx,
  businessId: string,
  actorId: string,
  action: string,
  id: string,
  after: Record<string, unknown>,
) {
  await tx
    .insert(auditLogs)
    .values({ businessId, actorId, action, entity: 'kitchen', entityId: id, after });
}
async function recipe(tx: OrderTx, businessId: string, id: string) {
  const [r] = await tx
    .select()
    .from(kitchenRecipes)
    .where(and(eq(kitchenRecipes.id, id), eq(kitchenRecipes.businessId, businessId)))
    .for('share');
  if (!r) throw new Error('Recipe not found');
  const items = await tx
    .select()
    .from(kitchenRecipeItems)
    .where(and(eq(kitchenRecipeItems.recipeId, id), eq(kitchenRecipeItems.businessId, businessId)))
    .orderBy(asc(kitchenRecipeItems.productId));
  if (!items.length) throw new Error('Recipe needs ingredients');
  return { r, items };
}
async function stockRows(tx: OrderTx, businessId: string, ids: string[], lock: 'share' | 'update') {
  return tx
    .select()
    .from(products)
    .where(and(eq(products.businessId, businessId), inArray(products.id, [...new Set(ids)])))
    .orderBy(asc(products.id))
    .for(lock);
}
function validateProduct(
  p: typeof products.$inferSelect | undefined,
  storeId: string,
  unitType: string,
  unitSymbol: string,
) {
  if (
    !p?.active ||
    p.storeId !== storeId ||
    p.unitType !== unitType ||
    p.unitSymbol !== unitSymbol ||
    p.serialTracking
  )
    throw new Error(
      'Product is unavailable or its store, units or tracking changed. Replace the recipe before preparing.',
    );
}
export const createRecipeAction = safeAction(
  z.object({
    id: uuid,
    outputProductId: uuid,
    name: z.string().trim().min(1).max(100),
    yieldQty: qty,
    items: z
      .array(z.object({ productId: uuid, qty }))
      .min(1)
      .max(50),
  }),
  async (input, { user, tx }) => {
    await requestLock(tx, user.businessId, input.id);
    const rows = await stockRows(
      tx,
      user.businessId,
      [input.outputProductId, ...input.items.map((i) => i.productId)],
      'share',
    );
    const output = rows.find((p) => p.id === input.outputProductId);
    if (!output?.active || output.serialTracking)
      throw new Error('Choose an active, non-serial output product');
    await requirePermission(user, 'manage_products', { storeId: output.storeId });
    await requirePermission(user, 'manage_inventory', { storeId: output.storeId });
    const fingerprint = hash(input);
    const [old] = await tx
      .select()
      .from(kitchenRecipes)
      .where(and(eq(kitchenRecipes.id, input.id), eq(kitchenRecipes.businessId, user.businessId)));
    if (old) {
      if (old.requestHash !== fingerprint)
        throw new Error('Request ID already used for another recipe');
      return { id: old.id };
    }
    if (
      new Set(input.items.map((i) => i.productId)).size !== input.items.length ||
      input.items.some((i) => i.productId === output.id)
    )
      throw new Error('Use distinct ingredients and a separate output product');
    recipeQuantity(input.yieldQty, 1, output.unitType);
    const items = input.items.map((i) => {
      const p = rows.find((p) => p.id === i.productId);
      if (!p) throw new Error('Ingredient not found');
      validateProduct(p, output.storeId, p.unitType, p.unitSymbol);
      recipeQuantity(i.qty, 1, p.unitType);
      return {
        businessId: user.businessId,
        recipeId: input.id,
        productId: p.id,
        productName: p.name,
        unitType: p.unitType,
        unitSymbol: p.unitSymbol,
        qty: i.qty,
      };
    });
    await tx.insert(kitchenRecipes).values({
      id: input.id,
      businessId: user.businessId,
      storeId: output.storeId,
      outputProductId: output.id,
      name: input.name,
      outputName: output.name,
      unitType: output.unitType,
      unitSymbol: output.unitSymbol,
      yieldQty: input.yieldQty,
      requestHash: fingerprint,
      createdBy: user.id,
    });
    await tx.insert(kitchenRecipeItems).values(items);
    await audit(tx, user.businessId, user.id, 'kitchen.recipe.create', input.id, {
      name: input.name,
      outputProductId: output.id,
    });
    refresh();
    return { id: input.id };
  },
);
export const archiveRecipeAction = safeAction(
  z.object({ id: uuid }),
  async (input, { user, tx }) => {
    const [r] = await tx
      .select()
      .from(kitchenRecipes)
      .where(and(eq(kitchenRecipes.id, input.id), eq(kitchenRecipes.businessId, user.businessId)))
      .for('update');
    if (!r) throw new Error('Recipe not found');
    await requirePermission(user, 'manage_products', { storeId: r.storeId });
    await requirePermission(user, 'manage_inventory', { storeId: r.storeId });
    if (r.active) {
      await tx.update(kitchenRecipes).set({ active: false }).where(eq(kitchenRecipes.id, r.id));
      await audit(tx, user.businessId, user.id, 'kitchen.recipe.archive', r.id, {});
    }
    refresh();
    return { id: r.id };
  },
);
export const createKitchenTicketAction = safeAction(
  z.object({
    id: uuid,
    recipeId: uuid,
    runs: z.coerce.number().int().min(1).max(10000),
    reference: z.string().trim().min(1).max(100),
    note,
  }),
  async (input, { user, tx }) => {
    await requestLock(tx, user.businessId, input.id);
    const { r, items } = await recipe(tx, user.businessId, input.recipeId);
    await requirePermission(user, 'manage_inventory', { storeId: r.storeId });
    const fingerprint = hash(input);
    const [old] = await tx
      .select()
      .from(kitchenTickets)
      .where(and(eq(kitchenTickets.id, input.id), eq(kitchenTickets.businessId, user.businessId)));
    if (old) {
      if (old.requestHash !== fingerprint)
        throw new Error('Request ID already used for another ticket');
      return { id: old.id };
    }
    if (!r.active) throw new Error('Recipe is archived. Choose its replacement.');
    const rows = await stockRows(
      tx,
      user.businessId,
      [r.outputProductId, ...items.map((i) => i.productId)],
      'share',
    );
    validateProduct(
      rows.find((p) => p.id === r.outputProductId),
      r.storeId,
      r.unitType,
      r.unitSymbol,
    );
    recipeQuantity(r.yieldQty, input.runs, r.unitType);
    for (const i of items) {
      validateProduct(
        rows.find((p) => p.id === i.productId),
        r.storeId,
        i.unitType,
        i.unitSymbol,
      );
      recipeQuantity(i.qty, input.runs, i.unitType);
    }
    await tx.insert(kitchenTickets).values({
      ...input,
      businessId: user.businessId,
      storeId: r.storeId,
      requestHash: fingerprint,
      createdBy: user.id,
    });
    await audit(tx, user.businessId, user.id, 'kitchen.ticket.create', input.id, {
      recipeId: r.id,
      runs: input.runs,
    });
    refresh();
    return { id: input.id };
  },
);
async function lockedTicket(tx: OrderTx, businessId: string, id: string) {
  const [t] = await tx
    .select()
    .from(kitchenTickets)
    .where(and(eq(kitchenTickets.id, id), eq(kitchenTickets.businessId, businessId)))
    .for('update');
  if (!t) throw new Error('Kitchen ticket not found');
  return t;
}
export const changeKitchenTicketAction = safeAction(
  z.object({ id: uuid, status: z.enum(['preparing', 'cancelled']) }),
  async (input, { user, tx }) => {
    const t = await lockedTicket(tx, user.businessId, input.id);
    await requirePermission(user, 'manage_inventory', { storeId: t.storeId });
    if (t.status === input.status) return { id: t.id };
    if (
      t.status === 'completed' ||
      t.status === 'cancelled' ||
      (input.status === 'preparing' && t.status !== 'queued')
    )
      throw new Error('This kitchen ticket is already closed');
    await tx
      .update(kitchenTickets)
      .set({ status: input.status })
      .where(eq(kitchenTickets.id, t.id));
    await audit(tx, user.businessId, user.id, `kitchen.ticket.${input.status}`, t.id, {});
    refresh(t.id);
    return { id: t.id };
  },
);
export const completeKitchenTicketAction = safeAction(
  z.object({
    id: uuid,
    actualOutput: qty,
    batchCode: z.string().trim().max(80).default(''),
    expiresOn: z.string().default(''),
    note,
  }),
  async (input, { user, tx }) => {
    const t = await lockedTicket(tx, user.businessId, input.id);
    await requirePermission(user, 'manage_inventory', { storeId: t.storeId });
    const fingerprint = hash(input);
    if (t.status === 'completed') {
      if (t.completionHash !== fingerprint)
        throw new Error('Ticket was completed with different details');
      return { id: t.id };
    }
    if (t.status !== 'preparing')
      throw new Error('Start preparation before recording the actual yield');
    const { r, items } = await recipe(tx, user.businessId, t.recipeId);
    const rows = await stockRows(
      tx,
      user.businessId,
      [r.outputProductId, ...items.map((i) => i.productId)],
      'update',
    );
    const output = rows.find((p) => p.id === r.outputProductId);
    validateProduct(output, t.storeId, r.unitType, r.unitSymbol);
    if (!output) throw new Error('Output product not found');
    const expected = recipeQuantity(r.yieldQty, t.runs, r.unitType);
    recipeQuantity(input.actualOutput, 1, r.unitType);
    if (stockUnits(input.actualOutput) > stockUnits(expected))
      throw new Error(
        'Actual yield cannot exceed the ticket target. Create another ticket for additional production.',
      );
    if (stockUnits(output.inventory) + stockUnits(input.actualOutput) > 999999999999)
      throw new Error('Output exceeds supported stock precision');
    if (
      output.batchTracking &&
      (!input.batchCode || !validExpiry(input.expiresOn) || input.expiresOn <= indiaToday())
    )
      throw new Error('Prepared batch needs a code and expiry after today');
    if (!output.batchTracking && (input.batchCode || input.expiresOn))
      throw new Error('Output does not use batch tracking. Refresh the ticket.');
    const consumed = items.map((i) => {
      const p = rows.find((p) => p.id === i.productId);
      validateProduct(p, t.storeId, i.unitType, i.unitSymbol);
      if (!p) throw new Error('Ingredient not found');
      const quantity = recipeQuantity(i.qty, t.runs, i.unitType);
      if (stockUnits(p.inventory) < stockUnits(quantity))
        throw new Error(`Insufficient ingredient stock: ${i.productName}`);
      return { i, p, qty: quantity, cost: p.costPrice };
    });
    const costs = kitchenCosts(consumed, input.actualOutput, output.inventory, output.costPrice);
    for (const line of consumed) {
      await tx
        .update(products)
        .set({ inventory: sql`${products.inventory}-${line.qty}::numeric`, updatedAt: new Date() })
        .where(and(eq(products.id, line.p.id), eq(products.businessId, user.businessId)));
      await moveStockBatches(tx, {
        businessId: user.businessId,
        productId: line.p.id,
        qty: line.qty,
        kind: 'kitchen_use',
        documentId: t.id,
      });
      await tx.insert(kitchenConsumptions).values({
        businessId: user.businessId,
        ticketId: t.id,
        productId: line.p.id,
        productName: line.i.productName,
        unitSymbol: line.i.unitSymbol,
        qty: line.qty,
        costPerUnit: line.cost,
        totalValue: ingredientValue(line.qty, line.cost),
      });
    }
    await tx
      .update(products)
      .set({
        inventory: sql`${products.inventory}+${input.actualOutput}::numeric`,
        costPrice: costs.blended,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, output.id), eq(products.businessId, user.businessId)));
    await moveStockBatches(tx, {
      businessId: user.businessId,
      productId: output.id,
      qty: input.actualOutput,
      kind: 'kitchen_output',
      documentId: t.id,
      batchCode: input.batchCode,
      expiresOn: input.expiresOn,
    });
    await tx
      .update(kitchenTickets)
      .set({
        status: 'completed',
        completionHash: fingerprint,
        actualOutput: input.actualOutput,
        ingredientCost: costs.total,
        unitCost: costs.unit,
        batchCode: output.batchTracking ? input.batchCode : null,
        expiresOn: output.batchTracking ? input.expiresOn : null,
        completionNote: input.note,
        completedAt: new Date(),
        completedBy: user.id,
      })
      .where(eq(kitchenTickets.id, t.id));
    await audit(tx, user.businessId, user.id, 'kitchen.ticket.complete', t.id, {
      actualOutput: input.actualOutput,
      ingredientCost: costs.total,
    });
    refresh(t.id);
    return { id: t.id };
  },
);
export const recordKitchenWasteAction = safeAction(
  z.object({
    id: uuid,
    productId: uuid,
    qty,
    batchId: optionalBatch,
    reason: z.enum(['preparation', 'unsold', 'spillage', 'expired', 'other']),
    note: z.string().trim().min(1).max(500),
  }),
  async (input, { user, tx }) => {
    await requestLock(tx, user.businessId, input.id);
    const [p] = await stockRows(tx, user.businessId, [input.productId], 'update');
    if (!p?.active || p.serialTracking) throw new Error('Choose active, non-serial kitchen stock');
    await requirePermission(user, 'manage_inventory', { storeId: p.storeId });
    const fingerprint = hash(input);
    const [old] = await tx
      .select()
      .from(kitchenWaste)
      .where(and(eq(kitchenWaste.id, input.id), eq(kitchenWaste.businessId, user.businessId)));
    if (old) {
      if (old.requestHash !== fingerprint)
        throw new Error('Request ID already used for another waste record');
      return { id: old.id };
    }
    recipeQuantity(input.qty, 1, p.unitType);
    if (stockUnits(p.inventory) < stockUnits(input.qty))
      throw new Error('Waste exceeds physical stock');
    await tx.insert(damageLogs).values({
      id: input.id,
      businessId: user.businessId,
      productId: p.id,
      productName: p.name,
      qty: input.qty,
      unitSymbol: p.unitSymbol,
      costPerUnit: p.costPrice,
      totalValue: ingredientValue(input.qty, p.costPrice),
      reason:
        input.reason === 'expired' ? 'expired' : input.reason === 'spillage' ? 'spillage' : 'other',
      notes: `Kitchen waste · ${input.reason} · ${input.note}`,
      loggedBy: user.id,
    });
    await tx.insert(kitchenWaste).values({
      id: input.id,
      businessId: user.businessId,
      storeId: p.storeId,
      damageId: input.id,
      reason: input.reason,
      requestHash: fingerprint,
    });
    await tx
      .update(products)
      .set({ inventory: sql`${products.inventory}-${input.qty}::numeric`, updatedAt: new Date() })
      .where(and(eq(products.id, p.id), eq(products.businessId, user.businessId)));
    await moveStockBatches(tx, {
      businessId: user.businessId,
      productId: p.id,
      qty: input.qty,
      kind: 'damage',
      documentId: input.id,
      batchId: input.batchId,
    });
    await audit(tx, user.businessId, user.id, 'kitchen.waste', input.id, {
      productId: p.id,
      qty: input.qty,
      reason: input.reason,
    });
    refresh();
    return { id: input.id };
  },
);
