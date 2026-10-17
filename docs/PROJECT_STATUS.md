# MyBizOne — current status and roadmap

Updated: **17 October 2026**. This is the current project summary. Detailed
behaviour, boundaries and verification remain in the linked feature/release notes.

## Current position

The hosted development application is running at https://mybizoneapp.vercel.app.
Latest application acceptance: commit `779afcc471c53ba2f64e7d6161495efe19914104`,
Vercel deployment `dpl_779hMViZ4WASFLCQ7VuNNkFTgDKL` (READY, public alias verified).
Documentation-only follow-ups may have newer commit/deployment IDs; application
code is unchanged from this accepted release.
It is suitable for ongoing owner testing within its documented supported scope.
**It is not yet accepted for commercial launch.**

Product feature phases below are separate from the older delivery/release phases
in `release/PHASE_PLAN.md`. Completing feature Phase 3e does not complete installer,
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

Industry profiles set defaults and priorities; specialised workflows are separate
capabilities. Choosing an industry does not activate an unfinished module. Existing
products remain untracked until their physical lots or unit serials are explicitly reconciled.

## Latest feature delivery — Phase 3e

**Inventory → Kitchen preparation** is live for cafés, bakeries and prepared-food
counters. Recipe versions define whole-batch ingredients and expected output.
Prep tickets show ingredient coverage; recording actual completed preparation
consumes ingredients and adds usable finished stock once, with batch trace and
cost estimates. Normal POS sells that finished stock without consuming ingredients
again. Kitchen waste removes physical stock and appears once in current loss reports.
The owner approved migration 0027 and publication. It is applied/recorded and its
temporary branch removed. All 113 read-only hosted browser checks passed; the
phone-filter follow-up passed 10 targeted checks again. All 26 checked existing
tables are preserved, and no kitchen records were invented. This is prep-to-stock;
table ordering and restaurant checks remain separate capabilities. See
[the workflow and supported limits](KITCHEN_PREPARATION_AND_WASTE.md).

## Latest verification

**Phase 4a ready for rollout:** invoice-level customer/supplier settlement allocation and
a recorded cashbook are implemented locally, with 320 tests passing across all
34 web suites plus 17 database tests. Migration 0028 passed on a temporary Neon branch with
37 existing tables preserved; hosted application/publication approval is pending.
All 186 production-browser checks, TypeScript, scoped lint and the production build
passed. The candidate is committed locally; hosted rollout still awaits explicit
migration approval. See [accounting foundations](ACCOUNTING_FOUNDATIONS.md).
The following Phase 3e evidence describes the current live release.

- 187 automated tests passed across 17 focused suites, covering kitchen, wholesale,
  orders, serial/batch workflows and relevant transaction, dashboard, profile,
  analysis and security regressions.
- 165 local production-browser checks and 113 hosted browser checks passed. The hosted
  checks comprise 10 kitchen/register, 11 wholesale/register, 10 order/register,
  10 serial/register, nine batch, 21 workspace, 20 analysis and 22 seeded transaction/
  bill/report checks; all eight runners exited 0. The phone-only follow-up repeated
  all 10 kitchen checks with a filter-width assertion; they passed with zero retries.
- TypeScript, scoped lint, the isolated core-candidate build and hosted release
  builds passed. Phone recipe, preparation, waste and queue layouts were inspected
  at 360px. The hosted follow-up makes kitchen filters full-width on phones.
- Approved migration 0027 was applied and recorded; its temporary Neon branch was
  removed. All 26 checked table hashes matched before and after migration and
  hosted acceptance, preserving stock, transactions, balances and role grants.
- Migrations 0022–0026 are also applied. Unrelated subscription migration 0020 remains
  pending on the hosted database. Do not run all pending hosted migrations blindly.

These are the latest targeted release results, not a claim that every historical
full-suite or delivery acceptance check was rerun for this release. Commands,
deployment IDs, fixes and evidence paths are in [the work log](../RELEASE_WORK_LOG.md).
Credentials and sessions stay in ignored private files.

## Product roadmap

The following capabilities are **not implemented by the latest hosted release**.
Deliver each with its full data flow, permission checks and relevant acceptance
before enabling it. Test new schema changes on a temporary branch and obtain the
explicit migration approval required by the connected database tool.

1. **Phase 4a — verified candidate awaiting rollout:** bill settlement allocation and a
   recorded cashbook. [Scope and evidence](ACCOUNTING_FOUNDATIONS.md).
2. **Phase 4b — next:** general advances, return refunds and correction/reversal records.
3. **Phase 4c:** reconciled opening cash/accounts, transfers and bank clearing before
   verified invoice ageing or available-cash claims.

This is the working order, not a committed delivery-date estimate.

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

Implementation, feature specifications and acceptance runners through Phase 3e
are committed and published, with release/admin notes and test-data reports.
The verified Phase 4a accounting candidate is committed locally and awaits hosted
migration/publication approval. Its scope, evidence and next phases are documented.
Ignored local evidence retains logs and screenshots; credentials and sessions
are excluded. Unrelated test-account and tunnel tooling
remains a separate pending change. Documentation must state its
publication and verification status explicitly.

For each subsequent phase, update this summary, the relevant feature specification
and the work log with what changed, what passed, deployment/migration state and
remaining limits. Preserve dated historical evidence instead of treating old test
counts as results for a newer build.
