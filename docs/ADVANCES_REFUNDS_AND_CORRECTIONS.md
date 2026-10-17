# Advances, refunds and corrections — Phase 4b

Status, 17 October 2026: published and accepted on the hosted development app.
Owner-approved migration 0029 is applied/recorded and its temporary branch removed.
Application commit `6ee547529bea00ce9a7af0ea363a5563f1091a3d`, Vercel
`dpl_GgRvhW9rUTnLYFdnJujANytygM2y` (READY, public alias verified).
Migration preserved all 39 checked existing tables. Two later audited owner-account
profile edits were retained. See [project status](PROJECT_STATUS.md).

## Operating workflow

**Billing → Advances & refunds** keeps customer and supplier funds in separate
registers. Unused customer advances are money held for customers; unused supplier
advances are prepayments. Neither changes unpaid party debt until explicitly
applied to an eligible credit bill. Recording a new advance has a real cashbook
entry. Applying it creates linked settlement/allocation evidence, reduces debt
once and consumes the advance, without a second cash movement. Applications are
partial and bounded by unused funds, bill value and general party debt; EMI and
order debt stay in their separate ledgers. There is no automatic netting or guessed
historical mapping. Unused advances can be refunded in partial amounts, with the
actual method, reference and evidence.

New goods returns record separate debt-reduction and refund-entitlement snapshots.
A credit return first reduces the unpaid portion of its own bill; any paid portion
becomes a refund due. The browser explicitly requests this split. Older callers
retain the conservative default that rejects crossing the unpaid credit amount.
A paid cash bill creates a refund entitlement without erasing unrelated debt.
Recording the eventual refund moves money only: it does not move stock or reduce
debt again. Supplier returns use the corresponding payable reduction and refund
receivable. Walk-in customer refunds are supported when the original paid bill
and return evidence exist.

An existing return, or a cash bill without verified paid status, does not acquire
a guessed entitlement. Its physical goods return can remain recorded, but refund
commands require reconciliation outside this phase. Unallocated general payments
and legacy paid/partial credit flags retain the Phase 4a reconciliation guards.
Order refunds and EMI adjustments continue through their existing workflows.

## Corrections retain evidence

Corrections append linked records; original money, allocation and stock documents
are retained. Every command requires an evidence/reason note. The browser requires
confirmation before a full correction.

- Reverse a mistaken bill allocation in full, then assign its payment correctly.
  This changes bill payment evidence, without moving cash or party debt.
- Reverse a mistaken settlement only after all its live allocations are reversed.
  This restores the recorded party debt and adds an opposite money correction.
  For an advance-funded settlement it restores advance availability instead of
  adding a cashbook movement.
- Reverse an unused advance or a mistaken advance/return refund in full. The
  original record and its opposite correction remain in the history and cashbook.
  Advance use/refunds must be undone before the original advance can be reversed.
- A payment assignment supporting a paid goods return cannot be reversed through
  this screen: its return entitlement first requires reconciliation. Stock-return
  cancellation, document editing and arbitrary accounting journals are not added.

New finance commands use required browser request IDs and payload hashes. Same
request/details replays once; edited reuse fails. Request locks serialize retries;
bill locks precede party locks, and party locks serialize advance use/refunds and
payment corrections. Return forms also retain request IDs through uncertain saves,
so a retry cannot return stock twice. A fresh page starts the next command.

All finance reads/writes use the existing **global manage_expenses** permission;
owner/admin/accounts access does not grant party editing. Sales-only and scoped
store/department roles cannot enter the finance register. Original stock-return
permissions remain in force. Compound tenant foreign keys, FORCE RLS, narrow
SELECT/INSERT grants, unique full-reversal indexes and audit events protect new
evidence. The source party is derived from its actual record, never a submitted
replacement party.

## Views and reporting

The register shows unused advances, return refunds still due, source links and
dated correction history, with 100 history entries per page. Available sources and
summary positions are not truncated to the history page. Customer/supplier tabs
and saves use full navigation to read fresh balances and form choices.

Cashbook includes actual advances, refunds and dated opposite corrections once.
Advance applications and allocation reversals do not create cash. Earlier money
documents remain visible in their original periods; corrections appear on their
recorded dates and methods. This is recorded movement, not bank clearing or cash
available. A correction records a mistaken entry's accounting effect; an actual
goods refund must use the return-refund command.

Finance dashboards show advance assets/liabilities and refunds receivable/payable
separately from trade debt, only for business-wide finance views. General settlement
period totals exclude advance-funded applications and include opposite settlement
corrections. Collection recency ignores reversed settlements. The simplified
balance-sheet view includes separate advance/refund positions at its selected event
cutoff. Its existing stock, opening-note, cost/tax and available-cash limitations
remain: it is a management view, not a reconciled financial statement.

## Validation and rollout

- **365 automated tests passed:** 348 web tests across all 34 suites and 17
  database tests across three suites, zero failures/skips. The accounting suite
  includes 55 real PostgreSQL cases, covering partial advance use/refunds,
  competing commands, retries, corrections, paid returns, permissions, isolation
  and cashbook double-counting.
- **215 production-browser checks passed across all 15 runners:** 17 new guarded
  financial journeys, 12 read-only phone/role checks and all 186 prior accounting,
  kitchen, wholesale, order, batch/serial, dashboard and analysis checks. Every
  runner exited 0; all eight transport counters were zero. New financial fixture
  cleanup preserved all 16 checked stock/financial table hashes.
- Production build, application/database TypeScript validation and scoped lint
  passed. Five existing return-helper non-null warnings remain. Customer funds,
  supplier funds and correction layouts were visually inspected at 360px.
- Local evidence: `.cache/funds-web-tests-accepted.log`, `.cache/funds-db-tests.log`,
  `.cache/funds-build.log`, `.cache/funds-lint.log`,
  `.cache/funds-production-acceptance.json`, 15 `.cache/funds-production-*.log`
  files, `.cache/funds-accepted-source.json` and funds/phone screenshots.
  Temporary migration evidence and exact completion context stay in ignored
  `.local/test-accounts/pending-funds-migration.json`.

Mutating financial browser checks were restricted to the exact guarded disposable
local database. The published application passed **137 read-only hosted browser
checks across 10 runners**: 12 funds, 12 accounting, 10 kitchen, 11 wholesale,
10 orders, 10 serials, nine batches, 21 workspaces, 20 analysis and 22 seeded
transaction/bill/report checks. All runners exited 0; nine transport counters were
zero. No hosted financial forms were submitted. Hosted evidence is in
`.cache/funds-hosted-acceptance.json`, the 10 `.cache/funds-hosted-*.log` files,
`.cache/funds-hosted-final-hashes.json` and hosted phone screenshots.

Migration 0029 adds one append-only event ledger and three nullable columns on each
return table, plus supporting constraints/indexes. No previous return, payment,
balance, stock or allocation is rewritten. Temporary branch validation preserved
all 39 checked existing-table row counts and full old-column hashes. The new ledger
is empty, and previous return snapshots/request hashes remain null. Existing money
and allocation grants remain append-only. After explicit owner approval, migration
0029 was applied and recorded and its temporary branch removed. All 39 checked
old-column hashes matched immediately after migration. After hosted acceptance,
38 table hashes still match. The business profile changed through two audited
owner-account settings edits at 17:19 UTC (general retail → furniture → wholesale,
selling model retail → wholesale); those edits and their timestamp were retained.
No payments, return entitlements or financial fixtures were invented. Only 0029
was recorded; unrelated subscription migration 0020 remains pending.

## Next phase

Phase 4c: reconciled opening cash/accounts, transfers and bank/cheque clearing,
followed by invoice ageing and available-cash reporting only when supported by
complete evidence. Commercial launch gates stay separate in
[project status](PROJECT_STATUS.md).
