# Transaction integrity release work log

## Scope and decisions

Inspected sales, purchases, sales returns, purchase returns, customer/supplier settlements, EMI collection and domain sale calculations. Changes run within existing tenant transactions. No production database was inspected or mutated. No schema migration was added by this workstream.

## Implemented

- `packages/domain/src/sale.ts`: reject nonfinite monetary inputs and invalid tax rates; allocate bill discounts using cumulative rounded shares to prevent negative final lines on tiny-value carts.
- `packages/domain/src/returns.ts`: original-document quantity and amount allocation, including discounts/GST, prior returns, fractional quantities and exact final-paisa reconciliation. Reject duplicate requested products, unrelated items and quantities above remaining quantity.
- `apps/web/app/(app)/returns/actions.ts` and `purchase-returns/actions.ts`: require an original bill (ID or typed number), lock it before checking prior returns, derive party and pricing from the original, preserve tax and snapshots, atomically adjust inventory. Purchase returns enforce available stock. Paid bills no longer reduce unrelated outstanding debt. Estimates cannot be returned. EMI returns require a finance-agreement adjustment and are blocked rather than silently leaving the schedule inconsistent.
- Return forms now submit the previously ignored original bill number and require it. Removed misleading current-retail-price refund previews.
- Settlement actions lock the customer/supplier row, reject excess payments instead of silently dropping credit via clamping, and prevent general customer receipts from consuming unpaid EMI principal.
- EMI collection locks its parent schedule before reading/updating instalments, rejects zero or incomplete instalment payments, counts every unpaid status, and marks the linked bill paid when complete. Principal allocation excludes down payment and lender interest.
- Sale creation validates customer ownership, requires customers for credit/EMI, subtracts down payment from outstanding, validates bounded integer tenure (1–120), sufficient instalment totals, and decimal precision. Estimate numbers use UUID suffixes. Credit status is normalized to due; deferred payment uses credit/EMI.
- `packages/domain/src/emi.ts`: exact instalment principal allocation and month-end-safe due dates (January 31 -> February 28/29, then March 31).
- Purchase creation validates supplier ownership, requires suppliers for credit purchases, rejects zero quantity and invalid date.
- Permission gates added to transaction actions using security workstream `requirePermission` helper. Sales uses store scope.

## Validation so far

- Domain and web TypeScript checks passed after initial changes.
- Initial unit pass: 85 domain, 23 storage, 31 web tests. Added sale/return regressions passed.
- Added four EMI date/principal tests; root reports subsequent domain suite passed (90 tests including concurrent workstreams).
- Unit test process initially failed with sandbox `spawn EPERM`; rerun under approved test command passed.
- Root provisioned isolated PostgreSQL on 127.0.0.1:55432, database `mybizone_release_test`, migrations 0000–0020 applied, 16 RLS tests passed. Transaction action integration coverage is in progress.

## Material limitations / follow-up

- Customer/supplier settlements still use party-level balances; schema lacks per-invoice payment allocation. Per-invoice due reports cannot be assumed to reconcile generic settlements until that broader ledger model is added.
- Cash refunds/credit notes have return records but no explicit cash-disbursement or customer advance-credit ledger. Existing historical balances and returns require reconciliation before importing them into a production release.
- EMI sale returns are intentionally rejected pending finance adjustment workflow.
- Returning a product appearing multiple times on an original invoice uses weighted aggregate original value; it cannot choose a specific differently priced original line because the existing return schema references products rather than original line IDs.
- Five real PostgreSQL action regressions passed on September 15 (see below). Closing-stock and invoice-issuance regressions were added on September 16 and await the final dependency-upgrade gate; they are not covered by the earlier result.


## September 15 completed integration gate

Ran `node scripts/release-check.mjs test` using only the disposable database at `127.0.0.1:55432/mybizone_release_test`. Complete command passed: **16 DB/RLS + 90 domain + 23 storage + 46 web = 175 tests**. Five web integration tests call the actual server actions and tenant transaction wrapper; only session, permission lookup, cache invalidation and file storage are mocked. They establish:

1. Two competing returns cannot exceed original sold quantity; the successful return uses original GST/discounted value and cash returns do not erase unrelated debt.
2. Concurrent receipts cannot both overpay the same balance.
3. Duplicate EMI collection is rejected; concurrent final instalments complete the schedule and bill once, and only financed principal reduces debt.
4. Insufficient-stock supplier returns roll back the return document and inventory.
5. Two cashiers selling the final unit yield one sale and zero remaining stock.

Tests clean up their own generated tenants. The integration suite skips unless DATABASE_URL exactly matches the disposable database URL, and its mocked DB connection is pinned to that URL. It does not read `.env` secrets. `apps/web/vitest.config.ts` now resolves the normal `@/` source alias and includes integration tests.

## September 16 bounded follow-up implementation

- Added `apps/web/lib/reports/closing-stock.ts` and replaced the closing-stock page's incorrect forward sum. It starts with live inventory, retaining opening stock, then reverses purchases, sales, sales returns, purchase returns, damage and recorded manual adjustments after the selected day. The cutoff is midnight **Asia/Kolkata** and queries are typed. Existing inactive products are retained in historical reporting. Invalid dates fall back visibly; older edits without inventory snapshots trigger a reconciliation notice.
- `products/actions.ts` now locks the product before stock edits and audits before/after inventory. Scoped product permission checks cover create/update/delete/image upload. Updating store requires permission in both the existing and destination store. Repeated deletion no longer decrements usage repeatedly in the ordinary already-deleted case.
- Added one actual-database stock regression covering opening quantity, all five transaction movement types, manual adjustment, exact India-midnight cutoff and missing historical audit warning.
- P&L removes GST from sales/returns revenue, includes cost of free goods, reverses original cost of restocked returns and uses an exclusive India-time end boundary. Profit charts exclude estimates and GST; their description now explicitly says before returns and expenses. Inventory valuation description now correctly says saved product cost prices rather than weighted-average costing. Report permission gates were added to touched reports.
- Invoice issuance now locks the source sale, returns an existing PDF/number unchanged on retry, allocates a number only on first issuance, preserves stored invoice fields on missing-PDF recovery and rejects estimates. Added concurrent issuance/later-retry regression. PDF rendering/storage are mocked in this regression; numbering and snapshot persistence use PostgreSQL.
- Preserved the parent workstream's Next 15 async page parameter migration.

### Follow-up validation state

The seven-test action integration suite (the five passing tests plus stock and invoice regressions) is implemented. Latest complete rerun stopped before web tests because the disposable PostgreSQL server was down (`ECONNREFUSED`); it was subsequently restarted using the approved `pg_ctl` command. Latest web typecheck reported only an in-progress security-workstream `damage-logs/actions.ts` undefined variable; that result was sent to its owner. The parent owns the final gate after Next/Drizzle/Vitest upgrades. Do not represent the earlier 175-test result as validation of these later edits.

### Remaining report/invoice limits

- Historical stock values use **current saved cost prices**, not historical FIFO or weighted-average costing. Unrecorded legacy stock edits cannot be reconstructed; the report flags known old edits missing stock audit data. Database writes outside app workflows can also bypass movement history.
- Profit-by-item/brand remains gross product margin before returns/expenses, as now labeled. P&L excludes absent cost snapshots, so it is incomplete if cost data is missing.
- P&L, inventory valuation and product-edit permission changes were typechecked only as part of the current gate; dedicated browser coverage belongs to the parent release gate.
- First-time invoice generation still infers interstate tax from business/customer GSTIN because historical sales lack a persisted interstate flag/business tax snapshot. Issued invoice retries are now immutable, but imported historical tax state requires reconciliation. Restoring an invoice row with no PDF can only recover fields the schema persisted; historical business name/customer phone are not snapshotted there.
- No statutory-accounting certification, historical migration reconciliation, per-invoice settlement ledger, cash-refund ledger or EMI-return finance adjustment was added in this bounded phase.


## September 18 - S2/S5 completed by integrator

Earlier pending verification and first-issuance tax-inference statements are superseded by [S2/S5 evidence](S2_S5_STABILIZATION.md) and [work log section 10](../../RELEASE_WORK_LOG.md). Migration 0021 is applied and verified on disposable data. First issuance uses sale tax snapshots; unknown legacy context is blocked. Concurrent issuance and missing-PDF tax recovery pass.

Added conservative blocks for credit returns after any unallocated party settlement, absent original party, insufficient debt, non-completed sales and duplicate-product lines with differing cost snapshots. Fixed paisa rounding in reserved-EMI settlement allowance. Actual P&L queries now have isolated database coverage. Final targeted results: 90 domain + 17 DB/RLS + 19 transaction tests passed, zero skipped; typecheck and scoped Biome passed. Earlier sandbox startup failures and a corrected fixture failure are recorded in the evidence.

No full-suite/build/browser or accounting-certification claim is made. Unsupported accounting cases and reconciliation requirements are in the linked evidence. S2/S5 complete only within that scope; next task is S3.
