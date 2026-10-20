import { sql } from 'drizzle-orm';
import { cashbookSource } from './cashbook';
import { type MoneySource, type Snapshot, sourceEvidence } from './money-sources';
import { type OrderTx, requestHash } from './order-ledger';
import { moneyCents } from './order-policy';
export const postingStateSql = sql.raw(
  `CASE WHEN closed.kind IS NOT NULL THEN closed.kind WHEN cleared.id IS NOT NULL THEN 'cleared' ELSE 'pending' END`,
);
export function postingsSql(biz: string) {
  return sql`SELECT p.*,p.booked_on::text,${postingStateSql} AS state,cleared.event_on::text AS cleared_on,s.source_kind,s.source_id,s.source_hash,s.source_day::text,s.label,s.href,s.direction FROM money_postings p LEFT JOIN money_source_snapshots s ON s.id=p.snapshot_id AND s.business_id=p.business_id LEFT JOIN money_posting_events cleared ON cleared.posting_id=p.id AND cleared.business_id=p.business_id AND cleared.kind='clear' LEFT JOIN money_posting_events closed ON closed.posting_id=p.id AND closed.business_id=p.business_id AND closed.kind IN ('bounce','cancel','reverse') WHERE p.business_id=${biz}::uuid`;
}
export interface AccountRow extends Record<string, unknown> {
  id: string;
  name: string;
  kind: string;
  opening_on: string;
  opening_balance: string;
  original_opening_balance: string;
  reference: string;
  note: string;
  cleared: string;
  pending_in: string;
  pending_out: string;
  available: string;
}
export interface PostingRow extends Record<string, unknown> {
  id: string;
  kind: string;
  snapshot_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  amount: string;
  booked_on: string;
  state: string;
  cleared_on: string | null;
  source_kind: MoneySource['source_kind'] | null;
  source_id: string | null;
  source_hash: string | null;
  source_day: string | null;
  label: string | null;
  href: string | null;
  direction: string | null;
  reference: string;
  note: string;
}
export async function moneyAccounts(tx: OrderTx, biz: string) {
  return Array.from(
    await tx.execute<AccountRow>(sql`WITH postings AS (${postingsSql(biz)}), balances AS (SELECT a.*,a.opening_on::text AS opening_day,COALESCE((SELECT r.opening_balance FROM money_opening_revisions r WHERE r.business_id=a.business_id AND r.account_id=a.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1),a.opening_balance) AS opening,
 COALESCE((SELECT sum(CASE WHEN p.to_account_id=a.id THEN p.amount ELSE -p.amount END) FROM postings p WHERE p.state='cleared' AND (p.from_account_id=a.id OR p.to_account_id=a.id)),0) AS net,
 COALESCE((SELECT sum(p.amount) FROM postings p WHERE p.state='pending' AND p.to_account_id=a.id),0) AS incoming,
 COALESCE((SELECT sum(p.amount) FROM postings p WHERE p.state='pending' AND p.from_account_id=a.id),0) AS outgoing
 FROM money_accounts a WHERE a.business_id=${biz}::uuid) SELECT id,name,kind,reference,note,opening_balance::text AS original_opening_balance,opening_day AS opening_on,opening::text AS opening_balance,(opening+net)::text AS cleared,incoming::text AS pending_in,outgoing::text AS pending_out,(opening+net-outgoing)::text AS available FROM balances ORDER BY name,id`),
  );
}
export async function moneyRegister(tx: OrderTx, biz: string) {
  const accounts = await moneyAccounts(tx, biz);
  const floor = accounts.map((a) => a.opening_on).sort()[0];
  const sources = Array.from(
    await tx.execute<MoneySource>(
      sql`${cashbookSource(biz)} SELECT id,source_kind,day,label,href,channel AS method,incoming::text,outgoing::text FROM normalized WHERE incoming+outgoing>0 ${floor ? sql`AND day>=${floor}` : sql``} ORDER BY day DESC,source_kind,id`,
    ),
  );
  const snapshots = Array.from(
    await tx.execute<Snapshot>(
      sql`SELECT *,source_day::text FROM money_source_snapshots WHERE business_id=${biz}::uuid`,
    ),
  );
  const postings = Array.from(
    await tx.execute<PostingRow>(sql`${postingsSql(biz)} ORDER BY p.created_at DESC,p.id DESC`),
  );
  const offsets = Array.from(
    await tx.execute<{
      id: string;
      original_snapshot_id: string;
      correction_snapshot_id: string;
      amount: string;
      note: string;
      reference: string;
      booked_on: string;
    }>(
      sql`SELECT id,original_snapshot_id,correction_snapshot_id,amount::text,note,reference,booked_on::text FROM money_source_offsets WHERE business_id=${biz}::uuid ORDER BY created_at DESC,id DESC`,
    ),
  );
  const current = new Map(
    sources.map((s) => [`${s.source_kind}:${s.id}`, requestHash(sourceEvidence(s))]),
  );
  const used = new Map<string, number>();
  for (const p of postings)
    if (p.snapshot_id && ['pending', 'cleared'].includes(p.state))
      used.set(p.snapshot_id, (used.get(p.snapshot_id) ?? 0) + moneyCents(p.amount));
  for (const o of offsets)
    for (const id of [o.original_snapshot_id, o.correction_snapshot_id])
      used.set(id, (used.get(id) ?? 0) + moneyCents(o.amount));
  const stale = snapshots.filter(
    (s) =>
      (used.get(s.id) ?? 0) > 0 && current.get(`${s.source_kind}:${s.source_id}`) !== s.source_hash,
  );
  const unassigned = sources
    .map((s) => {
      const hash = current.get(`${s.source_kind}:${s.id}`);
      const assigned = snapshots
        .filter(
          (n) => n.source_kind === s.source_kind && n.source_id === s.id && n.source_hash === hash,
        )
        .reduce((n, x) => n + (used.get(x.id) ?? 0), 0);
      return { ...s, remaining: Math.max(0, sourceEvidence(s).amount - assigned) / 100 };
    })
    .filter((s) => s.remaining > 0);
  const ready =
    !!accounts.length &&
    !stale.length &&
    !unassigned.length &&
    accounts.every((a) => moneyCents(a.available) >= 0);
  const history = Array.from(
    await tx.execute<{
      id: string;
      posting_id: string;
      kind: string;
      event_on: string;
      reference: string;
      note: string;
    }>(
      sql`SELECT id,posting_id,kind,event_on::text,reference,note FROM money_posting_events WHERE business_id=${biz}::uuid ORDER BY created_at DESC,id DESC`,
    ),
  );
  const openings = Array.from(
    await tx.execute<{
      id: string;
      account_id: string;
      opening_balance: string;
      reference: string;
      note: string;
    }>(
      sql`SELECT id,account_id,opening_balance::text,reference,note FROM money_opening_revisions WHERE business_id=${biz}::uuid ORDER BY created_at DESC,id DESC`,
    ),
  );
  return { accounts, sources, postings, offsets, stale, unassigned, ready, history, openings };
}
