import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { cashbookSource } from './cashbook';
import type { moneySourceKinds } from './money-policy';
import { type OrderTx, requestHash } from './order-ledger';
import { moneyCents } from './order-policy';
export type SourceKind = (typeof moneySourceKinds)[number];
export interface MoneySource extends Record<string, unknown> {
  id: string;
  source_kind: SourceKind;
  day: string;
  label: string;
  href: string;
  method: string;
  incoming: string;
  outgoing: string;
}
export function sourceEvidence(s: MoneySource) {
  const direction = moneyCents(s.incoming) > 0 ? 'in' : 'out';
  const amount = direction === 'in' ? s.incoming : s.outgoing;
  return {
    kind: s.source_kind,
    id: s.id,
    day: s.day,
    amount: moneyCents(amount),
    direction,
    method: s.method,
  };
}
export async function currentSource(tx: OrderTx, biz: string, kind: SourceKind, id: string) {
  const [s] = await tx.execute<MoneySource>(
    sql`${cashbookSource(biz)} SELECT id,source_kind,day,label,href,channel AS method,incoming::text,outgoing::text FROM normalized WHERE source_kind=${kind} AND id=${id}::uuid AND incoming+outgoing>0`,
  );
  return s;
}
export async function sourceLock(tx: OrderTx, biz: string, kind: SourceKind, id: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`money-source:${biz}:${kind}:${id}`},0))`,
  );
  const mutable = (
    {
      sale: 'sales',
      purchase: 'purchases',
      expense: 'expense_entries',
      emi_payment: 'emi_payments',
      emi_down: 'emi_schedules',
    } as Record<string, string>
  )[kind];
  if (mutable)
    await tx.execute(
      sql`SELECT id FROM ${sql.identifier(mutable)} WHERE business_id=${biz}::uuid AND id=${id}::uuid FOR UPDATE`,
    );
}
export interface Snapshot extends Record<string, unknown> {
  id: string;
  source_kind: SourceKind;
  source_id: string;
  source_hash: string;
  amount: string;
  direction: string;
  source_day: string;
  label: string;
  href: string;
  method: string;
}
export async function snapshot(tx: OrderTx, biz: string, kind: SourceKind, id: string) {
  const s = await currentSource(tx, biz, kind, id);
  if (!s) throw new Error('Money source no longer exists or has no recorded payment');
  const e = sourceEvidence(s);
  const hash = requestHash(e);
  const stale = await tx.execute(
    sql`SELECT s.id FROM money_source_snapshots s WHERE s.business_id=${biz}::uuid AND s.source_kind=${kind} AND s.source_id=${id}::uuid AND s.source_hash<>${hash} AND (EXISTS(SELECT 1 FROM money_postings p WHERE p.snapshot_id=s.id AND p.business_id=s.business_id AND NOT EXISTS(SELECT 1 FROM money_posting_events c WHERE c.posting_id=p.id AND c.business_id=p.business_id AND c.kind IN ('bounce','cancel','reverse'))) OR EXISTS(SELECT 1 FROM money_source_offsets o WHERE o.business_id=s.business_id AND (o.original_snapshot_id=s.id OR o.correction_snapshot_id=s.id)))`,
  );
  if (stale.length)
    throw new Error(
      'Source changed. Cancel or reverse earlier assignments before recapturing; offsets require reconciliation',
    );
  await tx.execute(
    sql`INSERT INTO money_source_snapshots(id,business_id,source_kind,source_id,source_hash,amount,direction,method,source_day,label,href) VALUES(${randomUUID()}::uuid,${biz}::uuid,${kind},${id}::uuid,${hash},${e.amount / 100},${e.direction},${s.method},${s.day}::date,${s.label},${s.href}) ON CONFLICT(business_id,source_kind,source_id,source_hash) DO NOTHING`,
  );
  const [row] = await tx.execute<Snapshot>(
    sql`SELECT *,source_day::text FROM money_source_snapshots WHERE business_id=${biz}::uuid AND source_kind=${kind} AND source_id=${id}::uuid AND source_hash=${hash}`,
  );
  if (!row) throw new Error('Source capture failed');
  return row;
}
export async function sourceUsed(tx: OrderTx, biz: string, id: string) {
  const [row] = await tx.execute<{ amount: string }>(
    sql`SELECT (COALESCE((SELECT sum(p.amount) FROM money_postings p WHERE p.business_id=${biz}::uuid AND p.snapshot_id=${id}::uuid AND NOT EXISTS(SELECT 1 FROM money_posting_events e WHERE e.business_id=p.business_id AND e.posting_id=p.id AND e.kind IN ('bounce','cancel','reverse'))),0)+COALESCE((SELECT sum(o.amount) FROM money_source_offsets o WHERE o.business_id=${biz}::uuid AND (o.original_snapshot_id=${id}::uuid OR o.correction_snapshot_id=${id}::uuid)),0))::text AS amount`,
  );
  return moneyCents(row?.amount ?? '0');
}
