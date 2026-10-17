# Recipes, kitchen preparation and waste — feature Phase 3e

Status: local production acceptance passed; owner approved hosted rollout.
Migration 0027 is applied and recorded, and its temporary branch is removed.
Publication and hosted acceptance are in progress; Phase 3d remains the latest
accepted application release until those checks finish.

This is a **prep-to-stock** workflow for cafés, bakeries and prepared-food counters.
A kitchen ticket plans whole recipe batches. Recording actual completed preparation
consumes the recipe ingredients and adds usable finished stock in one transaction.
Cashiers sell that stock through the existing POS, without consuming ingredients
again. It does not implement table ordering, restaurant checks, automatic
order-to-kitchen routing, modifiers, live ingredient reservations or partial cooking.
Industry profiles do not activate or invent recipes, stock, lots or expiry dates.

## Daily workflow

1. Add ingredients and finished goods as separate ordinary products in one store.
   Choose real base units and costs. Optional batch tracking uses the existing
   physical reconciliation workflow; serial-tracked products are excluded.
2. Inventory → Kitchen preparation → Recipe versions. Record one batch's ingredients
   and expected yield in their base stock units. For stock in kg, 150g is entered
   as 0.150 kg. Recipes use whole production batches; ingredients and measured yield
   retain exact three-decimal precision. No implicit g/kg or volume conversion occurs.
3. Create a prep ticket with recipe version, whole batch count, kitchen reference
   and notes. The queue shows awaiting/in-kitchen/today counts, native store/status
   filters and the latest 100 matching tickets. Ingredient coverage compares needed
   quantities with currently sellable stock. It is checked again when recording.
4. Start preparation to mark work in progress. Planning and starting are work intent,
   **not stock reservations or consumption**. Record completed preparation promptly
   when ingredients have actually been used and finished goods are ready. All stock
   is rechecked under product locks; another transaction may consume it first.
5. Record actual positive finished quantity, up to the ticket's target. The full
   recipe quantities are consumed even for a lower usable yield. Tracked ingredients
   use unexpired, non-quarantined batches FEFO. Tracked output requires an actual
   batch code and expiry after today, following the existing day-based expiry rule.
   The printed prep ticket and completed history retain the recipe and consumption.
6. Sell prepared stock through normal checkout. Write off unsold/spoiled finished
   goods or raw ingredients in Kitchen waste, selecting the physical batch when
   tracked. Each waste record also appears once in Damage Logs and existing loss
   reports. Do not discard already-consumed ingredients a second time.

Queued or preparing tickets may be cancelled without moving stock. If a batch fails
with no usable output, record its actually lost ingredients as waste and cancel the
unrecorded ticket, using the ticket reference in the waste notes. There is no automatic
multi-ingredient failed-batch transaction. Completed preparation cannot be cancelled
or reversed; physical spoilage/return handling uses the existing stock workflows.

## Agreements, costs and permissions

Recipes and their ingredient lines are immutable versions. Archive and replace a
recipe to change future planning. Existing tickets retain their version and can
complete after archive. Changed product unit/store/activity or serial tracking stops
preparation for reconciliation; the application never converts old quantities into
new units. Same-store inputs, separate output and distinct ingredient lines are required.
Nested prepared ingredients must already be on hand; recipes do not run recursively.

Completion records ingredient cost snapshots and an estimated production unit cost.
Costs use current product costs, not historical lot costing, and exclude labour,
overheads and a separate accounting journal. Existing finished stock gets a weighted
blended unit cost when all relevant costs are known. Missing cost remains null/unknown;
zero cost is valid. Rounding uses integer cents and explicit quantity precision.
Lower yield increases the ingredient cost per usable unit. Waste summaries cover
30 India-calendar days, show recorded value and identify unknown-cost records separately.

Stock managers need `manage_inventory` for the ticket's/product's store. Recipe
configuration also requires `manage_products` for that store. Department-only and
other-store grants do not give kitchen access. Owner retains all permitted stores.
FORCE RLS and composite tenant foreign keys protect the five new tables. Recipes,
consumption rows and kitchen waste references have narrow append-only grants; ticket grants cannot
change agreed recipe, store, reference or batch count. Waste quantities and values
remain in the existing damage ledger; this phase leaves its legacy database grants
unchanged and exposes no waste edit/reversal command. Request fingerprints, locks
and ticket completion state prevent repeated saves from duplicating stock movements.

## Candidate verification and rollout

187 automated tests across 17 suites passed, including 25 new kitchen policy and
real PostgreSQL integration checks. They cover exact recipe scaling, lower/unknown
cost yield, concurrent ingredient competition, FEFO, expiry, rollback, archive,
retries, waste and tenant/store permissions, plus previous wholesale/order/batch/
serial/transaction/dashboard/profile/analysis/security regressions. TypeScript and
scoped lint passed; one existing batch-helper non-null assertion warning remains.
The isolated production build (including TypeScript) passed. All **165 local
production-browser checks** passed across 11 runners: 19 kitchen workflow,
10 kitchen/register, 17 wholesale workflow, 11 wholesale/register, 19 order workflow,
10 order/register, 12 batch workflow, 16 serial workflow, 10 serial/register,
21 dashboard workspace and 20 operating analysis. All runners exited 0; all six
read-only transport counters were zero. Recipe, preparation, completion, queue
and waste forms were visually inspected at 360px. Guarded workflow fixtures were
removed with existing stock, sales and customer/supplier balances preserved.
The owner explicitly approved applying migration 0027 and publishing this phase.

Migration 0027 passed on temporary Neon branch `br-solitary-fog-aodajtsv`, migration
`06b4d3d9-6734-4843-81d3-196109e16a4d`. All 26 checked existing-table counts/hashes
match the parent branch, including full current row contents. The five new tables
are empty and retain FORCE RLS, composite tenant keys and narrow column grants.
Recipe quantities, ticket batch counts, consumption and new waste references cannot be
updated or deleted through normal grants. Only recipe archive and ticket progress/
completion fields are writable. Existing batch movement checks retain their old
kinds and add signed kitchen consumption/output kinds. Hosted application of
0027 and publication are approved. Migration 0027 is applied/recorded and the
temporary branch removed; all 26 fresh pre/post-migration existing-table hashes
match. Hosted tenant/column grant checks passed and the five new tables are empty.
Publication and read-only hosted acceptance follow. Subscription migration 0020
is unrelated and remains pending.
No kitchen or financial fixtures have been added to hosted data.

Detailed evidence and subsequent work belong in [the work log](../RELEASE_WORK_LOG.md)
and [project roadmap](PROJECT_STATUS.md).
