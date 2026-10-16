# Operating analysis — Phase 2

## Experience

Every non-marketing dashboard links to **Operating analysis**, preserving its
workspace, store, department and period. The detailed page reuses the same scope
resolver and tenant transaction as the dashboard. Marketing stays in the customer
workspace. Inventory analysis contains assigned damage quantities only; sales and
billing analysis contains sales patterns and adjustments without profit or costs.
Owners can inspect every supported workspace with its normal visibility rules.

- The daily chart switches between **Net billed sales** and **Gross profit** for
  financial views. Zero-activity days remain visible, negative days are preserved
  and missing costs create gaps. An expandable table exposes the values.
- The hourly heatmap groups completed bills in Asia/Kolkata, Monday–Sunday and
  00:00–23:59. Colour represents bill count divided by calendar occurrences of that
  weekday in the chosen period. This avoids comparing three Fridays directly with
  two Mondays. Closed days are not recorded and today may be partial. This is
  checkout activity, not footfall, conversion rate or staff productivity.
- Selecting a populated heatmap cell opens the latest ten bills for that weekday
  and hour. The explicit time form supports empty hours and clearing filters.
  These filters narrow only the bill list; the overall charts/totals retain their
  date range. Department-only lists show authorized line amounts and hide full bill
  IDs/numbers. Scope/date/time filters submit ordinary GET navigation. The app's
  existing React streamed loading boundary requires JavaScript to finish displaying
  authenticated pages; full JavaScript-disabled rendering is not claimed.
- Current collection priorities rank the largest eight positive customer balances
  across all dates. Last recorded collection is contextual, not invoice ageing.
  Positive recorded credit limits flag balances above that amount; no new credit
  enforcement is introduced. Only unfiltered master/accounts views load shared
  balances. Links open permitted customer ledgers or prefill a settlement form
  with a tenant-validated customer. Nothing submits a payment or sends a reminder.
- Expandable adjustments show the six leading product groups for each category,
  while their summaries cover **all** matching events. Current product links open
  existing product search when permitted. Deleted products retain their recorded
  names; missing attribution is excluded from store/department-scoped damage views.

## Calculation rules

**Net billed sales** = completed non-estimate sale-line totals minus completed
return-line totals recorded in the period, including GST. Returns of older bills
are included when their original bill still identifies a permitted store.

**Gross profit** = billed sales minus net recorded GST minus net recorded product
costs. Free-item quantities contribute historical cost and returned costs are
reversed. Operating expenses and damage are not subtracted from this gross-profit
measure. A missing sale or return cost snapshot makes that day's/period's profit
unavailable. Previous-period totals cover an equal number of calendar days.

The master summary, daily trends, product profitability and store-profit/margin
calculations now consistently exclude GST from profit. Store comparison bars
remain billed sales; their margin denominator excludes GST. Existing financial
widgets no longer imply that tax collected is profit, or that an unknown cost is
zero. Product margin uses sales excluding GST. No transaction amounts are changed.

Adjustments are separate measures and must not be added as one loss total:

- **Discounts**: on non-free sale lines, rounded quantity × recorded unit price
  less the taxable line value (`line_total - gst_amount`), floored at zero. This
  captures allocated bill discounts and line discounts without adding the header
  discount a second time. These are original sale-period reductions; later returns
  do not rewrite the historical discount event.
- **Free items**: their recorded retail value before GST. Their actual cost is
  already included in gross profit; retail value is not another expense.
- **Returns**: returned billed value including GST, not a claim of cash paid out.
- **Damage**: recorded total cost, or quantity × recorded unit cost when the total
  is absent. Current catalog cost is never substituted into old damage records.
  Partial known totals and missing valuations are identified. Nonfinancial views
  never query or expose damage costs, including in chart data or HTML styles.

All financial data is scoped before aggregation. The bill count is computed after
grouping authorized lines into distinct bills, so multiple items do not inflate
the heatmap. The optional weekday/hour URL filters are validated and never widen
access. Shared customers/settlements stay separate from store-assigned sales.

## Data and verification

No schema migration, capability flag, external provider call, payment or email is
needed. `dashboard-queries.ts` supplies common scoped source queries to both pages;
the initial dashboard adds no extra query. Analysis results are bounded to daily
aggregates, 168 hour cells, eight customers, ten bills and six groups/category.

Isolated PostgreSQL fixtures cover GST, free items, prior-period bills returned
now, negative/zero days, missing return/damage costs, timezone boundaries,
per-weekday exposure, current collections, cross-tenant/store/department isolation,
inventory-only payloads and multi-role grants. Core dashboard/profile/auth tests
run alongside them. The read-only browser runner is
`scripts/verify-operating-analysis.mjs`, accepting only the saved local/hosted test
origins and keeping credentials/cookies private. Publication and final validation
are recorded in the release work log.

Local acceptance on 16 October 2026: all 39 focused tests passed, with the eight
analysis database tests rerun successfully after adding the independent P&L
reconciliation assertion. Scoped Biome, TypeScript and production build passed.
Twenty new operating-analysis browser checks and all 21 existing workspace checks
passed on the local production build. Owner, accounts, inventory and department
layouts were checked at 360px and visually inspected. The first browser pass
caught a stalled client-router time drill-down; ordinary links fixed it. Mobile
measurements wait for Playwright's screenshot/layout stabilization so the chart's
ResizeObserver has completed its viewport update.

The additional JavaScript-disabled check confirmed the existing streaming
limitation above. That observation is retained separately and is not counted as a
passing check. Evidence: `.cache/operating-analysis-tests.log`,
`.cache/operating-analysis-report-tests.log`, `.cache/operating-analysis-build.log`,
`.cache/operating-analysis-typecheck.log`, `.cache/operating-analysis-biome-final.log`,
`.cache/operating-analysis-browser-local.json`,
`.cache/operating-analysis-workspace-local.log`,
`.cache/operating-analysis-nojs-observation.json`,
`.cache/operating-analysis-screenshots/`.

The hosted Phase 2 build reached READY with commit
`73a5a86d327b55be675638e6799601176f348e70`. All 20 new hosted checks passed on
16 October 2026. Earlier attempts encountered `ECONNRESET` and Chromium
`ERR_NETWORK_CHANGED`; the acceptance runners now allow at most two retries for
only those transport errors and record their retry count. HTTP failures and
assertions are not retried. The successful operating-analysis run needed zero
retries. Final workspace regression and chart-resize containment are recorded
in the release work log. No financial entry was submitted by acceptance.
