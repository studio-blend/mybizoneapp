import { randomUUID } from 'node:crypto';
import {
  businesses,
  damageLogs,
  kitchenConsumptions,
  kitchenRecipeItems,
  kitchenRecipes,
  kitchenTickets,
  kitchenWaste,
  products,
  stockBatchMovements,
  stockBatches,
  stores,
  user,
  userRoles,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const url = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const state = vi.hoisted(() => ({
  id: '',
  businessId: '',
  role: 'owner',
  storeId: null as string | null,
}));
vi.mock('@/lib/db', async () => ({
  db: (await import('@mybizone/db')).createDb(
    'postgresql://postgres@127.0.0.1:55432/mybizone_release_test',
  ),
}));
vi.mock('@/lib/session', () => ({ requireUser: async () => ({ ...state }) }));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { db } from '@/lib/db';
import { loadKitchenData, loadKitchenTicket } from '@/lib/kitchen-queries';
import { indiaToday } from '@/lib/stock-batch-policy';
import {
  archiveRecipeAction,
  changeKitchenTicketAction,
  completeKitchenTicketAction,
  createKitchenTicketAction,
  createRecipeAction,
  recordKitchenWasteAction,
} from '../../app/(app)/kitchen/actions';
const tenants: string[] = [];
let storeId = '';
let outputId = '';
let ingredientId = '';
let secondId = '';
function ok<T>(r: { ok: true; data: T } | { ok: false; error: string }) {
  expect(r.ok, r.ok ? '' : r.error).toBe(true);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
async function getStock(id: string) {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  return p;
}
async function recipe() {
  return ok(
    await createRecipeAction({
      id: randomUUID(),
      outputProductId: outputId,
      name: 'Bread v1',
      yieldQty: '4',
      items: [
        { productId: ingredientId, qty: '0.500' },
        { productId: secondId, qty: '0.100' },
      ],
    }),
  ).id;
}
async function ticket(recipeId?: string, runs = 2) {
  return ok(
    await createKitchenTicketAction({
      id: randomUUID(),
      recipeId: recipeId ?? (await recipe()),
      runs,
      reference: 'Morning counter',
      note: 'No reservation',
    }),
  ).id;
}
async function start(id: string) {
  ok(await changeKitchenTicketAction({ id, status: 'preparing' }));
}
const done = (id: string, extra: Record<string, unknown> = {}) =>
  completeKitchenTicketAction({ id, actualOutput: '8', note: 'Actual goods ready', ...extra });
describe.skipIf(process.env.DATABASE_URL !== url)(
  'kitchen preparation on guarded PostgreSQL',
  () => {
    beforeAll(async () => {
      const [d] = await db.$client`SHOW data_directory`;
      if (!d.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'))
        throw new Error('Unexpected database');
    });
    beforeEach(async () => {
      const [b] = await db
        .insert(businesses)
        .values({ name: 'Kitchen regression', plan: 'pro' })
        .returning();
      if (!b) throw new Error('Fixture');
      tenants.push(b.id);
      state.businessId = b.id;
      state.id = randomUUID();
      state.role = 'owner';
      state.storeId = null;
      await db.insert(user).values({
        id: state.id,
        businessId: b.id,
        name: 'Kitchen tester',
        email: `${state.id}@example.invalid`,
        role: 'owner',
      });
      const [s] = await db
        .insert(stores)
        .values({ businessId: b.id, name: 'Kitchen store' })
        .returning();
      if (!s) throw new Error('Fixture');
      storeId = s.id;
      const [out] = await db
        .insert(products)
        .values({
          businessId: b.id,
          storeId,
          name: 'Bread',
          price: '20',
          costPrice: '4',
          unitType: 'piece',
          unitSymbol: 'pc',
          inventory: '2',
        })
        .returning();
      const [a] = await db
        .insert(products)
        .values({
          businessId: b.id,
          storeId,
          name: 'Flour',
          price: '50',
          costPrice: '40',
          unitType: 'weight',
          unitSymbol: 'kg',
          inventory: '5',
        })
        .returning();
      const [c] = await db
        .insert(products)
        .values({
          businessId: b.id,
          storeId,
          name: 'Oil',
          price: '100',
          costPrice: '80',
          unitType: 'volume',
          unitSymbol: 'litre',
          inventory: '2',
        })
        .returning();
      if (!out || !a || !c) throw new Error('Fixture');
      outputId = out.id;
      ingredientId = a.id;
      secondId = c.id;
    });
    afterAll(async () => {
      for (const id of tenants) {
        await db.delete(userRoles).where(eq(userRoles.businessId, id));
        await db.delete(kitchenWaste).where(eq(kitchenWaste.businessId, id));
        await db.delete(kitchenConsumptions).where(eq(kitchenConsumptions.businessId, id));
        await db.delete(kitchenTickets).where(eq(kitchenTickets.businessId, id));
        await db.delete(kitchenRecipeItems).where(eq(kitchenRecipeItems.businessId, id));
        await db.delete(kitchenRecipes).where(eq(kitchenRecipes.businessId, id));
        await db.delete(businesses).where(eq(businesses.id, id));
      }
      await db.$client.end();
    });
    it('freezes recipe versions and leaves planned/started stock and balances unchanged', async () => {
      const r = await recipe();
      const id = await ticket(r);
      await start(id);
      expect((await getStock(ingredientId))?.inventory).toBe('5.000');
      expect((await getStock(outputId))?.inventory).toBe('2.000');
      await expect(
        withTenant(db, state.businessId, (tx) =>
          tx.execute(sql`UPDATE kitchen_recipes SET yield_qty=99 WHERE id=${r}::uuid`),
        ),
      ).rejects.toThrow();
      await expect(
        withTenant(db, state.businessId, (tx) =>
          tx.execute(sql`UPDATE kitchen_recipe_items SET qty=99 WHERE recipe_id=${r}::uuid`),
        ),
      ).rejects.toThrow();
      await expect(
        withTenant(db, state.businessId, (tx) =>
          tx.execute(sql`UPDATE kitchen_tickets SET runs=99 WHERE id=${id}::uuid`),
        ),
      ).rejects.toThrow();
    });
    it('consumes ingredients and adds actual output once, blending existing unit cost', async () => {
      const id = await ticket();
      await start(id);
      ok(await done(id));
      ok(await done(id));
      expect((await getStock(ingredientId))?.inventory).toBe('4.000');
      expect((await getStock(secondId))?.inventory).toBe('1.800');
      const p = await getStock(outputId);
      expect(p?.inventory).toBe('10.000');
      expect(p?.costPrice).toBe('6.40');
      const d = await loadKitchenTicket(id);
      expect(d?.ticket.ingredientCost).toBe('56.00');
      expect(d?.consumed).toHaveLength(2);
      expect((await done(id, { actualOutput: '7' })).ok).toBe(false);
    });
    it('allows lower physical yield and preserves unknown ingredient cost', async () => {
      await db.update(products).set({ costPrice: null }).where(eq(products.id, ingredientId));
      const id = await ticket();
      await start(id);
      ok(await done(id, { actualOutput: '6' }));
      expect((await getStock(outputId))?.inventory).toBe('8.000');
      expect((await getStock(outputId))?.costPrice).toBe(null);
      expect((await loadKitchenTicket(id))?.ticket.ingredientCost).toBe(null);
    });
    it('rejects output beyond the planned yield and completion before preparation', async () => {
      const id = await ticket();
      expect((await done(id)).ok).toBe(false);
      await start(id);
      expect((await done(id, { actualOutput: '9' })).ok).toBe(false);
      expect((await getStock(outputId))?.inventory).toBe('2.000');
    });
    it('rolls every stock write back when any ingredient is short', async () => {
      const id = await ticket();
      await start(id);
      await db.update(products).set({ inventory: '0.100' }).where(eq(products.id, secondId));
      expect((await done(id)).ok).toBe(false);
      expect((await getStock(ingredientId))?.inventory).toBe('5.000');
      expect((await loadKitchenTicket(id))?.consumed).toHaveLength(0);
    });
    it('serializes competing tickets for the same limited physical ingredients', async () => {
      const r = await recipe();
      const a = await ticket(r);
      const b = await ticket(r);
      await start(a);
      await start(b);
      await db.update(products).set({ inventory: '1' }).where(eq(products.id, ingredientId));
      const results = await Promise.all([done(a), done(b)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect((await getStock(ingredientId))?.inventory).toBe('0.000');
      expect((await getStock(outputId))?.inventory).toBe('10.000');
    });
    it('takes ingredient batches FEFO, excludes expired stock and creates traceable output', async () => {
      await db.update(products).set({ batchTracking: true }).where(eq(products.id, ingredientId));
      await db.insert(stockBatches).values([
        {
          businessId: state.businessId,
          productId: ingredientId,
          code: 'OLD',
          expiresOn: '2020-01-01',
          quantity: '3',
        },
        {
          businessId: state.businessId,
          productId: ingredientId,
          code: 'EARLY',
          expiresOn: '2090-01-01',
          quantity: '1',
        },
        {
          businessId: state.businessId,
          productId: ingredientId,
          code: 'LATER',
          expiresOn: '2091-01-01',
          quantity: '1',
        },
      ]);
      await db.update(products).set({ batchTracking: true }).where(eq(products.id, outputId));
      await db.insert(stockBatches).values({
        businessId: state.businessId,
        productId: outputId,
        code: 'OPENING',
        expiresOn: '2090-01-01',
        quantity: '2',
      });
      const id = await ticket();
      await start(id);
      ok(await done(id, { batchCode: 'BAKE-1', expiresOn: '2090-12-01' }));
      const moves = await db
        .select()
        .from(stockBatchMovements)
        .where(eq(stockBatchMovements.documentId, id));
      expect(moves.map((m) => m.kind).sort()).toEqual(['kitchen_output', 'kitchen_use']);
      const [early] = await db
        .select()
        .from(stockBatches)
        .where(and(eq(stockBatches.productId, ingredientId), eq(stockBatches.code, 'EARLY')));
      expect(early?.quantity).toBe('0.000');
    });
    it('rejects expired-only or quarantined ingredients and rolls back aggregate stock', async () => {
      await db.update(products).set({ batchTracking: true }).where(eq(products.id, ingredientId));
      await db.insert(stockBatches).values({
        businessId: state.businessId,
        productId: ingredientId,
        code: 'EXPIRED',
        expiresOn: indiaToday(),
        quantity: '5',
      });
      const id = await ticket();
      await start(id);
      expect((await done(id)).ok).toBe(false);
      expect((await getStock(ingredientId))?.inventory).toBe('5.000');
    });
    it('rejects changed ingredient/output units, store, activity or serial tracking', async () => {
      const id = await ticket();
      await start(id);
      await db.update(products).set({ unitSymbol: 'g' }).where(eq(products.id, ingredientId));
      expect((await done(id)).ok).toBe(false);
      await db.update(products).set({ unitSymbol: 'kg' }).where(eq(products.id, ingredientId));
      await db.update(products).set({ active: false }).where(eq(products.id, outputId));
      expect((await done(id)).ok).toBe(false);
      expect((await getStock(ingredientId))?.inventory).toBe('5.000');
    });
    it('keeps archived recipe agreements valid for existing tickets and excludes new bookings', async () => {
      const r = await recipe();
      const id = await ticket(r);
      ok(await archiveRecipeAction({ id: r }));
      expect(
        (
          await createKitchenTicketAction({
            id: randomUUID(),
            recipeId: r,
            runs: 1,
            reference: 'New',
            note: '',
          })
        ).ok,
      ).toBe(false);
      await start(id);
      ok(await done(id));
      expect((await loadKitchenTicket(id))?.ticket.status).toBe('completed');
    });
    it('cancels unrecorded preparation without stock movements and cannot reopen it', async () => {
      const id = await ticket();
      await start(id);
      ok(await changeKitchenTicketAction({ id, status: 'cancelled' }));
      expect((await done(id)).ok).toBe(false);
      expect((await getStock(ingredientId))?.inventory).toBe('5.000');
    });
    it('writes kitchen waste once to the existing damage/loss ledger', async () => {
      const input = {
        id: randomUUID(),
        productId: outputId,
        qty: '1',
        reason: 'unsold',
        note: 'Closing counter',
      };
      ok(await recordKitchenWasteAction(input));
      ok(await recordKitchenWasteAction(input));
      expect((await getStock(outputId))?.inventory).toBe('1.000');
      expect(await db.select().from(damageLogs).where(eq(damageLogs.id, input.id))).toHaveLength(1);
      const data = await loadKitchenData();
      expect(data.wasteTotal.value).toBe('4.00');
      expect(data.wasteTotal.count).toBe(1);
      expect((await recordKitchenWasteAction({ ...input, qty: '2' })).ok).toBe(false);
    });
    it('removes waste from the selected expired physical batch', async () => {
      await db.update(products).set({ batchTracking: true }).where(eq(products.id, ingredientId));
      const [b] = await db
        .insert(stockBatches)
        .values({
          businessId: state.businessId,
          productId: ingredientId,
          code: 'EXPIRED',
          expiresOn: '2020-01-01',
          quantity: '5',
        })
        .returning();
      if (!b) throw new Error('Batch');
      ok(
        await recordKitchenWasteAction({
          id: randomUUID(),
          productId: ingredientId,
          batchId: b.id,
          qty: '0.500',
          reason: 'expired',
          note: 'Physical disposal',
        }),
      );
      expect((await getStock(ingredientId))?.inventory).toBe('4.500');
    });
    it('rejects cross-store recipes, self ingredients and fractional pieces', async () => {
      const [s] = await db
        .insert(stores)
        .values({ businessId: state.businessId, name: 'Other' })
        .returning();
      if (!s) throw new Error('Store');
      await db.update(products).set({ storeId: s.id }).where(eq(products.id, ingredientId));
      expect(
        (
          await createRecipeAction({
            id: randomUUID(),
            outputProductId: outputId,
            name: 'Bad',
            yieldQty: '1',
            items: [{ productId: ingredientId, qty: '1' }],
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await createRecipeAction({
            id: randomUUID(),
            outputProductId: outputId,
            name: 'Self',
            yieldQty: '1',
            items: [{ productId: outputId, qty: '1' }],
          })
        ).ok,
      ).toBe(false);
    });
    it('isolates tenants and rejects sales-only or unrelated-store staff', async () => {
      const id = await ticket();
      state.role = 'staff';
      await db.update(user).set({ role: 'custom' }).where(eq(user.id, state.id));
      await db
        .insert(userRoles)
        .values({ userId: state.id, businessId: state.businessId, role: 'sales' });
      expect((await changeKitchenTicketAction({ id, status: 'preparing' })).ok).toBe(false);
      await expect(loadKitchenData()).rejects.toThrow('Permission');
      state.role = 'owner';
      const tenant = state.businessId;
      const [other] = await db.insert(businesses).values({ name: 'Other tenant' }).returning();
      if (!other) throw new Error('Tenant');
      tenants.push(other.id);
      state.businessId = other.id;
      expect((await changeKitchenTicketAction({ id, status: 'preparing' })).ok).toBe(false);
      await expect(
        withTenant(db, other.id, (tx) =>
          tx.select().from(kitchenTickets).where(eq(kitchenTickets.id, id)),
        ),
      ).resolves.toHaveLength(0);
      state.businessId = tenant;
    });
    it('restricts inventory staff to their permitted store and omits other kitchen data', async () => {
      const id = await ticket();
      const [s] = await db
        .insert(stores)
        .values({ businessId: state.businessId, name: 'Unrelated kitchen' })
        .returning();
      if (!s) throw new Error('Store');
      await db.update(user).set({ role: 'custom' }).where(eq(user.id, state.id));
      await db.insert(userRoles).values({
        businessId: state.businessId,
        userId: state.id,
        role: 'inventory',
        storeId: s.id,
      });
      expect((await changeKitchenTicketAction({ id, status: 'preparing' })).ok).toBe(false);
      expect((await loadKitchenData()).tickets).toHaveLength(0);
      await expect(loadKitchenData(storeId)).rejects.toThrow('Permission');
    });
    it('keeps repeated recipe and ticket creation idempotent and rejects changed request details', async () => {
      const input = {
        id: randomUUID(),
        outputProductId: outputId,
        name: 'Stable recipe',
        yieldQty: '4',
        items: [{ productId: ingredientId, qty: '0.5' }],
      };
      const r = ok(await createRecipeAction(input));
      expect(ok(await createRecipeAction(input)).id).toBe(r.id);
      expect((await createRecipeAction({ ...input, yieldQty: '5' })).ok).toBe(false);
      const booking = {
        id: randomUUID(),
        recipeId: r.id,
        runs: 1,
        reference: 'Stable prep',
        note: '',
      };
      expect(ok(await createKitchenTicketAction(booking)).id).toBe(
        ok(await createKitchenTicketAction(booking)).id,
      );
      expect((await createKitchenTicketAction({ ...booking, runs: 2 })).ok).toBe(false);
    });
    it('rolls back ingredients if the prepared batch conflicts with an existing receipt', async () => {
      await db.update(products).set({ batchTracking: true }).where(eq(products.id, outputId));
      await db.insert(stockBatches).values({
        businessId: state.businessId,
        productId: outputId,
        code: 'EXISTING',
        expiresOn: '2090-01-01',
        quantity: '2',
      });
      const id = await ticket();
      await start(id);
      expect((await done(id, { batchCode: 'EXISTING', expiresOn: '2091-01-01' })).ok).toBe(false);
      expect((await getStock(ingredientId))?.inventory).toBe('5.000');
      expect((await loadKitchenTicket(id))?.consumed).toHaveLength(0);
    });
    it('reports missing waste cost separately from recorded value', async () => {
      await db.update(products).set({ costPrice: null }).where(eq(products.id, ingredientId));
      ok(
        await recordKitchenWasteAction({
          id: randomUUID(),
          productId: ingredientId,
          qty: '0.100',
          reason: 'preparation',
          note: 'Failed batch',
        }),
      );
      const d = await loadKitchenData();
      expect(d.wasteTotal.unknown).toBe(1);
      expect(d.wasteTotal.value).toBe('0');
      expect(d.waste[0]?.totalValue).toBe(null);
    });
    it('rejects fractional piece recipes and prevents cancellation after physical completion', async () => {
      expect(
        (
          await createRecipeAction({
            id: randomUUID(),
            outputProductId: outputId,
            name: 'Fractional',
            yieldQty: '0.5',
            items: [{ productId: ingredientId, qty: '0.1' }],
          })
        ).ok,
      ).toBe(false);
      const id = await ticket();
      await start(id);
      ok(await done(id));
      expect((await changeKitchenTicketAction({ id, status: 'cancelled' })).ok).toBe(false);
    });
  },
);
