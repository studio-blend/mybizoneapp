import { randomUUID } from 'node:crypto';
import { businesses, customers, expenseEntries, sales, stores, user } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { eq, sql } from 'drizzle-orm';
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
import { loadCashbook } from '@/lib/cashbook';
import { creditAgeing } from '@/lib/credit-ageing';
import { db } from '@/lib/db';
import type { MoneyInput } from '@/lib/money-policy';
import { moneyRegister } from '@/lib/money-queries';
import { indiaToday } from '@/lib/stock-batch-policy';
import { moneyCommandAction } from '../../app/(app)/money/actions';
import { createSalesSettlementAction } from '../../app/(app)/settlements/actions';
import { accountingCommandAction } from '../../app/(app)/settlements/funds/actions';
const tenants: string[] = [];
let expenseId = '';
let customerId = '';
let saleId = '';
const today = indiaToday();
const command = (kind: MoneyInput['kind'], extra: Record<string, unknown> = {}) =>
  moneyCommandAction({
    id: randomUUID(),
    kind,
    day: today,
    reference: 'Checked statement',
    note: 'Confirmed by accountant',
    ...extra,
  });
function ok<T>(r: { ok: true; data: T } | { ok: false; error: string }) {
  expect(r.ok, r.ok ? '' : r.error).toBe(true);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
const register = () =>
  withTenant(db, state.businessId, (tx) => moneyRegister(tx, state.businessId));
const account = async (extra: Record<string, unknown> = {}) =>
  ok(await command('account', { name: 'Main till', accountKind: 'cash', amount: '100', ...extra }))
    .id;
const assign = async (id: string, extra: Record<string, unknown> = {}) =>
  ok(
    await command('source', {
      accountId: id,
      sourceKind: 'expense',
      sourceId: expenseId,
      amount: '40',
      ...extra,
    }),
  ).id;
const balance = async (id: string) => (await register()).accounts.find((a) => a.id === id);
const ageing = () =>
  withTenant(db, state.businessId, (tx) => creditAgeing(tx, state.businessId, 'sales'));
describe.skipIf(process.env.DATABASE_URL !== url)('cash and bank on guarded PostgreSQL', () => {
  beforeAll(async () => {
    const [d] = await db.$client`SHOW data_directory`;
    if (!d?.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'))
      throw new Error('Unexpected database');
  });
  beforeEach(async () => {
    const [b] = await db
      .insert(businesses)
      .values({ name: 'Money regression', plan: 'pro' })
      .returning();
    if (!b) throw new Error('fixture');
    tenants.push(b.id);
    state.businessId = b.id;
    state.id = randomUUID();
    state.role = 'owner';
    state.storeId = null;
    await db.insert(user).values({
      id: state.id,
      businessId: b.id,
      name: 'Owner',
      email: `${state.id}@example.invalid`,
      role: 'owner',
    });
    const [e] = await db
      .insert(expenseEntries)
      .values({
        businessId: b.id,
        type: 'expense',
        category: 'Rent',
        amount: '40',
        description: 'Rent evidence',
        paymentMethod: 'cheque',
      })
      .returning();
    if (!e) throw new Error('fixture');
    expenseId = e.id;
    const [c] = await db
      .insert(customers)
      .values({ businessId: b.id, name: 'Customer', outstandingBalance: '100' })
      .returning();
    if (!c) throw new Error('fixture');
    customerId = c.id;
    const [s] = await db.insert(stores).values({ businessId: b.id, name: 'Store' }).returning();
    if (!s) throw new Error('fixture');
    const [sale] = await db
      .insert(sales)
      .values({
        businessId: b.id,
        storeId: s.id,
        customerId,
        billNo: 'CREDIT-1',
        customerName: 'Customer',
        subtotal: '100',
        total: '100',
        paymentMethod: 'credit',
        paymentStatus: 'due',
        billType: 'non_gst_bill',
      })
      .returning();
    if (!sale) throw new Error('fixture');
    saleId = sale.id;
  });
  afterAll(async () => {
    for (const id of tenants) {
      await db.delete(businesses).where(eq(businesses.id, id));
    }
    await db.$client.end();
  });
  it('starts with no asserted bank balance and unassigned source evidence', async () => {
    const d = await register();
    expect(d.accounts).toHaveLength(0);
    expect(d.ready).toBe(false);
    expect(d.unassigned).toHaveLength(1);
  });
  it('records verified cash and signed bank openings', async () => {
    const a = await account();
    const b = await account({ name: 'Bank', accountKind: 'bank', amount: '-50' });
    expect((await balance(a))?.cleared).toBe('100.00');
    expect((await balance(b))?.cleared).toBe('-50.00');
  });
  it('rejects negative cash, blank evidence and future or impossible dates', async () => {
    for (const extra of [
      { amount: '-1' },
      { note: 'x' },
      { reference: '' },
      { day: '2099-01-01' },
      { day: '2026-02-30' },
    ])
      expect(
        (await command('account', { name: 'Till', accountKind: 'cash', amount: '10', ...extra }))
          .ok,
      ).toBe(false);
  });
  it('uses a stable request id once and rejects altered retries across commands', async () => {
    const id = randomUUID();
    await account({ id });
    await account({ id });
    expect((await register()).accounts).toHaveLength(1);
    expect(
      (await command('account', { id, name: 'Changed', accountKind: 'cash', amount: '100' })).ok,
    ).toBe(false);
    expect((await command('opening', { id, accountId: id, amount: '100' })).ok).toBe(false);
  });
  it('rejects duplicate names ignoring whitespace and case', async () => {
    await account();
    expect(
      (await command('account', { name: ' MAIN TILL ', accountKind: 'cash', amount: '10' })).ok,
    ).toBe(false);
  });
  it('reserves pending outgoing without counting it as cleared money', async () => {
    const a = await account();
    await assign(a);
    expect(await balance(a)).toMatchObject({
      cleared: '100.00',
      pending_out: '40.00',
      available: '60.00',
    });
  });
  it('clears an outgoing exactly once and preserves original cashbook totals', async () => {
    const a = await account();
    const before = await withTenant(db, state.businessId, (tx) =>
      loadCashbook(tx, state.businessId, today, today, 'all'),
    );
    const p = await assign(a);
    const id = randomUUID();
    ok(await command('clear', { id, postingId: p }));
    ok(await command('clear', { id, postingId: p }));
    expect(await balance(a)).toMatchObject({
      cleared: '60.00',
      pending_out: '0',
      available: '60.00',
    });
    const after = await withTenant(db, state.businessId, (tx) =>
      loadCashbook(tx, state.businessId, today, today, 'all'),
    );
    expect(after.totals).toEqual(before.totals);
    expect((await register()).ready).toBe(true);
  });
  it('keeps pending incoming out of available funds', async () => {
    await db.update(expenseEntries).set({ type: 'income' }).where(eq(expenseEntries.id, expenseId));
    const a = await account();
    const p = await assign(a);
    expect(await balance(a)).toMatchObject({
      cleared: '100.00',
      pending_in: '40.00',
      available: '100.00',
    });
    ok(await command('clear', { postingId: p }));
    expect((await balance(a))?.available).toBe('140.00');
  });
  it('splits a source across accounts and prevents over-assignment', async () => {
    const a = await account();
    const b = await account({ name: 'Bank', accountKind: 'bank' });
    await assign(a, { amount: '25' });
    await assign(b, { amount: '15' });
    expect(
      (
        await command('source', {
          accountId: a,
          sourceKind: 'expense',
          sourceId: expenseId,
          amount: '0.01',
        })
      ).ok,
    ).toBe(false);
    expect((await register()).unassigned).toHaveLength(0);
  });
  it('serializes concurrent assignments of the same remaining source', async () => {
    const a = await account();
    const results = await Promise.all([
      command('source', { accountId: a, sourceKind: 'expense', sourceId: expenseId, amount: '30' }),
      command('source', { accountId: a, sourceKind: 'expense', sourceId: expenseId, amount: '30' }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await balance(a))?.pending_out).toBe('30.00');
  });
  it('cancels a pending assignment and frees its source', async () => {
    const a = await account();
    const p = await assign(a);
    ok(await command('cancel', { postingId: p }));
    expect((await balance(a))?.available).toBe('100.00');
    await assign(a);
    expect((await register()).postings).toHaveLength(2);
  });
  it('bounces a cleared payment without deleting clearing history', async () => {
    const a = await account();
    const p = await assign(a);
    ok(await command('clear', { postingId: p }));
    ok(await command('bounce', { postingId: p }));
    const d = await register();
    expect((await balance(a))?.cleared).toBe('100.00');
    expect(d.history).toHaveLength(2);
    expect(d.unassigned).toHaveLength(1);
    expect(d.postings[0]?.state).toBe('bounce');
  });
  it('reverses cleared evidence and rejects illegal transitions', async () => {
    const a = await account();
    const p = await assign(a);
    expect((await command('reverse', { postingId: p })).ok).toBe(false);
    ok(await command('clear', { postingId: p }));
    expect((await command('cancel', { postingId: p })).ok).toBe(false);
    ok(await command('reverse', { postingId: p }));
    expect((await command('clear', { postingId: p })).ok).toBe(false);
    expect((await command('bounce', { postingId: p })).ok).toBe(false);
  });
  it('serializes competing clearing and cancellation', async () => {
    const a = await account();
    const p = await assign(a);
    const r = await Promise.all([
      command('clear', { postingId: p }),
      command('cancel', { postingId: p }),
    ]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
  });
  it('transfers atomically between accounts without source movement', async () => {
    const a = await account();
    const b = await account({ name: 'Bank', accountKind: 'bank', amount: '0' });
    const p = ok(await command('transfer', { accountId: a, toAccountId: b, amount: '30' })).id;
    expect((await balance(a))?.available).toBe('70.00');
    expect((await balance(b))?.cleared).toBe('0.00');
    ok(await command('clear', { postingId: p }));
    expect((await balance(a))?.cleared).toBe('70.00');
    expect((await balance(b))?.cleared).toBe('30.00');
    ok(await command('reverse', { postingId: p }));
    expect((await balance(a))?.cleared).toBe('100.00');
    expect((await balance(b))?.cleared).toBe('0.00');
  });
  it('rejects self transfers and spending reserved transfer funds twice', async () => {
    const a = await account();
    const b = await account({ name: 'Bank' });
    expect((await command('transfer', { accountId: a, toAccountId: a, amount: '10' })).ok).toBe(
      false,
    );
    ok(await command('transfer', { accountId: a, toAccountId: b, amount: '80' }));
    expect((await command('transfer', { accountId: a, toAccountId: b, amount: '30' })).ok).toBe(
      false,
    );
  });
  it('records a real expense even if it exposes a negative cash position', async () => {
    const a = await account({ amount: '10' });
    const p = await assign(a);
    ok(await command('clear', { postingId: p }));
    expect((await balance(a))?.cleared).toBe('-30.00');
    expect((await register()).ready).toBe(false);
  });
  it('blocks clearing a transfer when other recorded payments consumed its funds', async () => {
    const a = await account();
    const b = await account({ name: 'Bank' });
    const p = ok(await command('transfer', { accountId: a, toAccountId: b, amount: '80' })).id;
    await assign(a);
    expect((await command('clear', { postingId: p })).ok).toBe(false);
  });
  it('refuses sources before the opening date or backdated assignments', async () => {
    await db
      .update(expenseEntries)
      .set({ entryDate: new Date('2020-01-01T10:00:00Z') })
      .where(eq(expenseEntries.id, expenseId));
    const a = await account();
    expect(
      (
        await command('source', {
          accountId: a,
          sourceKind: 'expense',
          sourceId: expenseId,
          amount: '40',
        })
      ).ok,
    ).toBe(false);
    expect(
      (await command('transfer', { accountId: a, toAccountId: a, amount: '10', day: '2020-01-01' }))
        .ok,
    ).toBe(false);
  });
  it('detects changed source money and blocks clearing or extra assignment', async () => {
    const a = await account();
    const p = await assign(a);
    await db.update(expenseEntries).set({ amount: '50' }).where(eq(expenseEntries.id, expenseId));
    expect((await register()).stale).toHaveLength(1);
    expect((await command('clear', { postingId: p })).ok).toBe(false);
    expect(
      (
        await command('source', {
          accountId: a,
          sourceKind: 'expense',
          sourceId: expenseId,
          amount: '10',
        })
      ).ok,
    ).toBe(false);
    ok(await command('cancel', { postingId: p }));
    await assign(a, { amount: '50' });
    expect((await register()).stale).toHaveLength(0);
  });
  it('detects deleted source evidence without erasing a cleared balance', async () => {
    const a = await account();
    const p = await assign(a);
    ok(await command('clear', { postingId: p }));
    await db.delete(expenseEntries).where(eq(expenseEntries.id, expenseId));
    expect((await register()).stale).toHaveLength(1);
    expect((await balance(a))?.cleared).toBe('60.00');
    ok(await command('reverse', { postingId: p }));
    expect((await register()).stale).toHaveLength(0);
  });
  it('permits a verified opening correction only after dependent entries close', async () => {
    const a = await account();
    const p = await assign(a);
    expect((await command('opening', { accountId: a, amount: '120' })).ok).toBe(false);
    ok(await command('cancel', { postingId: p }));
    ok(await command('opening', { accountId: a, amount: '120' }));
    expect((await balance(a))?.cleared).toBe('120.00');
    expect((await register()).openings).toHaveLength(1);
  });
  it('does not allow an opening correction to change the adoption date', async () => {
    const a = await account();
    expect((await command('opening', { accountId: a, amount: '120', day: '2020-01-01' })).ok).toBe(
      false,
    );
  });
  it('does not infer cash from an unknown method', async () => {
    await db
      .update(expenseEntries)
      .set({ paymentMethod: 'unknown' })
      .where(eq(expenseEntries.id, expenseId));
    const a = await account({ name: 'Bank', accountKind: 'bank' });
    await assign(a);
    expect((await register()).sources[0]?.method).toBe('unknown');
  });
  it.each(['sales', 'billing', 'inventory', 'floor_manager'])(
    'denies financial commands to %s',
    async (role) => {
      await db.update(user).set({ role }).where(eq(user.id, state.id));
      state.role = role;
      expect(
        (await command('account', { name: 'Till', accountKind: 'cash', amount: '10' })).ok,
      ).toBe(false);
    },
  );
  it('uses RLS and compound tenant foreign keys to reject foreign accounts and sources', async () => {
    const a = await account();
    const oldBiz = state.businessId;
    const [b] = await db.insert(businesses).values({ name: 'Other' }).returning();
    if (!b) throw new Error('fixture');
    tenants.push(b.id);
    state.businessId = b.id;
    expect(
      (
        await command('source', {
          accountId: a,
          sourceKind: 'expense',
          sourceId: expenseId,
          amount: '40',
        })
      ).ok,
    ).toBe(false);
    expect((await register()).accounts).toHaveLength(0);
    state.businessId = oldBiz;
  });
  it('does not grant app_user update or delete on immutable money evidence', async () => {
    const [r] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM pg_class WHERE relname IN ('money_accounts','money_opening_revisions','money_source_snapshots','money_postings','money_posting_events','money_source_offsets') AND relrowsecurity AND relforcerowsecurity AND has_table_privilege('app_user',oid,'SELECT') AND has_table_privilege('app_user',oid,'INSERT') AND NOT has_table_privilege('app_user',oid,'UPDATE') AND NOT has_table_privilege('app_user',oid,'DELETE')`,
    );
    expect(r?.n).toBe(6);
  });
  it('qualifies bills with matching debt and no unsupported money claims', async () => {
    const rows = await ageing();
    expect(rows[0]?.consistent).toBe(true);
    expect(rows[0]?.due).toBe(null);
    expect(rows[0]?.overdue).toBe(0);
  });
  it('flags mismatched party debt and legacy paid statuses', async () => {
    await db
      .update(customers)
      .set({ outstandingBalance: '20' })
      .where(eq(customers.id, customerId));
    await db.update(sales).set({ paymentStatus: 'paid' }).where(eq(sales.id, saleId));
    expect((await ageing())[0]?.reasons).toEqual(
      expect.arrayContaining([
        'Party debt differs from ordinary credit bills',
        'Legacy payment status lacks allocations',
      ]),
    );
  });
  it('requires allocated receipt clearing before showing consistent payment evidence', async () => {
    const receipt = ok(
      await createSalesSettlementAction({
        id: randomUUID(),
        customerId,
        billId: saleId,
        amount: '40',
        paymentMethod: 'cheque',
      }),
    );
    expect((await ageing())[0]?.consistent).toBe(false);
    const a = await account();
    const p = await assign(a, { sourceKind: 'sales_settlement', sourceId: receipt.id });
    ok(await command('clear', { postingId: p }));
    expect((await ageing())[0]?.consistent).toBe(true);
    ok(await command('bounce', { postingId: p }));
    expect((await ageing())[0]?.consistent).toBe(false);
    expect(
      (await db.select().from(customers).where(eq(customers.id, customerId)))[0]
        ?.outstandingBalance,
    ).toBe('60.00');
  });
  it('reconciles only the linked opposite correction of bounced money without inventing bank movement', async () => {
    const receipt = ok(
      await createSalesSettlementAction({
        id: randomUUID(),
        customerId,
        billId: saleId,
        amount: '40',
        paymentMethod: 'cheque',
      }),
    );
    const a = await account();
    const p = await assign(a, { sourceKind: 'sales_settlement', sourceId: receipt.id });
    ok(await command('bounce', { postingId: p }));
    const [allocation] = await db.execute<{ id: string }>(
      sql`SELECT id FROM sales_settlement_allocations WHERE business_id=${state.businessId}::uuid`,
    );
    if (!allocation) throw new Error('fixture');
    ok(
      await accountingCommandAction({
        id: randomUUID(),
        side: 'sales',
        kind: 'allocation_reverse',
        sourceId: allocation.id,
        note: 'Bounced cheque allocation',
      }),
    );
    const correction = ok(
      await accountingCommandAction({
        id: randomUUID(),
        side: 'sales',
        kind: 'settlement_reverse',
        sourceId: receipt.id,
        method: 'cheque',
        note: 'Bounced cheque receipt',
      }),
    );
    const offset = {
      sourceKind: 'sales_settlement',
      sourceId: receipt.id,
      correctionId: correction.id,
      amount: '40',
    };
    ok(await command('offset', offset));
    expect((await balance(a))?.cleared).toBe('100.00');
    expect((await register()).unassigned).toHaveLength(1);
    expect((await command('offset', offset)).ok).toBe(false);
    expect(
      (await db.select().from(customers).where(eq(customers.id, customerId)))[0]
        ?.outstandingBalance,
    ).toBe('100.00');
  });
  it('flags over-allocated legacy bills even when negative party debt agrees', async () => {
    const receipt = ok(
      await createSalesSettlementAction({
        id: randomUUID(),
        customerId,
        billId: saleId,
        amount: '40',
        paymentMethod: 'cheque',
      }),
    );
    const a = await account();
    const p = await assign(a, { sourceKind: 'sales_settlement', sourceId: receipt.id });
    ok(await command('clear', { postingId: p }));
    await db.update(sales).set({ total: '20', subtotal: '20' }).where(eq(sales.id, saleId));
    await db
      .update(customers)
      .set({ outstandingBalance: '-20' })
      .where(eq(customers.id, customerId));
    const row = (await ageing())[0];
    expect(row?.remaining).toBe('-20.00');
    expect(row?.consistent).toBe(false);
    expect(row?.reasons).toContain('Bill allocations or returns exceed recorded bill value');
  });
  it('rejects an offset from unrelated source money', async () => {
    const a = await account();
    const p = await assign(a);
    ok(await command('bounce', { postingId: p }));
    expect(
      (
        await command('offset', {
          sourceKind: 'expense',
          sourceId: expenseId,
          correctionId: randomUUID(),
          amount: '40',
        })
      ).ok,
    ).toBe(false);
  });
});
