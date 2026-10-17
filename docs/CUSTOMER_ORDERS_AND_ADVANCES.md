# Customer orders, advances and deliveries — feature Phase 3c

Status: owner approved rollout on 17 October 2026. Migration 0025 is applied and
recorded, and its temporary branch is removed. Publication and read-only hosted
acceptance are in progress. Entry point: **Billing → Customer orders**.

Orders are an optional workflow across industries, including furniture. An order
records the agreed products, prices/tax terms, customer, address and promised
date. Creating an order does not reserve stock, create revenue or change debt.
Physical handover creates a normal sale/bill for exactly that delivery's items,
including partial deliveries. Existing stock, batch/expiry and serial checks apply.

Actual receipts/refunds are recorded in an order-specific append-only ledger.
Unapplied receipts remain order advances, separate from customer receivables.
Payments apply to that order's delivery bills only. Unpaid delivered value changes
the customer's debt; undelivered order balance is a commitment, not overdue debt.
General customer settlements must not consume order bills managed by this ledger.

Prices and tax amounts are frozen when ordering. Partial delivery amounts use
cumulative proportional rounding so the last delivery absorbs the final cent and
all bills sum to the agreement. Product price edits do not reprice an order.
Changed units/store or unavailable goods prevent handover; no stock is promised
as reserved. Changed GST identity on a GST order requires reconciliation first.
Cost is captured at handover. A delivery bill's reference due date is its actual
handover date, rather than the earlier promised date; the order promise remains
visible separately. Existing general invoice settlement/ageing limits still apply.

Cancellation closes only the undelivered remainder, preserves delivered bills and
unpaid delivery debt, and requires unused advances to be refunded first. Refunds
record money already returned outside the application and cannot exceed held
advances. Returns of delivered goods use the existing return workflow: unpaid
value reduces exact order debt. Excess paid value first pays other unpaid delivery
bills of the same order; any remainder becomes held advance available for an
explicit refund. Returned quantities do not automatically authorize a
replacement delivery. Repeat submissions use request IDs and cannot duplicate
receipts or deliveries. Order history also prevents customer deletion even when
the customer's receivable balance is zero.

Order lookup follows store-based sales/report access; department-only destinations
remain unsupported. Creation/delivery changes require business-wide sales access
because registered customer balances are shared. Accounts users can record actual
receipts/refunds through their finance permission. Dashboard delivery quantities
respect store/department scopes without exposing customer or money fields to
nonfinancial inventory views. Financial views separate order advances and payments
from billed revenue. Existing general cashbook/provider/commercial limits remain.

## Supported boundaries

- Registered customers and one store per order; agreed quantities, unit prices and
  tax snapshots are immutable. Changes to commercial terms require cancelling the
  undelivered remainder and creating a new agreement.
- Delivery notes record a physical handover and recipient/reference; there is no
  shipping carrier integration, reservation, manufacturing or replacement order.
- Receipt/refund notes record actual money movement outside the app. They do not
  initiate payments, transfers or refunds, and do not prove available cash.
- Existing quotations/challans are separate documents. No old bills, settlements
  or customer balances are automatically converted into this order ledger.
- Cancellation/rescheduling are audited. Payment and allocation history is append
  only; database column grants prevent edits to agreed prices and payment records.
- Order forms wait for client readiness before accepting input or submission,
  retaining one request ID when a failed network response is retried.

## Rollout and verification

Migration **0025** adds six tenant-isolated tables and composite ownership keys;
it does not backfill or modify existing business records. It passed on temporary
Neon branch `br-bold-sea-ao7nfopd` with all **19 existing-table hashes unchanged**.
FORCE RLS, tenant/order foreign keys and restricted column update grants passed.
The owner approved completion through Neon's migration tool. All 19 fresh
pre-migration table hashes still match after applying the migration, and the six
tables retain forced tenant isolation and restricted update/delete privileges.

137 focused automated tests across 13 suites passed, including concurrent stock
and money commands, retry idempotence, partial GST rounding, serial warranties,
expired stock rejection, returns, refunds, cancellation, tenant/role boundaries,
query/dashboard privacy and customer-history preservation. The isolated production
build, TypeScript and scoped Biome checks passed (three non-null assertion warnings
in returns). **108 production-browser checks passed**: 19 order workflow, 10
read-only order/register, 12 batch, 16 serial workflow, 10 serial/register, 21 role
workspace and 20 operating-analysis checks. Phone layouts were inspected at 360px.
All seven runners exited 0; the read-only runners reported zero transport retries.
The full workflow used guarded disposable local fixtures and cleaned them up.
No fabricated orders, advances, deliveries or refunds were added to the hosted account.

Apply and record migration 0025 before deploying the application, because dashboard
queries use its new tables. Then publish the exact accepted source and repeat
read-only hosted order/report/dashboard/stock acceptance. Do not run all pending
hosted migrations: subscription migration 0020 is unrelated and still pending.
Evidence and release commands are recorded in [the work log](../RELEASE_WORK_LOG.md).
