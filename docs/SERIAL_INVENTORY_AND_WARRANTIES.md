# Serial inventory and recorded warranties — feature Phase 3b

Status: published and verified on 17 October 2026. The owner approved migration
0024 and publication. The migration is applied and recorded, and its temporary
branch is removed. Application acceptance commit: `62e3ca5bdf983e0a7c06dfdcc82f4a8d8c76b16a`.
Vercel deployment `dpl_H8ANzvuiPo4jMfzrnzGM8SMFwYDa` reached READY and the public
alias was verified. Documentation-only follow-ups do not change the application.

This capability is optional per product, independent of industry profiles. It
suits electronics and any other business selling individually identified pieces.
Choosing an electronics profile does not invent serials or activate tracking.
Products use either serial or batch tracking; both cannot be enabled together.

## Daily workflow

1. Inventory → Serial inventory → Enable serial tracking. Reconcile every physical
   piece against current product stock. Enter its actual serial, one per line or
   comma-separated. Zero stock requires no opening serials. Activation changes no
   quantities, financial records or earlier bills. Tracking requires piece/pc units
   and whole stock, with at most 500 serials in an activation or transaction line.
2. Set the warranty term actually offered, from zero to 120 months, and the issuer
   for a positive term. Zero means no warranty recorded. These defaults apply to
   future completed sales only, and may be changed from the product's register.
3. Purchases capture each incoming unit. Serials are normalized to uppercase,
   limited to 80 ASCII letters/numbers/dots/slashes/underscores/hyphens, and unique
   within a business across all its products. Duplicate receipt attempts roll back.
4. Checkout shows available stock and a preview of up to 20 available identifiers.
   Scan the exact units handed over, including free units. The server validates
   all serials and quantities atomically; it does not choose arbitrary units.
   Estimates neither allocate units nor start recorded warranties.
5. The web bill's **Serials & recorded warranty** disclosure shows each unit and
   its saved term, issuer and exclusive end date. Billing → Warranty lookup finds
   the sale history by exact serial, with the original bill/customer and terms.
6. A customer return identifies the exact units sold on its original bill. A
   partial return quarantines only those units. Duplicate returns and wrong-bill
   serials fail without changing stock or balances. Inspect and release suitable
   units with an audit note before resale, or remove unsuitable goods through
   supplier returns or damage. Available units can also be quarantined for recall.
7. Supplier returns identify units from the original receipt. A returned unit may
   later be received again with a new purchase document; its earlier events remain.
   Opening units can be returned against historical purchases predating activation,
   subject to existing original-document quantity/refund limits. Damage also
   requires the exact physical unit, available or quarantined.

## History and warranty boundaries

Warranty terms are immutable sale-event snapshots. Changing product defaults
does not rewrite old terms. A returned and resold unit has separate sale records;
the old record remains marked returned and the new sale records its own defaults.
End dates use the sale's India calendar date and clip month ends. They are
exclusive: a term ending 20 October is no longer shown within term on 20 October.

These records establish what was entered on the sale, not automatic approval of
a manufacturer claim, repair, replacement or refund. Claim adjudication, service
tickets, repairs, replacement inventory and provider integration are not delivered.
Serials are shown on the web bill and warranty lookup; the existing generated PDF
invoice format has not been extended with these records in this phase.

Earlier bills receive no invented serial or warranty. Returns against a bill that
predates tracking may register a previously unknown unit in quarantine; they do
not invent an original sale warranty. Existing original-bill financial limits
still apply. EMI-linked returns retain their existing unsupported boundary.

Physical stock equals available plus quarantined units. Sold, damaged and
supplier-returned units stay in history without counting as physical stock.
Product locks serialize stock changes, activation and inspection. Every movement
checks the physical count against the already-updated aggregate quantity in the
same transaction; drift or an invalid serial rolls back the entire operation.
Product edits cannot change tracked units, store or aggregate stock. Keep tracked
products active; purchases, returns and damage provide stock-changing paths.
There is no arbitrary count correction, transfer, tracking-disable or serial
renaming interface in this phase. Cost/profit calculations retain the existing
product-cost snapshot model; serial-level purchase costing is not introduced.

## Owner and staff access

The owner retains all dashboard workspaces and the master dashboard. Serial
inspection priorities are shown in permitted inventory-oriented workspaces,
respecting selected store and department boundaries without adding customer or
cost data to nonfinancial alert payloads.

The serial register, activation, inspection and future-term settings use the
existing business-wide `manage_inventory` gate, matching the batch/damage tools.
Store-only inventory staff retain scoped dashboard alerts without gaining a
global management page. Warranty lookup requires `view_sales` in each displayed
store. Store sales/billing users see only their permitted stores; department-only
grants are excluded until that destination supports department access. Existing
purchase, sale, return and damage actions retain their permission checks.

## Migration and verification

`0024_stock_serials.sql` adds four product fields defaulting to untracked/no term,
`stock_serials` and `stock_serial_events`. No existing products are activated.
Composite tenant keys, unique business/serial codes, state/term checks and forced
RLS protect both new tables. `app_user` may select/insert/update unit state but
cannot delete units; it may select/insert events but cannot update/delete history.

The migration passed on temporary branch `br-super-bread-aocfknpv`, parent
`br-odd-tree-aomevkex`, migration `a42cb41b-3884-445d-88d1-99bdb2dfef9d`. All 13
checked existing table hashes matched the hosted parent. Defaults remain off,
the new tables are empty, and stock, sales, purchases, balances and role grants
are preserved. The approved migration is now applied on the hosted branch, with
the same 13 before/after hashes preserved and the temporary branch removed.
Migration 0020 remains separate and pending.

110 automated tests passed across 11 focused suites, including serial policy and
transactions, batch regression, role dashboards, operating analysis and mutation
security. A stale navigation expectation was updated for the warranty link; an
older mutation suite's React cache mock was completed without changing production
permission code. Local production-browser/build evidence and final publication
state are recorded in [the work log](../RELEASE_WORK_LOG.md).

The final isolated production build and scoped lint passed (non-null assertion
warnings remain). Local browser acceptance passed 79 checks: 16 serial workflows
and role boundaries, 10 read-only rollout screens, 12 existing batch flows,
21 workspace regressions and 20 operating-analysis regressions. The final build
includes full-width phone serial entry below the checkout table. Its mutation
runner verified all serial workflows and the existing batch runner rechecked
shared checkout. The earlier workspace/analysis results use identical query,
permission and dashboard code; only serial-entry layout changed afterwards.

All 82 hosted browser checks passed: 10 serial/register, nine batch, 21 workspace,
20 operating-analysis and 22 seeded transaction/bill/report checks. All five
runners exited 0, with zero recorded transport retries. Read-only hosted review
confirmed the opening form, phone layouts, empty warranty history and role/store
access without activating products or creating financial documents. All 13 table
hashes still matched the fresh pre-migration baseline after these checks.

The local mutation browser runner is `scripts/verify-stock-serials.mjs`. It requires
the exact disposable localhost database and verifies its cluster directory before
creating fixtures. It must never be pointed at hosted data. Browser credentials
and sessions remain in ignored private files.

`scripts/verify-stock-serials-register.mjs` performs read-only register, opening
form, warranty and role checks. It supports localhost or the exact hosted URL;
after publication it can verify the unactivated demo business without creating
sales, activating products or changing physical stock.
