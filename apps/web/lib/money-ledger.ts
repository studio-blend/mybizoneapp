import { sql } from 'drizzle-orm';
import { type MoneyInput, moneyCommandSchema, moneyDay } from './money-policy';
import { type PostingRow, moneyAccounts, postingsSql } from './money-queries';
import { currentSource, snapshot, sourceEvidence, sourceLock, sourceUsed } from './money-sources';
import { type OrderTx, requestHash } from './order-ledger';
import { moneyCents } from './order-policy';
const tables = {
  account: 'money_accounts',
  opening: 'money_opening_revisions',
  source: 'money_postings',
  transfer: 'money_postings',
  clear: 'money_posting_events',
  bounce: 'money_posting_events',
  cancel: 'money_posting_events',
  reverse: 'money_posting_events',
  offset: 'money_source_offsets',
};
const required = (v: string | undefined, label: string) => {
  if (!v) throw new Error(`Choose ${label}`);
  return v;
};
async function accountLocks(tx: OrderTx, biz: string, ids: string[]) {
  for (const id of [...new Set(ids)].sort())
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`money-account:${biz}:${id}`},0))`,
    );
  const accounts = await moneyAccounts(tx, biz);
  if (ids.some((id) => !accounts.some((a) => a.id === id))) throw new Error('Account not found');
  return accounts;
}
export async function executeMoneyCommand(
  tx: OrderTx,
  biz: string,
  actor: string,
  raw: MoneyInput,
) {
  const input = moneyCommandSchema.parse(raw);
  const hash = requestHash(input);
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`money-request:${biz}:${input.id}`},0))`,
  );
  // IDs cannot be reused across different commands or tables.
  for (const name of [...new Set(Object.values(tables))]) {
    const [old] = await tx.execute<{ request_hash: string }>(
      sql`SELECT request_hash FROM ${sql.identifier(name)} WHERE business_id=${biz}::uuid AND id=${input.id}::uuid`,
    );
    if (old) {
      if (old.request_hash !== hash)
        throw new Error('This request was already saved with different details');
      return { id: input.id };
    }
  }
  const day = moneyDay(input.day);
  const amount = input.amount === undefined ? 0 : moneyCents(input.amount);
  const base = sql`${input.id}::uuid,${biz}::uuid`;
  const evidence = sql`${input.reference},${input.note},${hash},${actor}`;
  if (input.kind === 'account') {
    const name = required(input.name, 'an account name');
    const kind = required(input.accountKind, 'an account type');
    if (input.amount === undefined || (kind === 'cash' && amount < 0))
      throw new Error('Cash opening must be zero or positive; enter a verified bank balance');
    await tx.execute(
      sql`INSERT INTO money_accounts(id,business_id,name,kind,opening_on,opening_balance,reference,note,request_hash,created_by) VALUES(${base},${name},${kind},${day}::date,${input.amount},${evidence})`,
    );
  } else if (input.kind === 'opening') {
    const id = required(input.accountId, 'an account');
    const accounts = await accountLocks(tx, biz, [id]);
    const a = accounts.find((a) => a.id === id);
    if (day !== a?.opening_on)
      throw new Error('Keep the original opening date when correcting its balance');
    if (input.amount === undefined || (a.kind === 'cash' && amount < 0))
      throw new Error('Enter a valid verified opening balance');
    const active = await tx.execute(
      sql`WITH p AS (${postingsSql(biz)}) SELECT id FROM p WHERE (from_account_id=${id}::uuid OR to_account_id=${id}::uuid) AND state IN ('pending','cleared') LIMIT 1`,
    );
    if (active.length)
      throw new Error('Cancel or reverse active postings before correcting an opening');
    await tx.execute(
      sql`INSERT INTO money_opening_revisions(id,business_id,account_id,opening_balance,reference,note,request_hash,created_by,created_at) VALUES(${base},${id}::uuid,${input.amount},${evidence},clock_timestamp())`,
    );
  } else if (input.kind === 'source' || input.kind === 'transfer') {
    if (amount <= 0) throw new Error('Amount must be positive');
    let source: Awaited<ReturnType<typeof snapshot>> | undefined;
    if (input.kind === 'source') {
      const kind = input.sourceKind;
      if (!kind) throw new Error('Choose a money source');
      const sourceId = required(input.sourceId, 'a source');
      await sourceLock(tx, biz, kind, sourceId);
      source = await snapshot(tx, biz, kind, sourceId);
      if (day < source.source_day) throw new Error('Assignment cannot predate the recorded money');
      if (amount > moneyCents(source.amount) - (await sourceUsed(tx, biz, source.id)))
        throw new Error('Amount exceeds unassigned source money');
    }
    const id = required(input.accountId, 'an account');
    const dest =
      input.kind === 'transfer' ? required(input.toAccountId, 'a destination account') : undefined;
    if (dest === id) throw new Error('Choose different accounts for a transfer');
    const accounts = await accountLocks(tx, biz, dest ? [id, dest] : [id]);
    for (const account of accounts.filter((a) => a.id === id || a.id === dest))
      if (day < account.opening_on || (source && source.source_day < account.opening_on))
        throw new Error(
          'Money before the start-of-day opening is already represented by the opening balance',
        );
    if (dest && amount > moneyCents(accounts.find((a) => a.id === id)?.available ?? '0'))
      throw new Error('Transfer exceeds recorded funds after pending outgoing reservations');
    const from = dest || source?.direction === 'out' ? id : null;
    const to = dest ?? (source?.direction === 'in' ? id : null);
    await tx.execute(
      sql`INSERT INTO money_postings(id,business_id,kind,snapshot_id,from_account_id,to_account_id,amount,booked_on,reference,note,request_hash,created_by) VALUES(${base},${input.kind},${source?.id ?? null}::uuid,${from}::uuid,${to}::uuid,${input.amount},${day}::date,${evidence})`,
    );
  } else if (input.kind === 'offset') {
    const kind = input.sourceKind;
    if (!kind) throw new Error('Choose the bounced original source');
    const id = required(input.sourceId, 'the original source');
    const correction = required(input.correctionId, 'its linked correction');
    for (const s of [
      { kind, id },
      { kind: 'accounting_event' as const, id: correction },
    ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)))
      await sourceLock(tx, biz, s.kind, s.id);
    const original = await snapshot(tx, biz, kind, id);
    const corrected = await snapshot(tx, biz, 'accounting_event', correction);
    const [linked] = await tx.execute(
      sql`SELECT id FROM accounting_events WHERE business_id=${biz}::uuid AND id=${correction}::uuid AND ((kind='settlement_reverse' AND ((${kind}='sales_settlement' AND sales_settlement_id=${id}::uuid) OR (${kind}='purchase_settlement' AND purchase_settlement_id=${id}::uuid))) OR (kind='money_reverse' AND ${kind}='accounting_event' AND source_event_id=${id}::uuid))`,
    );
    if (!linked || original.direction === corrected.direction)
      throw new Error('Choose the original source and its actual opposite correction');
    if (day < original.source_day || day < corrected.source_day)
      throw new Error('Offset cannot predate either source');
    // Serialize against clearing/bouncing the original as well as new assignments.
    const affected = await tx.execute<{ id: string }>(
      sql`SELECT COALESCE(from_account_id,to_account_id)::text AS id FROM money_postings WHERE business_id=${biz}::uuid AND snapshot_id=${original.id}::uuid`,
    );
    await accountLocks(
      tx,
      biz,
      affected.map((a) => a.id),
    );
    const [bounced] = await tx.execute<{ amount: string }>(
      sql`WITH p AS (${postingsSql(biz)}) SELECT (COALESCE((SELECT sum(amount) FROM p WHERE snapshot_id=${original.id}::uuid AND state='bounce'),0)-COALESCE((SELECT sum(amount) FROM money_source_offsets WHERE business_id=${biz}::uuid AND original_snapshot_id=${original.id}::uuid),0))::text AS amount`,
    );
    if (
      amount <= 0 ||
      amount > moneyCents(bounced?.amount ?? '0') ||
      amount > moneyCents(original.amount) - (await sourceUsed(tx, biz, original.id)) ||
      amount > moneyCents(corrected.amount) - (await sourceUsed(tx, biz, corrected.id))
    )
      throw new Error('Offset exceeds bounced, unassigned original or correction money');
    await tx.execute(
      sql`INSERT INTO money_source_offsets(id,business_id,original_snapshot_id,correction_snapshot_id,amount,booked_on,reference,note,request_hash,created_by) VALUES(${base},${original.id}::uuid,${corrected.id}::uuid,${input.amount},${day}::date,${evidence})`,
    );
  } else {
    const id = required(input.postingId, 'a posting');
    // The posting is immutable. Source lock precedes account locks in every command.
    const [p] = await tx.execute<PostingRow>(sql`${postingsSql(biz)} AND p.id=${id}::uuid`);
    if (!p) throw new Error('Posting not found');
    if (p.source_kind && p.source_id) await sourceLock(tx, biz, p.source_kind, p.source_id);
    const accounts = await accountLocks(
      tx,
      biz,
      [p.from_account_id, p.to_account_id].filter((x): x is string => !!x),
    );
    const [fresh] = await tx.execute<PostingRow>(sql`${postingsSql(biz)} AND p.id=${id}::uuid`);
    if (!fresh || !['pending', 'cleared'].includes(fresh.state))
      throw new Error('Posting is already closed');
    if (day < p.booked_on || (fresh.cleared_on && day < fresh.cleared_on))
      throw new Error('Event cannot predate assignment or clearing');
    if (input.kind === 'clear') {
      if (fresh.state !== 'pending') throw new Error('Posting is already cleared');
      if (p.source_kind && p.source_id) {
        const s = await currentSource(tx, biz, p.source_kind, p.source_id);
        if (!s || requestHash(sourceEvidence(s)) !== p.source_hash)
          throw new Error('Source changed; cancel this assignment and reconcile the source');
      }
      if (
        p.kind === 'transfer' &&
        moneyCents(accounts.find((a) => a.id === p.from_account_id)?.available ?? '0') < 0
      )
        throw new Error('Insufficient recorded funds to clear the reserved transfer');
    } else if (input.kind === 'cancel' && fresh.state !== 'pending')
      throw new Error('Only pending entries can be cancelled; reverse a cleared entry');
    else if (input.kind === 'reverse' && fresh.state !== 'cleared')
      throw new Error('Only cleared entries can be reversed; cancel a pending entry');
    await tx.execute(
      sql`INSERT INTO money_posting_events(id,business_id,posting_id,kind,event_on,reference,note,request_hash,created_by) VALUES(${base},${id}::uuid,${input.kind},${day}::date,${evidence})`,
    );
  }
  return { id: input.id };
}
