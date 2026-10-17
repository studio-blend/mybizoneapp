# Wholesale packs, credit terms and fulfilment — feature Phase 3d

Status: published and verified on 17 October 2026. The owner approved rollout;
migration 0026 is applied and recorded, and its temporary branch is removed.
Application acceptance commit: `f5b0b6df2c1695803a836ea68a5c08f5a4c12184`.
Vercel deployment `dpl_3pCRTn7LbvLmDNWT872Ui7ap74MN` reached READY and the
public alias was verified. Documentation-only follow-ups preserve this application.

Products retain one stock unit. Optional named packs convert whole pack counts
plus loose quantities into that unit with exact integer arithmetic. All prices
are explicitly per stock unit, including wholesale/customer rate tiers; displayed
pack values are derived from that price. Arbitrary per-pack price overrides and
independently stocked/sealed containers are outside this phase.

Purchase, checkout and order entry accept packs and retain immutable conversion
snapshots. Stock, batches, serial counts, costs, taxes and returns continue in base
units. Archiving or replacing a pack never changes an existing document. Handover
uses base quantities, with the original pack equivalent shown for clarity.
Stock writes recheck the current unit/store atomically. Returns require the
recorded unit to match current stock and otherwise require reconciliation first.

Wholesale fulfilment reuses the order/advance/delivery ledger. Wholesale orders
can be filtered separately, including partial/late handovers. Booking does not
reserve stock, consume credit or create debt. Receipts and returns stay allocated
to that order and preserve unrelated customer debt.

Customers have configurable credit days (0 means due on the bill date) and an
existing credit limit (0 means no configured ceiling). Positive limits constrain
new unpaid POS/EMI principal and net unpaid order deliveries, including concurrent
sales. Advances offset the order delivery before its credit check. Existing debt,
cash sales, collections and returns are not rewritten or blocked by a newly lower
limit. Order credit days are agreed at booking and frozen; due dates start at each
physical handover. General settlement and legacy invoice ageing limits remain.
Changing customer credit limits or days also requires business-wide finance
permission. Contact-only edits preserve terms, including older callers omitting them.
Supplier payments retain the existing purchase/settlement workflow; new supplier
credit-day terms, quantity-break price bands and independently priced packs are
outside this phase.

This phase requires migration 0026. Local acceptance and the temporary Neon branch
test passed; the owner explicitly approved applying and publishing this phase.

## Entry points and supported behaviour

- Inventory → Pack definitions: configure a real conversion for a product in a
  permitted store. Definitions are immutable; archive and replace them for future
  entry. Existing documents retain their original name, size and quantities.
- Purchases → New purchase: enter whole packs plus loose units, with cost per base
  unit. The receipt detail shows both the original pack breakdown and base stock.
- Billing → POS: registered customers use their configured retail/wholesale/MRP/
  Rate 1–4 price tier. Dealer uses Rate 1; an unset tier falls back to retail,
  while an explicitly configured zero price remains zero. Packs do not silently
  change the price tier. The submitted preview price is rechecked by the server.
- Billing → Customer orders → Wholesale fulfilment: filter wholesale commitments
  and create a wholesale booking. Retail-category customers receive wholesale
  price suggestions on these orders; explicit customer tiers take precedence.
  Agreed per-base-unit prices remain editable, as in the existing order workflow.
- Customer credit days and limits are visible in the customer profile. Updating
  them requires both customer-management and business-wide finance permission.
  Existing positive ceilings now constrain new unpaid transactions. A zero ceiling
  retains the existing meaning of no configured limit; there is no automatic
  credit approval or identity-verification workflow in this phase.
- Part deliveries create their own bills and due dates. Base quantities are
  authoritative; handover bill notes show the equivalent original pack breakdown.
  Returns explicitly ask for base stock units. Changed units stop stock writes
  and returns for reconciliation instead of converting old goods into new units.

## Accepted local candidate verification

162 focused automated tests across 15 suites passed, plus two actual PDF rendering
tests covering GST/non-GST documents with pack notes and due dates. Tests include
unit-change races, concurrent credit commands, finance-only term editing, measured
packs, exact serial counts, GST and existing order/stock/permission regressions.
The isolated production build, including TypeScript, passed. All **136 local
production-browser checks** passed across nine runners: 17 wholesale workflow,
11 wholesale/register, 19 order workflow, 10 order/register, 12 batch workflow,
16 serial workflow, 10 serial/register, 21 dashboard workspace and 20 operating
analysis checks. Each runner exited 0; all five read-only transport counters were
zero. Pack entry, purchase/checkout, customer credit and partial/final fulfilment
layouts were inspected at 360px. Scoped lint passed with six non-null assertion
warnings in customer/return code; acceptance scripts passed scoped lint.

Migration 0026 passed on temporary Neon branch `br-noisy-shape-aopw6g4c`. All 25
checked existing tables retain their original row counts/hashes after excluding
only the new default/null columns. Product packs remain empty; customer/order
defaults preserve old semantics. FORCE RLS, tenant/product ownership, immutable
conversion grants and frozen order terms passed. Hosted migration and publication
are approved. Migration 0026 is applied and recorded, its temporary branch is
removed, and all 25 fresh pre/post-migration existing-table hashes match.
Hosted FORCE RLS and immutable conversion/frozen term grants passed. Unrelated
subscription migration 0020 remains pending.

All **103 hosted browser checks passed**: 11 wholesale/register, 10 order/register,
10 serial/register, nine batch, 21 workspace, 20 analysis and 22 seeded transaction,
bill and report checks. All seven runners exited 0; the six with transport counters
reported zero retries. Hosted phone layouts were inspected at 360px. No financial
or inventory form was saved, product packs remain empty, and all 25 existing-table
hashes still match the fresh pre-migration baseline after acceptance. Define actual
pack conversions before using pack entry; no packaging sizes were invented.
Detailed commands/evidence and the
next phase are in [the work log](../RELEASE_WORK_LOG.md) and
[project roadmap](PROJECT_STATUS.md).
