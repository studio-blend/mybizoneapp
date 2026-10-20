# MyBizOne — current status and roadmap

Updated: **20 October 2026**. This is the current project summary. Detailed
behaviour, boundaries and verification remain in the linked feature/release notes.

## Latest feature delivery — Phase 4c live

Cash/bank accounts, verified openings and append-only corrections, source
assignments, transfers, clearing/bounces and linked noncash reconciliation are
published and hosted-verified. The finance dashboard shows current account positions and a
new credit bill report qualifies invoice-age figures against allocation/clearing
evidence. Open **Billing → Cash & bank** to enter verified account openings.

All 401 automated tests pass (384 web / 35 suites, including 36 new money
regressions, plus 17 database / three suites). Production build, application/database
types and scoped lint pass. All 240 production-browser checks / 17 runners passed;
the 25 affected finance checks passed again on the final build after the legacy
over-allocation guard. These runs completed on 17–18 October; all 20 accepted source
hashes still match on 20 October. All **149 read-only hosted browser checks / 11
runners** passed with zero reported transport retries. Owner-approved migration
0030 is applied/recorded and its temporary branch removed. All 40 checked existing
table hashes still match the fresh pre-apply baseline after hosted acceptance;
the six new ledger tables remain empty. Existing stock, debt, transactions, profile
settings and permissions are preserved. Subscription migration 0020 remains pending.
See [Cash, bank and clearing](CASH_BANK_AND_CLEARING.md).

## Current hosted position

The hosted development application is running at https://mybizoneapp.vercel.app.
Latest application acceptance: commit `f8b6dfd1563fa64e83c88ca29bb51ab9ba058827`,
Vercel deployment `dpl_EBwZ1XfApdpEhW1NYzqRi3aBmndt` (READY, public alias verified).
Documentation-only follow-ups may have newer commit/deployment IDs; application
code is unchanged from this accepted release.
It is suitable for ongoing owner testing within its documented supported scope.
**It is not yet accepted for commercial launch.**

Product feature phases below are separate from the older delivery/release phases
in `release/PHASE_PLAN.md`. Completing feature Phase 4c does not complete installer,
provider, recovery or commercial release acceptance.

## Delivered and live

| Area | Current result | Details |
| --- | --- | --- |
| Core store operations | Products, purchases, sales/bills, returns, settlements, expenses, EMI, quotations and delivery challans exist within documented accounting/security limits | [Accounting limits](release/S2_S5_STABILIZATION.md), [security scope](release/S3_STABILIZATION.md) |
| Demo business | Four stores: two furniture, one electronics and one utensils; departments, hierarchical users/employees, products and sample transactions seeded and verified | [Store data](release/FOUR_STORE_TEST_DATA.md), [transactions](release/FOUR_STORE_TRANSACTIONS.md) |
| Role dashboards | Master, operations, sales, billing, inventory, accounts and customer/marketing workspaces; owner can inspect all; staff retain store/department boundaries | [Dashboard workspaces](DASHBOARD_WORKSPACES.md) |
| Feature Phase 1 | Business defaults and per-store profile overrides, independent selling model, product profitability, slow stock, stock-cover estimates and store comparisons | [Profiles and insights](BUSINESS_PROFILES_AND_INSIGHTS.md) |
| Feature Phase 2 | GST-exclusive gross-profit trends, sales heatmap, collection priorities, adjustments and scoped bill drill-downs | [Operating analysis](OPERATING_ANALYSIS.md) |
| Feature Phase 3a | Optional product batch reconciliation, expiry control, earliest-expiry checkout, return quarantine/inspection, supplier returns, batch damage and dashboard alerts | [Batch stock and expiry](STOCK_BATCHES_AND_EXPIRY.md) |
| Feature Phase 3b | Optional serial reconciliation, exact-unit receipts/sales/returns/damage, inspection quarantine, immutable sale warranty records, scoped lookup and dashboard alerts | [Serial inventory and recorded warranties](SERIAL_INVENTORY_AND_WARRANTIES.md) |
| Feature Phase 3c | Customer orders, immutable price/tax agreements, advances, partial handovers, exact bill allocation, returns/refunds, cancellation and dashboard priorities | [Orders, advances and deliveries](CUSTOMER_ORDERS_AND_ADVANCES.md) |
| Feature Phase 3d | Optional pack conversions, customer-tier prices, credit terms/ceilings and wholesale partial fulfilment, with immutable receipt/bill notes | [Wholesale packs and credit](WHOLESALE_PACKS_AND_CREDIT.md) |
| Feature Phase 3e | Immutable recipes, prep-to-stock kitchen tickets, ingredient consumption, actual yield/cost, batch trace and waste linked to existing loss reports | [Kitchen preparation and waste](KITCHEN_PREPARATION_AND_WASTE.md) |
| Feature Phase 4a | Partial customer/supplier payments, explicit bill allocations and permanent evidence, return reconciliation guards and a recorded cashbook with daily/method charts | [Accounting foundations](ACCOUNTING_FOUNDATIONS.md) |
| Feature Phase 4b | Separate customer/supplier advances, partial use/refunds, paid-return refund entitlements and linked full corrections, with cashbook and finance positions | [Advances, refunds and corrections](ADVANCES_REFUNDS_AND_CORRECTIONS.md) |
| Feature Phase 4c | Verified cash/bank openings, immutable corrections, partial/split account assignments, transfers, clearing/bounces, linked noncash reconciliation and qualified ordinary credit bill ageing | [Cash, bank and clearing](CASH_BANK_AND_CLEARING.md) |

Industry profiles set defaults and priorities; specialised workflows are separate
capabilities. Choosing an industry does not activate an unfinished module. Existing
products remain untracked until their physical lots or unit serials are explicitly reconciled.

## Previous feature delivery — Phase 4b

**Billing → Advances & refunds** is live. Record customer prepayments or supplier
advances separately from debt, then apply partial amounts to specific credit bills
without collecting or paying money again. Goods returns separate unpaid debt
reduction from paid refund entitlement; record the actual refund when money moves.
Linked full corrections preserve original evidence and restore the relevant debt,
advance or refund position. Stock is not moved again by money commands.

Finance dashboards and the management balance-sheet show advance/refund positions
separately from trade debt. Cashbook includes actual money and dated corrections,
while excluding advance applications. Historical returns without verified payment
snapshots still require reconciliation; no entitlements are guessed. Order/EMI
ledgers, opening cash and bank-clearing limits remain separate. See
[the supported workflow and limits](ADVANCES_REFUNDS_AND_CORRECTIONS.md).

## Latest verification

- **365 automated tests passed:** 348 web tests across all 34 suites and 17 database
  tests across three suites, zero failures/skips. The accounting suite includes
  55 real PostgreSQL cases for advances, refunds, retries, races and corrections.
- **215 local production-browser checks passed** across 15 runners, including
  17 new financial journeys, 12 funds phone/role checks and 186 prior regressions.
- **137 read-only hosted browser checks passed** across 10 runners: 12 funds,
  12 accounting, 10 kitchen, 11 wholesale, 10 orders, 10 serials, nine batches,
  21 workspaces, 20 analysis and 22 seeded transaction/bill/report checks. All
  runners exited 0; nine transport counters were zero.
- Production build, application/database TypeScript and scoped lint passed. Five
  existing return-helper non-null warnings remain. New layouts were inspected at
  360px. Financial browser writes ran only on the guarded disposable local cluster;
  cleanup preserved all 16 checked stock/financial tables.
- Approved migration 0029 was applied/recorded and its temporary branch removed.
  All 39 checked old-column table hashes matched immediately after migration.
  After hosted acceptance, 38 still match; two audited owner-account business
  profile edits (general retail → furniture → wholesale; retail → wholesale selling
  model, at 17:19 UTC) were retained. The event ledger and old return snapshots
  remain empty/null. Stock, transactions, balances, permissions and existing
  allocations are preserved.
- Migrations 0022–0028 are also applied. Unrelated subscription migration 0020 remains
  pending on the hosted database. Do not run all pending hosted migrations blindly.

These are the current Phase 4b release results; historical feature counts remain
in their dated records. Commands, deployment IDs, fixes and evidence paths are in
[the work log](../RELEASE_WORK_LOG.md). Credentials and sessions stay in ignored
private files.

## Product roadmap

Feature phases 1–4c are live within their documented supported scope. Next is
owner/accountant acceptance of actual opening balances, cash counts, statement
clearing and legacy credit-bill reconciliation. Broader historical stock/cost or
accounting claims need their own design and evidence before implementation.
No further product phase or delivery date is assumed. Future schema changes must
be tested on a temporary branch and receive the database tool's required approval.

## Commercial release gates still open

- Razorpay acceptance is on hold by owner instruction; actual provider acceptance
  is incomplete. Subscription migration 0020 requires its own review/rollout.
- Real cloud email delivery and verification/reset/invitation acceptance remain
  unverified. A working login does not establish these journeys.
- Windows installer, clean-machine installation, upgrade and installed recovery
  acceptance remain pending.
- Complete cloud upload persistence, backup/recovery and delivery-format acceptance
  remain open; a working Vercel/Neon test deployment does not finish those gates.
- Accounting/tax supported-scope acceptance, seller identity/support arrangements,
  commercial terms and pilot-customer acceptance remain launch work.

See [delivery phases](release/PHASE_PLAN.md),
[detailed release status](release/STATUS_AND_NEXT_TASKS.md) and their evidence.

## Documentation and repository state

Implementation, feature specifications and acceptance runners through Phase 4c
are committed, published and hosted-verified, with release/admin notes and test-data
reports. Accounting scope, evidence and the next phases are documented.
Phase 4c migration/publication and hosted acceptance are complete. The published
application tree matches accepted local candidate `0508b1f`; final status notes are
a documentation-only follow-up.
Ignored local evidence retains logs and screenshots; credentials and sessions
are excluded. Unrelated test-account and tunnel tooling
remains a separate pending change. Documentation must state its
publication and verification status explicitly.

For each subsequent phase, update this summary, the relevant feature specification
and the work log with what changed, what passed, deployment/migration state and
remaining limits. Preserve dated historical evidence instead of treating old test
counts as results for a newer build.
