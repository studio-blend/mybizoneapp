# MyBizOne — current status and roadmap

Updated: **17 October 2026**. This is the current project summary. Detailed
behaviour, boundaries and verification remain in the linked feature/release notes.

## Current position

The hosted development application is running at https://mybizoneapp.vercel.app.
Latest application acceptance: commit `4ef78ec84b6f9909308a9416402f87b3828048aa`,
Vercel deployment `dpl_E1xh2C2CzKscMwberF36GYfKHTE7` (READY, public alias verified).
Documentation-only follow-ups may have newer commit/deployment IDs; application
code is unchanged from this accepted release.
It is suitable for ongoing owner testing within its documented supported scope.
**It is not yet accepted for commercial launch.**

Product feature phases below are separate from the older delivery/release phases
in `release/PHASE_PLAN.md`. Completing feature Phase 3c does not complete installer,
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

Industry profiles set defaults and priorities; specialised workflows are separate
capabilities. Choosing an industry does not activate an unfinished module. Existing
products remain untracked until their physical lots or unit serials are explicitly reconciled.

## Latest feature delivery — Phase 3c

Customer orders, advances and partial deliveries are live at **Billing → Customer
orders**. Booking records an agreement without moving stock or creating revenue
or customer debt. Physical handovers create normal bills; exact order receipts,
returns and refunds preserve advance liabilities and delivered bill balances.
The owner approved migration 0025 and publication. It is applied and recorded,
and its temporary branch is removed. All 92 read-only hosted browser checks
passed, and all 19 checked existing-table hashes match before migration, after
migration and after hosted acceptance. No fabricated order/payment records were
added. See [the feature specification](CUSTOMER_ORDERS_AND_ADVANCES.md).

## Latest verification

- 137 automated tests passed across 13 focused suites, covering orders, serial/batch
  workflows and relevant transaction, dashboard, profile, analysis and security regressions.
- 108 local production-browser checks and 92 hosted browser checks passed. The hosted
  checks comprise 10 order/register, 10 serial/register, nine batch, 21 workspace,
  20 analysis and 22 seeded transaction/bill/report checks; all six runners exited 0.
- TypeScript, scoped lint and the isolated production build passed. Phone layouts
  were inspected at 360px, including order booking and expanded reconciliation forms.
- Approved migration 0025 was applied and recorded; its temporary Neon branch was
  removed. All 19 checked table hashes matched before and after migration and
  hosted acceptance, preserving stock, transactions, balances and role grants.
- Migrations 0022–0024 are also applied. Unrelated subscription migration 0020 remains
  pending on the hosted database. Do not run all pending hosted migrations blindly.

These are the latest targeted release results, not a claim that every historical
full-suite or delivery acceptance check was rerun for this release. Commands,
deployment IDs, fixes and evidence paths are in [the work log](../RELEASE_WORK_LOG.md).
Credentials and sessions stay in ignored private files.

## Product roadmap

**Phase 3d approved rollout in progress — wholesale:** pack conversions,
customer-tier pricing, credit days/limits and wholesale order fulfilment passed
local acceptance: 162 focused automated tests, two native PDF checks, 136
production-browser checks, TypeScript and the production build. Migration 0026
passed on a temporary Neon branch with 25 checked existing tables preserved;
the owner approved rollout and migration 0026 is applied/recorded, with its
temporary branch removed. All 25 fresh pre/post-migration hashes match.
Application publication and hosted acceptance follow; Phase 3c is the latest
accepted application release until those checks finish.
See [scope, verification and rollout status](WHOLESALE_PACKS_AND_CREDIT.md).

The following capabilities are **not implemented by the latest hosted release**.
Deliver each with its full data flow, permission checks and relevant acceptance
before enabling it. Test new schema changes on a temporary branch and obtain the
explicit migration approval required by the connected database tool.

1. **Approved rollout in progress — wholesale:** pack/unit conversions, credit terms and fulfilment. Keep the
   existing retail/wholesale selling-model setting independent of these workflows.
2. **Food service:** recipes, ingredient consumption, waste and kitchen tickets.
3. **Accounting foundations:** invoice-level settlement allocation and cashbook/
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

Feature specifications, implementation, the consolidated summary, work log,
release/admin notes, test-data reports and Phase 3c acceptance runners are committed
and published. Ignored local evidence files retain detailed logs and screenshots;
credentials and sessions are excluded. Unrelated test-account and tunnel tooling
remains a separate pending change. Documentation must state its
publication and verification status explicitly.

For each subsequent phase, update this summary, the relevant feature specification
and the work log with what changed, what passed, deployment/migration state and
remaining limits. Preserve dated historical evidence instead of treating old test
counts as results for a newer build.
