# MyBizOne — current status and roadmap

Updated: **17 October 2026**. This is the current project summary. Detailed
behaviour, boundaries and verification remain in the linked feature/release notes.

## Current position

The hosted development application is running at https://mybizoneapp.vercel.app.
The latest verified release is `985ed567442eabcdadb21f45d62b7a975d7763e6`, Vercel
deployment `dpl_86UWZ6PTZsCCg3RqC6phU3r2y4S8` (READY, public alias verified).
It is suitable for ongoing owner testing within its documented supported scope.
**It is not yet accepted for commercial launch.**

Product feature phases below are separate from the older delivery/release phases
in `release/PHASE_PLAN.md`. Completing feature Phase 3a does not complete installer,
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

Industry profiles set defaults and priorities; specialised workflows are separate
capabilities. Choosing an industry does not activate an unfinished module. Existing
products remain untracked until their physical lots are explicitly reconciled.

## Current local candidate — feature Phase 3b

Serial-number inventory and recorded warranties are implemented locally across
purchases, checkout, customer/supplier returns, inspection and damage. Warranty
lookup retains sale-specific terms and store permissions; owner dashboards include
serial inspection priorities. See [the feature specification](SERIAL_INVENTORY_AND_WARRANTIES.md).
110 focused automated tests and 79 local browser checks passed, including the
final production build and phone layouts. The owner approved rollout. Migration
0024 is applied and recorded, and its temporary branch is removed. Publication
and hosted acceptance are in progress. The
migration passed on a temporary database branch with all 13 checked existing
table hashes preserved. This candidate is **not yet live**.

## Latest verification

- 80 automated tests passed across nine focused suites, covering batch workflows
  and relevant transaction, dashboard, profile, analysis and security regressions.
- 53 local production-browser checks and 72 hosted browser checks passed.
- TypeScript, scoped lint and the isolated production build passed. Phone layouts
  were inspected at 360px, including expanded reconciliation forms.
- Approved migration 0023 was applied and recorded; its temporary Neon branch was
  removed. All 13 checked table hashes matched before and after migration and
  hosted acceptance, preserving stock, transactions, balances and role grants.
- Migration 0022 is also applied. Unrelated subscription migration 0020 remains
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

1. **Current candidate — electronics:** serial-number inventory and warranty
   records linked to receipts, sales and returns. Local implementation and
   targeted validation are complete; approved hosted rollout is in progress.
2. **Furniture:** orders, customer advances and delivery allocation, with clear
   ordered/paid/delivered/outstanding states.
3. **Wholesale:** pack/unit conversions, credit terms and fulfilment. Keep the
   existing retail/wholesale selling-model setting independent of these workflows.
4. **Food service:** recipes, ingredient consumption, waste and kitchen tickets.
5. **Accounting foundations:** invoice-level settlement allocation and cashbook/
   advance/refund records before adding invoice ageing or available-cash claims.

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

Feature specifications and implementation through the latest release are committed
and published. The consolidated summary, detailed work log, release/admin notes
and test-data reports are saved in a local documentation commit. The Phase 3b
feature, specification, acceptance runners and updated evidence are also committed
locally, with approved publication in progress. Unrelated test-account and
tunnel tooling remains a separate pending change. Documentation must state its
publication and verification status explicitly.

For each subsequent phase, update this summary, the relevant feature specification
and the work log with what changed, what passed, deployment/migration state and
remaining limits. Preserve dated historical evidence instead of treating old test
counts as results for a newer build.
