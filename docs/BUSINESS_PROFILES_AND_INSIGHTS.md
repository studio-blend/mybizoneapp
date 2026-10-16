# Business profiles and owner insights

## Phased delivery

1. **Profiles and core owner decisions**: business defaults, independent per-store
   overrides, separate selling model, product profitability, slow-stock review,
   stock-cover estimates and store comparisons. Phase 1 is live.
2. **Daily operating analysis**: gross-profit trends, day/hour sales heatmaps,
   customer collection priorities, returns/discount/damage analysis and drill-downs.
   Implemented in [Operating analysis](OPERATING_ANALYSIS.md).
   Keep the initial dashboard focused and place secondary analysis behind details
   or dedicated reports. Add invoice allocation and cashbook records before
   promising invoice ageing or available-cash figures.
3. **Specialised capabilities**, delivered separately with complete workflows:
   grocery batches/expiry and FEFO; electronics serials/warranty; furniture order,
   advance and delivery allocation; wholesale packs/credit terms/fulfilment;
   restaurant recipes, ingredient consumption, waste and kitchen tickets. Enable
   each capability only once its records, permissions, flows and tests exist.
   Phase 3a implements optional per-product [batches and expiry](STOCK_BATCHES_AND_EXPIRY.md).
   Migration 0023 was approved and applied on 17 October 2026. The remaining
   capabilities are subsequent deliveries.

## Phase 1 behaviour

Choose an industry in Settings → Business profile and a selling model (Retail,
Wholesale or both). Stores → Configure profile can override either independently;
null means inherit. New stores inherit by default. Onboarding captures the business
defaults. General retail is the safe default for existing businesses; the old
`vertical` field remains intact. No prices, product definitions, roles, transaction
records or existing route permissions change when a profile changes.

Profiles: General retail/utensils (30 days), Grocery (14), Furniture (90),
Electronics (60), Wholesale/distribution (60), Restaurant/café (7). These are
initial **review periods**, not expiry dates or automatic markdown rules. Industry
and selling model are independent, so a grocery store can also sell wholesale.
Stock-oriented profiles prioritise slow-stock review; wholesale selling prioritises
collections. The master view combines allowed stores and labels mixed profiles.
The owner retains every role workspace and existing scope filters.

Profile selection configures supported dashboard priorities. Optional batch and
expiry tracking has a separate explicit stock reconciliation workflow in Phase 3a;
restaurant and warranty workflows are subsequent deliveries. No nonfunctional
capability switches are exposed.

## Calculations and boundaries

- Product profitability: completed non-estimate sale-line revenue less returned
  line revenue, excluding GST, minus recorded cost snapshots net of return costs. Free-item
  quantities contribute cost. Up to six products ranked by gross profit; products
  with missing sale **or return** cost snapshots show unavailable profit/margin
  and sort after complete records. Gross profit excludes operating expenses.
- Store comparison: net sales and bill count, equal-length previous-period sales,
  gross profit and margin excluding GST for financial roles. Zero previous sales is labelled
  no baseline; non-positive net sales has no margin percentage. Returns-only
  stores and stores with zero activity remain visible. Current department
  attribution follows the same policy as the existing dashboard.
- Slow stock: active products with positive stock whose last completed
  non-estimate sale (or creation date if never sold) is at least the store
  profile's review period ago. Up to six, longest idle first. This is days
  without sales, **not FIFO inventory age**. Stock value uses current cost and
  is unavailable when missing. Current stock analysis ignores the activity filter.
- Stock cover: current stock divided by average gross quantities sold per calendar
  day over up to 30 days. Includes free quantities; at least 14 days since product
  creation and a sale required. Returns, stockout days, seasonality and supplier
  lead time are not modelled. Explicitly labelled rough estimates, with no automatic
  purchase or expiry prediction. Up to six shortest cover estimates.
- Every query uses tenant RLS plus the existing workspace's store/department
  predicates. Stock-only and department-only payloads contain no product cost
  values or product profit rows. Profile changes require business-wide settings
  or store administration permission and write an audit record in the same
  transaction. Cross-tenant IDs cannot update a store.

## Migration and acceptance

Local validation on 16 October 2026: 28 tests passed across policy, profile,
real isolated PostgreSQL dashboard and authenticated server-action tests. Scoped
Biome, TypeScript and production build passed. Seven new browser checks plus
21 existing workspace checks passed against the isolated production build.
Owner and department mobile layouts were visually inspected at 360px. The local
account retains older test stores alongside the four AR demo stores.

Migration 0022 was also prepared on Neon temporary branch `br-shy-smoke-aogxemq6`.
Before/after checks preserved all 26 sales (total 370300), 34 products (1172.250
stock units), customer/supplier balances, 34 role grants and existing store counts.
All 14 businesses received general-retail/retail defaults, all eight stores
inherit, and all four database constraints were present. The owner subsequently
approved applying migration 0022 and publishing Phase 1. Final deployment
`94323c055af1ff817a7257bb25e46feafc215dae` passed all 28 hosted browser checks.
The migration is recorded and its temporary branch was removed. Full evidence
is in the release work log.

Private/cache evidence: `.cache/business-profiles-tests.log`,
`.cache/business-profiles-build.log`, `.cache/business-profiles-typecheck.log`,
`.cache/business-profiles-biome-clean.log`,
`.cache/business-profiles-browser-local.json`,
`.cache/business-profiles-workspace-regression.log`,
`.cache/business-profile-screenshots/`. Credentials and sessions are excluded.

`0022_business_profiles.sql` adds four checked text columns: business industry and
selling defaults, plus nullable store overrides. Existing businesses default to
general retail / retail and stores inherit. No transaction backfill or amount
change is needed. Record this file in `_migrations` after hosted tool application.
Normal migration execution records it automatically. Test on a temporary Neon
branch before applying to the hosted database.

Validation evidence is recorded in the release work log. The isolated tests cover
inheritance, independent selling models, permissions, tenant isolation, thresholds,
new products, free items, returns, missing costs and stock-cover requirements.
`scripts/verify-business-profiles.mjs` checks actual browser saves, inheritance,
owner insights, department restrictions and 360px layouts. It configures only the
four saved AR demo stores and the saved demo business defaults; credentials remain
private. Run only against the allowed local/hosted origins.
