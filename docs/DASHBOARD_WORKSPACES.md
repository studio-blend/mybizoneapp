# Dashboard workspaces — 15 October 2026

The dashboard now adapts to the current user's role grants and assigned stores or
departments. The existing owner opens the **Master dashboard** by default and can
switch to every other workspace without changing accounts.

| Workspace | Default users | Focus |
| --- | --- | --- |
| Master dashboard | Owner, admin, operations manager | Net sales, gross profit, dues, stock priorities, store comparisons |
| Store operations | Branch and floor managers | Scoped sales, current stock, unpaid bills; department-only managers see their own bill lines |
| Sales | Sales staff | Sales activity, recent bills, customers served and POS |
| Billing | Billing staff | Bills, average bill, unpaid-bill count and payment-method mix |
| Inventory | Inventory staff | Availability, reorder shortages, stock on hand and recent receipts/damage |
| Accounts | Accounts staff | Revenue, recorded costs, shared balances, collections and supplier payments |
| Customer | Marketing staff | Customer growth, tags/segments, latest additions and follow-up notes |

Owner/admin can open all seven workspaces. Multiple-role staff receive the union
of their available workspaces; the Central furniture cashier can switch between
Sales and Billing. Selecting a workspace uses its relevant role grants, including
when a person has roles in different stores. Store and department selectors only
contain assignments available to that workspace. Owners can select any store or
department to inspect its operations. Inventory, Sales and Billing views omit
profit/cost widgets even when opened by the owner; department operations omits them
as well. The owner's navigation remains fully available.

## Data and access rules

- Dashboard SQL runs through the existing tenant transaction helper under the
  `app_user` role. Store/department predicates are applied before aggregation.
  URL manipulation cannot select an unauthorized workspace, store or department.
- Mixed-department bills contribute only authorized line amounts to a department
  dashboard. Department-only activity omits the full bill ID/number, customer name
  and full-bill links. Product costs and shared financial balances are not loaded
  for those users. Their own stock can be reviewed directly on the dashboard.
- Shared customer/supplier balances and expenses appear in unfiltered financial
  views. They disappear when a financial view is narrowed to a store or department;
  the app's ledger has no reliable store allocation. Customer workspace filters
  omit store/department selectors because customer records are business-wide.
- Revenue is net of completed returns, excludes estimates, and uses recorded line
  prices/discounts. Gross profit includes the cost of free products and reverses
  returned product costs. Missing cost snapshots are called out on the profit card.
- Activity ranges are Today, Last 7 days, Month to date and Quarter to date, using
  India day boundaries. Prior-period comparisons cover equal numbers of days.
  The daily chart includes zero-sale days and negative return days.
- Stock quantities and balances are current. Unpaid/overdue bill and EMI priorities
  look across all dates so changing the activity range does not hide older debt.
  Unpaid bills are a count, not a calculated outstanding rupee amount: general
  customer collections do not allocate payments to individual bills in this app.
- Navigation is assembled on the server using existing destination permissions.
  Unsupported links disappear, including shared-ledger routes for store-only staff.
  Destination/server-action authorization remains in place. Role lookup is cached
  only within a React server request, so subsequent requests observe revocations.
- Existing product/POS editing destinations still use their current store-level
  permissions. This change does not broaden department-only users' editing access.
  Historical department attribution follows the product's current department,
  because sale lines do not store a department snapshot.

## Interaction and presentation

Responsive metric grids, period/scope filters, quick actions, an attention queue,
bounded recent-activity lists, store comparison and an accessible daily chart.
Filter forms use ordinary GET navigation. Changing a selector submits the form
and shows progress. The existing streamed loading boundary requires JavaScript
to finish displaying authenticated pages; JavaScript-disabled rendering is not
supported by this boundary. Dedicated
loading and retry states preserve the selected URL. Chart data is also available
as an expandable table. All values come from the user's data; there are no targets
or performance percentages invented by the UI.

## Verification

Phase 3c is published and hosted acceptance passed: handover priorities show
late/open orders and remaining lines within each workspace's scope, independent
of the activity period. Department inventory views omit customer and money fields.
Financial workspaces with whole-store scope show period order receipts/refunds
and current advances held/delivered bills due. These are separate from sales and
general customer settlements. [Order ledger boundaries](CUSTOMER_ORDERS_AND_ADVANCES.md).

- **21 tests passed** across new policy tests, real isolated PostgreSQL dashboard
  tests and existing auth/role-revocation regressions. Includes cross-tenant/store
  isolation, mixed-department bills, free-item costs, returns, zero-sale days,
  older unpaid bills, owner access to every workspace and multi-role boundaries.
- TypeScript and isolated production build passed. Scoped Biome passed.
- **21 production-browser checks passed locally** using the saved owner and nine
  seeded role types. Includes all seven owner workspaces, actual filter submission,
  department stock visibility, multiple-role switching and rejected URL tampering.
  Owner, floor, inventory and marketing layouts were checked at 360px with no page
  overflow. Screenshots are in `.cache/dashboard-screenshots/`.
- The first browser run caught an unreliable client-router filter transition;
  ordinary GET submission fixed it and the acceptance run passed afterward.
- Local verification copied the hosted demo fixture into the guarded isolated test
  account, preserving existing owner credentials and local records. The isolated
  account therefore retains its older test stores alongside the four demo stores.
  Hosted data is unaffected by local fixture setup.

Evidence: `.cache/dashboard-tests.log`, `.cache/dashboard-typecheck.log`,
`.cache/dashboard-build.log`, `.cache/dashboard-browser-local.json`.
Browser runner: `scripts/verify-dashboard-workspaces.mjs`; it reads saved private
credentials and accepts only the known local/hosted testing origins. No schema
migration, provider payment, welcome email or password change is required by the
dashboard implementation. Hosted publication/acceptance is recorded separately.
