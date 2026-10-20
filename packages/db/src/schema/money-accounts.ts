import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';
const identity = () => ({
  id: uuid('id').primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
});
const evidence = () => ({
  reference: text('reference').notNull(),
  note: text('note').notNull(),
  requestHash: text('request_hash').notNull(),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
const amount = (name = 'amount') => numeric(name, { precision: 12, scale: 2 }).notNull();
export const moneyAccounts = pgTable(
  'money_accounts',
  {
    ...identity(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    openingOn: date('opening_on').notNull(),
    openingBalance: amount('opening_balance'),
    ...evidence(),
  },
  (t) => ({
    identity: unique().on(t.id, t.businessId),
    name: uniqueIndex('money_accounts_name').on(t.businessId, sql`lower(trim(${t.name}))`),
    nameCheck: check('money_account_name', sql`length(trim(${t.name})) BETWEEN 2 AND 80`),
    kindCheck: check('money_account_kind', sql`${t.kind} IN ('cash','bank')`),
    balanceCheck: check('money_account_opening', sql`${t.kind}='bank' OR ${t.openingBalance}>=0`),
    referenceCheck: check(
      'money_account_reference',
      sql`length(trim(${t.reference})) BETWEEN 3 AND 100`,
    ),
    noteCheck: check('money_account_note', sql`length(trim(${t.note})) BETWEEN 3 AND 500`),
  }),
);
export const moneyOpeningRevisions = pgTable(
  'money_opening_revisions',
  {
    ...identity(),
    accountId: uuid('account_id').notNull(),
    openingBalance: amount('opening_balance'),
    ...evidence(),
  },
  (t) => ({
    fk: foreignKey({
      columns: [t.accountId, t.businessId],
      foreignColumns: [moneyAccounts.id, moneyAccounts.businessId],
    }),
    idx: index('money_openings_account').on(t.businessId, t.accountId, t.createdAt),
    referenceCheck: check(
      'money_opening_reference',
      sql`length(trim(${t.reference})) BETWEEN 3 AND 100`,
    ),
    noteCheck: check('money_opening_note', sql`length(trim(${t.note})) BETWEEN 3 AND 500`),
  }),
);
export const moneySourceSnapshots = pgTable(
  'money_source_snapshots',
  {
    ...identity(),
    sourceKind: text('source_kind').notNull(),
    sourceId: uuid('source_id').notNull(),
    sourceHash: text('source_hash').notNull(),
    amount: amount(),
    direction: text('direction').notNull(),
    method: text('method').notNull(),
    sourceDay: date('source_day').notNull(),
    label: text('label').notNull(),
    href: text('href').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    identity: unique().on(t.id, t.businessId),
    version: unique().on(t.businessId, t.sourceKind, t.sourceId, t.sourceHash),
    kind: check(
      'money_source_kind',
      sql`${t.sourceKind} IN ('sale','sales_settlement','purchase','purchase_settlement','order_payment','emi_down','emi_payment','expense','accounting_event')`,
    ),
    positive: check('money_source_amount', sql`${t.amount}>0`),
    direction: check('money_source_direction', sql`${t.direction} IN ('in','out')`),
  }),
);
export const moneyPostings = pgTable(
  'money_postings',
  {
    ...identity(),
    kind: text('kind').notNull(),
    snapshotId: uuid('snapshot_id'),
    fromAccountId: uuid('from_account_id'),
    toAccountId: uuid('to_account_id'),
    amount: amount(),
    bookedOn: date('booked_on').notNull(),
    ...evidence(),
  },
  (t) => ({
    identity: unique().on(t.id, t.businessId),
    sourceFk: foreignKey({
      columns: [t.snapshotId, t.businessId],
      foreignColumns: [moneySourceSnapshots.id, moneySourceSnapshots.businessId],
    }),
    fromFk: foreignKey({
      columns: [t.fromAccountId, t.businessId],
      foreignColumns: [moneyAccounts.id, moneyAccounts.businessId],
    }),
    toFk: foreignKey({
      columns: [t.toAccountId, t.businessId],
      foreignColumns: [moneyAccounts.id, moneyAccounts.businessId],
    }),
    sourceIdx: index('money_postings_source').on(t.businessId, t.snapshotId),
    fromIdx: index('money_postings_from').on(t.businessId, t.fromAccountId),
    toIdx: index('money_postings_to').on(t.businessId, t.toAccountId),
    kindCheck: check('money_posting_kind', sql`${t.kind} IN ('source','transfer')`),
    positive: check('money_posting_amount', sql`${t.amount}>0`),
    shape: check(
      'money_posting_shape',
      sql`(${t.kind}='source' AND ${t.snapshotId} IS NOT NULL AND num_nonnulls(${t.fromAccountId},${t.toAccountId})=1) OR (${t.kind}='transfer' AND ${t.snapshotId} IS NULL AND ${t.fromAccountId} IS NOT NULL AND ${t.toAccountId} IS NOT NULL AND ${t.fromAccountId}<>${t.toAccountId})`,
    ),
    referenceCheck: check(
      'money_posting_reference',
      sql`length(trim(${t.reference})) BETWEEN 3 AND 100`,
    ),
    noteCheck: check('money_posting_note', sql`length(trim(${t.note})) BETWEEN 3 AND 500`),
  }),
);
export const moneyPostingEvents = pgTable(
  'money_posting_events',
  {
    ...identity(),
    postingId: uuid('posting_id').notNull(),
    kind: text('kind').notNull(),
    eventOn: date('event_on').notNull(),
    ...evidence(),
  },
  (t) => ({
    fk: foreignKey({
      columns: [t.postingId, t.businessId],
      foreignColumns: [moneyPostings.id, moneyPostings.businessId],
    }),
    kind: check('money_event_kind', sql`${t.kind} IN ('clear','bounce','cancel','reverse')`),
    once: unique().on(t.businessId, t.postingId, t.kind),
    closed: uniqueIndex('money_posting_closed')
      .on(t.businessId, t.postingId)
      .where(sql`${t.kind} IN ('bounce','cancel','reverse')`),
    referenceCheck: check(
      'money_event_reference',
      sql`length(trim(${t.reference})) BETWEEN 3 AND 100`,
    ),
    noteCheck: check('money_event_note', sql`length(trim(${t.note})) BETWEEN 3 AND 500`),
  }),
);
export const moneySourceOffsets = pgTable(
  'money_source_offsets',
  {
    ...identity(),
    originalSnapshotId: uuid('original_snapshot_id').notNull(),
    correctionSnapshotId: uuid('correction_snapshot_id').notNull(),
    amount: amount(),
    bookedOn: date('booked_on').notNull(),
    ...evidence(),
  },
  (t) => ({
    originalFk: foreignKey({
      columns: [t.originalSnapshotId, t.businessId],
      foreignColumns: [moneySourceSnapshots.id, moneySourceSnapshots.businessId],
    }),
    correctionFk: foreignKey({
      columns: [t.correctionSnapshotId, t.businessId],
      foreignColumns: [moneySourceSnapshots.id, moneySourceSnapshots.businessId],
    }),
    positive: check('money_offset_amount', sql`${t.amount}>0`),
    different: check(
      'money_offset_different',
      sql`${t.originalSnapshotId}<>${t.correctionSnapshotId}`,
    ),
    originalIdx: index('money_offsets_original').on(t.businessId, t.originalSnapshotId),
    correctionIdx: index('money_offsets_correction').on(t.businessId, t.correctionSnapshotId),
    referenceCheck: check(
      'money_offset_reference',
      sql`length(trim(${t.reference})) BETWEEN 3 AND 100`,
    ),
    noteCheck: check('money_offset_note', sql`length(trim(${t.note})) BETWEEN 3 AND 500`),
  }),
);
