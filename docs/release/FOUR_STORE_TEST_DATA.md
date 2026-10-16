# Four-store test data — 15 October 2026

Seeded the existing Pro test business on the hosted development site:
https://mybizoneapp.vercel.app/login. Reuse `pro.owner@example.com`; its password
is unchanged. This seed was applied to hosted Neon project `silent-scene-72840763`,
branch `br-odd-tree-aomevkex`, in the dedicated test tenant only. Local databases
do not automatically synchronize with this data.

| Store | Departments | Products | Employees |
| --- | --- | ---: | ---: |
| AR Furniture - Central | Living Room, Bedroom, Dining | 6 | 7 |
| AR Furniture - North | Office Furniture, Outdoor Furniture, Storage | 6 | 7 |
| AR Electronics | Mobile and Accessories, Home Appliances, Computers and Audio | 6 | 7 |
| AR Utensils | Cookware, Serveware, Kitchen Tools | 6 | 7 |

There are **33 users** including the existing owner: one admin, one operations
manager, one accountant, one marketing user, four branch managers, twelve floor
managers, four sales staff, four inventory staff and four billing staff. The
Central furniture cashier also has a sales grant, demonstrating multiple roles.

The hierarchy is owner → admin → operations manager → branch manager → department
floor managers and store staff. Accounts and marketing report to the admin.
The app models this through role/store/department scopes. It has no reporting-line
column; `reportsTo` in the private manifest and the login CSV documents the sample
organization, without inventing an application field. Every explicit role grant
records the existing owner as its grantor. Managed accounts use `user.role=custom`
so legacy role fallback does not broaden their permissions.

Also included: 4 fictional brands, 4 root categories with 12 child categories,
6 customers with retail/wholesale tiers and differing credit limits, and 4 suppliers.
All products have price, cost, MRP, wholesale price, SKU, specifications and opening
stock. The initial catalog seed included three low-stock examples. Subsequent
[demo transactions](FOUR_STORE_TRANSACTIONS.md) added linked purchases, sales,
receipts, returns, settlements and EMI plans and updated stock and balances.
No external payment was made. The business remains non-GST.

## Login details

Private, Git-ignored files at the repository root:

- `.local/test-accounts/pro-owner.json`: canonical owner password.
- `.local/test-accounts/four-store-logins.csv`: all 33 login credentials, roles,
  stores, departments and sample reporting lines; open privately in a spreadsheet.
- `.local/test-accounts/four-store-seed.json`: stable fixture IDs and credentials.
- `.local/test-accounts/four-store-seed.sql` and `.statements.json`: prepared SQL
  with password hashes; keep private.

For staff, choose **Employee** on the login page and use the Employee ID/password
from the CSV. `EMPADMIN`, `EMPSHOP`, `EMPACCT` and `EMPMKT` are business-wide users.
Store IDs use `EMPFUR1`, `EMPFUR2`, `EMPELEC`, `EMPUTEN`, followed by `BM`,
`FM1`–`FM3`, `SALE`, `INV` or `BILL`. These dedicated test accounts are immediately
usable and have individual generated passwords; they do not require first-login
rotation. No welcome email was sent.

## Safety and verification

The two initial empty hosted placeholders were renamed into furniture stores;
their IDs were preserved. Electronics and utensils were added. The seed checks
the exact existing owner/tenant and refuses to rename populated placeholders or
overwrite colliding employee identities. It runs in one transaction under an
advisory lock. Existing fixture rows are preserved on repeat runs; usage is
recounted. A second application completed with unchanged counts and no duplicates.
An initial SQL attempt used a nonexistent purchase store column and rolled back;
the corrected guard checks tenant purchase records before renaming.

Database checks: 4 stores, 12 departments, 24 products, 33 users, 33 explicit grants,
6 customers, 4 suppliers; zero mismatched product/department/store links or grants.
Usage snapshot matches source counts.

Browser acceptance uses `node scripts/verify-four-store-test.mjs` with the private
credentials. Evidence is written to `.cache/four-store-hosted-verification.json`.
**Passed, exit 0:** 32 employee logins/sessions/dashboards and 27 acceptance checks.
It checks owner access and data visibility, every employee login/session/dashboard,
store-confined product lists for branch/inventory users, assigned-store POS for
sales/billing users, and global admin/operations/accounts/marketing access.

**Existing application limitation:** product/POS entry pages resolve permissions
using store scope alone. Department-only floor-manager grants do not authorize
those pages. Floor-manager credentials/dashboard access and database scopes are
verified; their operational department workflows require an application fix.
The seed retains department boundaries. This is not full commerce or release
acceptance.

A separate authenticated probe confirmed cross-store product access is rejected
and a department-only floor manager encounters the existing product-page error.
Evidence: `.cache/four-store-scope-probe.json`. Both error pages returned HTTP 200,
so verification used the rendered error heading and absence of product rows.
Scoped Biome and Node syntax checks passed. Private files are confirmed Git-ignored.

To regenerate the private handoff, run `node scripts/prepare-four-store-test.mjs`.
It makes no database connection. Apply the generated statements only to the
confirmed hosted test tenant. The isolated `seed:pro` helper is unchanged.
