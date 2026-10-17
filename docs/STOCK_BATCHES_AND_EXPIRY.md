# Batch stock and expiry — Phase 3a

This capability is optional per product, independent of the industry profile. A
mixed retailer can track perishable items while keeping furniture or utensils on
aggregate stock. Changing a business profile never invents expiry dates or enables
tracking automatically. [Serial inventory and recorded warranties](SERIAL_INVENTORY_AND_WARRANTIES.md)
are delivered separately in Phase 3b. [Orders, advances and handovers](CUSTOMER_ORDERS_AND_ADVANCES.md)
are delivered in Phase 3c. [Wholesale pack conversions and credit](WHOLESALE_PACKS_AND_CREDIT.md)
are delivered in Phase 3d. [Recipes, kitchen preparation and waste](KITCHEN_PREPARATION_AND_WASTE.md)
are delivered in Phase 3e; table ordering and restaurant checks remain separate capabilities.

## Daily workflow

1. Inventory → Batches & expiry → Enable batch tracking. Count every physical lot,
   entering its batch code, quantity and printed expiry. The sum must exactly
   equal current product stock. Put unknown-expiry stock in quarantine. Zero-stock
   products need no opening lots. Activation changes no stock or financial values.
2. Receive a purchase using the existing bill form. Tracked products require a
   batch code and expiry on every line. Different lots use different lines. The
   same code can receive more stock only with matching expiry and status.
3. Checkout displays **sellable** stock and automatically allocates earliest
   expiry first (FEFO), then receipt time and ID for ties. Free items consume lots;
   estimates do not. The bill's Allocated batches disclosure shows the lots used.
4. Customer returns go into a separate quarantined return lot, including returns
   against bills written before activation. Financial return calculations remain
   tied to the original bill. Inventory staff inspect physical goods, enter a
   verified future expiry and unique inspection code, and record a note before
   releasing the whole return lot. Write off unsuitable stock or return it to its
   supplier. Partial inspection releases are not supported in this delivery.
5. Supplier returns and damage require the **physical batch** being removed.
   Supplier returns on tracked receipts must use a lot on that original receipt.
   Older receipts use the operator's explicit physical-lot selection; the normal
   original-bill quantity/refund limits still apply. Use a separate partial return
   document when another lot must also be returned.
6. Quarantine an available lot for recalls or inspection with an audit note.
   Known batch codes and expiry dates cannot be changed on release. Expired lots
   cannot be released by extending their dates.

The printed expiry date is conservatively blocked **from the start of that date**
in Asia/Kolkata. For example, an expiry of 20 October is no longer sellable on
20 October. This is an explicit application policy, not an interpretation of
best-before rules. Expired and quarantined stock remains physical inventory until
removed through a sale, supplier return or damage record. Expiry alone records no
expense or debt change. Purchase cost accounting remains the application's
existing product-cost snapshot model; batch-level costing is not introduced.

Tracking remains enabled once reconciled. Tracked products retain their store,
units and aggregate quantity in the product editor; purchases, returns and damage
are the stock-changing paths. Keep tracked products active so their lot and
customer-return workflows remain accessible. Product price and descriptive edits
remain available. No arbitrary stock adjustment or batch transfer is exposed.

## Owner and staff views

Master, operations, accounts and inventory stock insights show expiry attention
only when stocked lots need action: expired, quarantined and expiring within
30 days. Counts include the selected store/department scope; up to six urgent lots
are shown. These are current stock alerts, independent of the sales date filter.
Financial values are not added to nonfinancial payloads. Existing slow-stock and
stock-cover figures continue to use physical inventory.

The dedicated batch register includes status/product filters, physical quantities,
expiry, inspection controls, and the latest 100 movements for a selected product.
It requires the existing business-wide `manage_inventory` permission, matching
the damage workflow. Department/store-only dashboard viewers can see permitted
alerts without gaining a new mutation destination. Purchases, sales, returns and
product edits retain their existing permission gates. The owner retains every
dashboard workspace.

## Integrity and migration

`0023_stock_batches.sql` adds a default-false product flag, `stock_batches` and
append-only `stock_batch_movements`. No existing product is activated or assigned
invented dates. Composite foreign keys bind each lot/product and movement/lot to
the same tenant. Both tables force RLS, including insert/update tenant checks.
Default inherited grants are explicitly revoked before narrow grants are applied:
the application cannot delete lots or update/delete movements.

Every stock-changing action updates its existing aggregate stock and batch ledger
in the same tenant transaction. The product row serializes stock changes with
activation and reviews. The helper reloads the current tracking state under that
lock, detects pre-existing discrepancies and rolls back the complete document on
failure. Quantities use exact integer thousandths, including fractional/free
items. Movement sign and nonnegative physical stock checks are also in PostgreSQL.
Review changes are audited and leave physical quantities unchanged.

Before applying to hosted development, test on a temporary Neon branch, compare
existing row hashes and permissions, obtain explicit approval required by Neon's
migration completion tool, then apply and remove that branch. Do not apply the
unrelated pending migration 0020. Record 0023 in `_migrations` after tool application.

## Verification

Automated tests: `apps/web/tests/unit/stock-batch-policy.test.ts` and
`apps/web/tests/integration/stock-batches.test.ts`. They run mutation fixtures only
against the guarded disposable local PostgreSQL cluster and cover reconciliation,
calendar validation, fractional/free quantities, FEFO, estimates, expired and
quarantined checkout, receipt metadata, both return paths, damage, inspection,
stock drift, concurrent sales/damage/activation, append-only grants, tenant keys,
real role checks and scoped dashboard alerts. Existing transaction, dashboard,
profile, operating-analysis and authenticated-security suites provide regressions.

`scripts/verify-stock-batches.mjs` uses disposable local products to exercise the
real browser forms, reconciliation, sale allocation, return inspection, purchases,
supplier returns, expired write-offs, ledger totals, role navigation and 360px
layouts. It cannot run its mutations against the hosted database. Credentials,
sessions, screenshots and detailed evidence remain in ignored local/cache paths.

Acceptance completed 17 October 2026: 80 automated tests passed across nine
suites; 12 new production-browser checks passed, alongside 41 existing dashboard
and operating-analysis browser regressions (zero transport retries). Scoped Biome
reported no errors; TypeScript and the final isolated production build passed.
Owner, administrator, scoped inventory and supplier-return layouts were inspected
at 360px. Visual review corrected a compressed product filter; acceptance now
checks that the mobile filter remains readable as well as checking page overflow.
The end-to-end item reconciled to 1.750 kg across product, batches and movements.

Migration 0023 was tested on Neon branch `br-mute-shadow-aomxqost`. Row hashes of
all 13 checked inventory, transaction, balance and role tables matched its parent;
both tables force RLS and movement update/delete grants are absent. The owner
approved application and publication. Migration 0023 was applied and recorded on
17 October 2026, its temporary branch removed, and all 13 row hashes matched again
after application. Existing products remain untracked; migration 0020 stays pending.
Deployment and hosted acceptance evidence is recorded in the release work log.
