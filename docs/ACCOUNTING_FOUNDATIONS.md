# Accounting foundations — Phase 4a

Status, 17 October 2026: published and accepted on the hosted development app.
Owner-approved migration 0028 is applied and recorded; its temporary branch is
removed. Application commit `31c2e5c0d5bc41fda4ca0816a396d746311595b6`, Vercel
`dpl_G311kNYhe6iXmiz6bzBQBRew2zBm` (READY, public alias verified).
See [project status](PROJECT_STATUS.md).

## Receipts, payments and bill allocation

Settlements records customer receipts and supplier payments. Select a credit bill
to allocate that money immediately, or leave it unallocated against the party's
earlier balance. Partial collections/payments are supported. Amounts must be
positive and cannot exceed recorded party debt or the selected bill's remaining
value. General receipts continue to reserve EMI principal and order-delivery debt
for their separate ledgers. Estimates, cash bills, EMI and order bills cannot be
general allocation targets.

Assign an earlier payment links already recorded money to a credit bill, in one or
more partial allocations. Confirm the reference and enter an evidence note.
Allocation does not collect money, reduce party debt again or add a cashbook line.
The remaining payment and bill amounts bound every assignment. Latest allocations
and their evidence appear in the history. Evidence is permanent in this phase;
correction/reversal workflows are not yet available, so check references carefully.

New browser submissions carry stable request IDs. A retry with identical details
reuses its result; changing the details of a used ID fails. Older callers omitting
IDs retain legacy submission behaviour. Bill locks precede party locks; party locks
serialize payments and assignments. Receipt/payment documents and allocation rows
are immutable to the application database role. Tenant/party composite foreign
keys, FORCE RLS, permissions and audit events protect new evidence.

A successful command loads a fresh page, following the existing order/kitchen
pattern. Confirmation names an actual saved payment/allocation from the tenant's
ledger; refreshed choices and balances come from that same new read. Forms become
submittable after hydration, keep their request ID through an uncertain response
and offer a safe retry. A new page starts the next command.
Accounting tabs, source links and pagination also use ordinary page navigation so
production navigation always reads the current route and query state.

All settlement reads and writes require the **global manage_expenses** permission.
This matches the finance navigation and permits accounts staff without granting
customer/supplier editing. Sales-only or store-scoped permissions do not grant
business-wide finance access. Existing owner dashboard access remains unchanged.

## Returns and bill values

Completed credit bills show original value less completed linked returns and
explicit settlement allocations. Allocating a sale updates its paid/partial/due
flag. The due-bills report uses that remaining credit value and the existing order
allocation ledger; completed/returned-to-zero bills and estimates are excluded.

Unallocated payments are never automatically assigned, including the existing
four customer and four supplier settlements. They already reduced party debt.
Until reconciled, individual bills may overstate debt; the report explains this.
EMI bill values remain original document values: consult instalment schedules for
remaining principal and interest. These date groups are not certified invoice
ageing and are not available-cash calculations.

Legacy paid/partial credit flags without supporting allocation evidence require
reconciliation before collecting more against that bill or reducing debt through
a return. Assign existing payments first; their assignment itself stays available
so recorded evidence can resolve the historical flag.

Credit returns can reduce the unpaid portion after known bill allocations, even
when another bill has been settled. Unallocated party payments still block those
returns because their bill effect is unknown. A return crossing an allocated paid
amount is rejected pending refund reconciliation, rather than reducing unrelated
debt. Paid cash returns still record goods/return documents without inventing a
money refund. The existing order-specific return/refund workflow is unchanged.

## Cashbook

Cashbook shows recorded money in, money out and net movement for an India-date
range of at most 366 days, with payment-method filters, a daily comparison and
method totals. Rows paginate at 100; summaries cover the entire filtered period.
Source links lead to the relevant existing document/register.

| Source | Cashbook treatment |
| --- | --- |
| Paid cash/UPI/card/cheque/other sale | Original receipt once; credit, estimates and order/EMI totals excluded |
| Customer settlement | Receipt once; allocation rows excluded |
| Paid purchase | Money out once, on its purchase date |
| Supplier settlement | Payment once |
| Order receipt/advance and explicit refund | Incoming receipt or outgoing refund; delivery allocation excluded |
| EMI | Down payment once with unknown method; paid instalments include interest on their recorded paid dates |
| Other income and expenses | Current recorded entry on its entry date |

Card variants group as card; bank and bank_transfer group as bank. Unknown methods
stay unknown rather than being assumed cash. Dates use Asia/Kolkata consistently.
This is a view of current source documents, including editable/deletable expenses,
not an immutable general ledger or bank reconciliation. Opening cash, transfers,
cheque clearance, general advances and general return refunds are not inferred.
Net movement is **not cash available** or a bank balance. Opening-balance notes
are annotations and do not change party debt or establish cash history.

## Validation and rollout

- 320 web unit/integration tests passed across all 34 suites, zero skips/failures.
  Includes 27 real PostgreSQL accounting cases and three date-range cases;
  permissions, races, retries, split allocations, returns, India dates and cashbook
  double-counting are covered. Two existing Node suites needed React cache stubs;
  an older kitchen test's database-directory guard now handles an absent row.
- All 17 existing database tenant-isolation/migration tests passed across three
  suites. Combined automated gate: 337 tests, zero failures/skips.
- Migration 0028 preserved row counts and full existing-column hashes for all 37
  checked hosted tables on its temporary branch. New allocation tables are empty;
  legacy request hashes remain null. Composite FKs, FORCE RLS and append-only
  grants passed. After explicit owner approval, it was applied and recorded on the
  hosted branch and the temporary branch removed. All 37 existing-table hashes
  matched immediately after migration and again after hosted browser acceptance.
  Only migration 0028 was recorded; unrelated subscription migration 0020 remains pending.
- The final production build, TypeScript and scoped lint passed, with five existing
  return-helper non-null warnings. All **186 production-browser checks** passed
  across 13 runners: nine accounting transactions, 12 finance/phone/role checks and
  165 kitchen, wholesale, order, batch/serial, workspace and analysis regressions.
  All runners exited 0; all seven transport counters were zero. New accounting
  fixtures preserved six checked financial tables after cleanup. Phone layouts
  were visually inspected at 360px. The earlier collection verifier now checks
  intentional blank receipt amounts and visible party debt, rather than automatic
  collection of a balance that can include EMI/order debt. Private evidence and the exact pending
  migration context stay in ignored local files. Hosted schema changes require
  the connected Neon completion tool's explicit user approval.

The published application passed **125 read-only hosted browser checks** across
nine runners: 12 accounting/register, 10 kitchen, 11 wholesale, 10 orders,
10 serials, nine batches, 21 workspaces, 20 analysis and 22 seeded transaction/
bill/report checks. All runners exited 0; no financial forms were submitted.
Existing unallocated settlements were preserved without invented bill mappings.
Hosted evidence is in `.cache/accounting-hosted-acceptance.json`, the nine
`.cache/accounting-hosted-*.log` files and `.cache/accounting-hosted-final-hashes.json`.

Local acceptance evidence includes
`.cache/accounting-all-tests-accepted.log`, `.cache/accounting-db-tests.log`,
`.cache/accounting-build-accepted.log`, `.cache/accounting-lint-final.log`,
`.cache/accounting-production-acceptance.json`, the 13 individual runner logs and
`.cache/accounting-accepted-source.json`. Public accounting acceptance runners are
`scripts/verify-accounting.mjs` (guarded local writes) and
`scripts/verify-accounting-register.mjs` (read-only local/hosted checks).

## Next phases

4b: general customer/supplier advances, explicit general return refunds and safe
reversal/correction records are published and hosted-verified. See
[the current Phase 4b scope and evidence](ADVANCES_REFUNDS_AND_CORRECTIONS.md).
The Phase 4a evidence above describes its earlier accepted release.

4c: reconciled opening cash/accounts, transfers and bank/cheque clearing; then
invoice ageing and available-cash reporting only where the underlying evidence
supports those claims. Existing P&L/cost/tax limits and commercial launch gates
remain as documented; this phase does not introduce double-entry accounting.
