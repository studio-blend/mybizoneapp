# MyBizOne — current status and roadmap

Updated: **17 October 2026**. This is the current project summary. Detailed
behaviour, boundaries and verification remain in the linked feature/release notes.

## Current position

The hosted development application is running at https://mybizoneapp.vercel.app.
Latest application acceptance: commit `31c2e5c0d5bc41fda4ca0816a396d746311595b6`,
Vercel deployment `dpl_G311kNYhe6iXmiz6bzBQBRew2zBm` (READY, public alias verified).
Documentation-only follow-ups may have newer commit/deployment IDs; application
code is unchanged from this accepted release.
It is suitable for ongoing owner testing within its documented supported scope.
**It is not yet accepted for commercial launch.**

Product feature phases below are separate from the older delivery/release phases
in `release/PHASE_PLAN.md`. Completing feature Phase 4a does not complete installer,
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

Industry profiles set defaults and priorities; specialised workflows are separate
capabilities. Choosing an industry does not activate an unfinished module. Existing
products remain untracked until their physical lots or unit serials are explicitly reconciled.

## Latest feature delivery — Phase 4a

**Billing → Settlements and Cashbook** now supports partial customer receipts and
supplier payments against specific credit bills, plus evidence-based assignment of
earlier unallocated payments. Assigning money does not collect it again.
The cashbook shows recorded money in/out, daily comparisons and payment-method
totals with India-date filters. Net movement is not cleared or available cash.

The owner approved migration 0028 and publication. It is applied/recorded and the
temporary branch removed. All 125 read-only hosted browser checks passed, with
all 37 checked existing tables preserved. Existing four customer and four supplier
settlements remain unallocated until their bill evidence is reconciled. General
advances, general return refunds and reversal records follow in Phase 4b. See
[the workflow and supported limits](ACCOUNTING_FOUNDATIONS.md).

## Latest verification

**Phase 4b verified candidate, awaiting rollout approval:** general customer/supplier
advances, partial use/refunds, paid-return refund entitlements, explicit refunds and
linked corrections are implemented and committed locally. All **365 automated
tests, 215 local production-browser checks**, production build, TypeScript and
scoped lint passed. Migration 0029 preserved all 39 checked existing tables on a
temporary Neon branch; hosted application/migration changes have not occurred.
See [advances, refunds and corrections](ADVANCES_REFUNDS_AND_CORRECTIONS.md).

The following bullets describe the current **live Phase 4a** release.

- **337 automated tests passed:** 320 web tests across 34 suites and 17 database
  tests across three suites, zero failures/skips. Includes 27 real PostgreSQL
  accounting cases and three date-range cases.
- **186 local production-browser checks passed** across 13 runners, including
  accounting transactions, phone/role checks and previous feature regressions.
- **125 read-only hosted browser checks passed** across nine runners: 12 accounting,
  10 kitchen, 11 wholesale, 10 orders, 10 serials, nine batch, 21 workspace,
  20 analysis and 22 seeded transaction/bill/report checks; all runners exited 0.
- TypeScript, production build and scoped lint passed. Five existing return-helper
  non-null warnings remain. New accounting layouts were inspected at 360px.
- Approved migration 0028 was applied and recorded; its temporary branch was
  removed. All 37 checked table hashes matched before/after migration and hosted
  acceptance, preserving stock, transactions, balances and role grants. New
  allocation tables remain empty; no hosted financial fixtures were created.
- Migrations 0022–0027 are also applied. Unrelated subscription migration 0020 remains
  pending on the hosted database. Do not run all pending hosted migrations blindly.

These are the current Phase 4a release results; historical feature counts remain
in their dated records. Commands, deployment IDs, fixes and evidence paths are in
[the work log](../RELEASE_WORK_LOG.md). Credentials and sessions stay in ignored
private files.

## Product roadmap

The following capabilities are **not implemented by the latest hosted release**.
Deliver each with its full data flow, permission checks and relevant acceptance
before enabling it. Test new schema changes on a temporary branch and obtain the
explicit migration approval required by the connected database tool.

1. **Phase 4b — verified candidate awaiting rollout:** general advances, return refunds
   and correction/reversal records. [Scope and evidence](ADVANCES_REFUNDS_AND_CORRECTIONS.md).
2. **Phase 4c — next:** reconciled opening cash/accounts, transfers and bank clearing before
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

Implementation, feature specifications and acceptance runners through Phase 4a
are committed, published and hosted-verified, with release/admin notes and test-data
reports. Accounting scope, evidence and the next phases are documented.
The verified Phase 4b candidate is committed locally; its prepared migration 0029
and hosted publication await explicit rollout approval.
Ignored local evidence retains logs and screenshots; credentials and sessions
are excluded. Unrelated test-account and tunnel tooling
remains a separate pending change. Documentation must state its
publication and verification status explicitly.

For each subsequent phase, update this summary, the relevant feature specification
and the work log with what changed, what passed, deployment/migration state and
remaining limits. Preserve dated historical evidence instead of treating old test
counts as results for a newer build.
