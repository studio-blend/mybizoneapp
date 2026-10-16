# Four-store demo transactions — 15 October 2026

Added to the existing hosted Pro test tenant at https://mybizoneapp.vercel.app.
Owner login and the [store/staff setup](FOUR_STORE_TEST_DATA.md) are unchanged.

| Data | Total | Per store |
| --- | ---: | ---: |
| Completed sales and receipt records | 20 | 5 |
| Estimates | 4 | 1 |
| Purchase bills | 8 | 2 |
| Customer collections | 4 | 1 |
| Supplier payments | 4 | 1 |
| Sales returns | 4 | 1 |
| Purchase returns | 4 | 1 |
| Expense entries | 8 | 2 |
| Quotations | 4 | 1 |
| Delivery challans | 4 | 1 |
| EMI plans | 4 | 1 |
| EMI instalments | 12 | 3 |
| Damage records | 4 | 1 |

Also added six customer tags and six follow-up notes. Transactions have `DEMO-`
document numbers and notes identifying them as sample data. Dates span August
through October 2026, in India time, to populate recent reports and EMI ageing.

Each store has cash, UPI, debit-card, credit and EMI sales, plus a stock-neutral
estimate. Cash bills demonstrate a bill discount; UPI bills demonstrate an item
discount and a free item. UPI/card references are dummy values. Each store has
one credit restock and one paid restock, a supplier payment and supplier return.
Customer returns link to the original paid sale and use its discounted price.
Paid-sale returns do not consume unrelated customer debt.

Credit collections are customer-level ledger entries, matching the app's existing
settlement model. They reduce the customer balance; they do not imply an allocation
to a specific invoice or update that invoice's due status. EMI plans have zero
interest, a down payment and three instalments: one paid, one past due, one upcoming.
EMI principal and general credit balances remain distinct in reconciliation.

Quotation states include draft, sent, accepted and expired. Delivery states include
draft, dispatched and delivered. Delivery documents describe an already-billed
order and introduce no second inventory movement. Rent and utilities are business
ledger entries with the store name in their description, since expenses have no
store column. The business remains non-GST; receipt records contain zero tax.
PDF files were not generated as part of this seed.

## Application and verification

- Captured live product prices/stock and contact balances before seeding. Calculated
  sale totals and EMI principal using existing domain functions.
- Applied all records, stock deltas, balances and the seed marker in one transaction
  to Neon project `silent-scene-72840763`, branch `br-odd-tree-aomevkex`.
- Stable private IDs, row locks, identity/baseline checks and a marker make repeat
  execution safe. Reapplication produced no additional records or stock/balance
  changes. Ordinary bill counters are untouched; demo document prefixes are separate.
- Database reconciliation passed: every expected record exists; stock matches both
  baseline plus seed deltas and purchase/sale/return/damage ledgers; customer and
  supplier balances match; sale/purchase/receipt totals and EMI amounts reconcile;
  no cross-store sale items or negative stock/balances.
- Individual bill pages exposed missing `sales.gst_enabled_at_sale` in the hosted
  schema. Vercel logs confirmed it. Existing migration
  `packages/db/migrations/0021_sale_tax_snapshot.sql` was tested on temporary branch
  `br-old-rice-aog40tl0`; all transaction reconciliation checks stayed valid. The
  owner explicitly approved applying the migration and cleaning up the branch.
  Migration completed, the temporary branch was deleted, and `_migrations` now
  records `0021_sale_tax_snapshot.sql`. The two unrelated legacy sales retained
  unknown tax snapshots; their amounts were preserved.
- Final Chromium acceptance passed: **22 checks**, including populated lists,
  individual bill details for every store, settlements, all four EMI detail pages,
  due bills, closing stock, P&L and balance sheet. Earlier failed acceptance was
  superseded by this final run after migration. A verification typo initially used
  `/reports/profit-loss`; corrected to the actual `/reports/pl` route.
- Scoped Biome, Node syntax and ignored-private-file checks passed. No deployment,
  payment-provider transaction, welcome mail or account credential change.

Evidence: `.cache/four-store-transactions-database.json`,
`.cache/four-store-transactions-browser.json`,
`.cache/transaction-tax-migration-review.json`.

Private fixture and prepared SQL: `.local/test-accounts/commerce-baseline.json`,
`.local/test-accounts/four-store-transactions.json`, `.sql`, `.statements.json`.
Generator: `node packages/db/node_modules/tsx/dist/cli.mjs scripts/prepare-four-store-transactions.mjs`.
It prepares files only and makes no database connection. Verify the hosted UI with
`node scripts/verify-four-store-transactions.mjs` using saved owner credentials.

This is linked demo history for manual testing, not complete commerce or release
acceptance. Other pending migrations and cloud file-persistence acceptance remain
outside this data-seeding request.
