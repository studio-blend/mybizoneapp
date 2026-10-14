# Hosted performance optimization

Target: https://mybizoneapp.vercel.app/. Authorized by the owner to optimize,
push, deploy and verify using the saved Pro test account.

## Findings and changes

- The deployed application functions ran in Virginia (`iad1`), while the Neon
  database runs in Singapore (`aws-ap-southeast-1`). `apps/web/vercel.json` places
  the functions in Singapore (`sin1`) to remove cross-continent database traffic.
  [Vercel region configuration](https://vercel.com/docs/project-configuration/vercel-json#regions)
  overrides the project's default function region.
- Dashboard financial/customer aggregates now share scans: 15 data SELECTs become
  10. Monthly bounds, completed-sale/estimate exclusions, free-item COGS rules,
  and positive outstanding balances are preserved. Data is read fresh.
- Tenant role and business context are configured in one transaction-local SQL
  statement. Each tenant transaction saves one database round-trip. Tests verify
  the effective `app_user` role, cross-tenant isolation and context reset after
  commit and rollback.
- Current account state and role grants load with one joined query. Locks,
  password-change requirements and grant revocations still take effect on the
  next request. Sales/product filter checks reuse the roles already loaded.
- Products, customers and suppliers fetch 51 rows and display 50 per page, using
  the extra row to detect the next page without a count query. Sorting includes
  an ID tie-breaker. Filters survive pagination; outstanding totals still cover
  the whole business. Customer tag membership stays in SQL.
- Product category traversal uses a parent/children map with cycle detection.
  Product thumbnails load lazily. Row action links do not prefetch every edit
  screen as a list appears.
- PostHog loads from an async chunk only when configured, after the browser has
  time to render. The compiled initial bundles contain about **50.6 KB less
  gzip-compressed JavaScript** than the baseline under identical public settings.

## Validation

- Isolated local PostgreSQL: **133 web tests passed**, including financial totals,
  pagination completeness, tag filtering, role boundaries and tenant context.
- Database suite: **17 tests passed**.
- Scoped Biome checks, TypeScript and the isolated production build passed.
  Evidence: `.cache/performance-typecheck-final.log` and
  `.cache/performance-build-after.log`.
- No production data migration or index change was needed. The inspected hosted
  tables are small. Query history is unavailable because `pg_stat_statements` is
  absent; no extension was installed.

Verification builds use `MYBIZONE_BUILD_DIR=.next-performance` to avoid overwriting
an active development server. They use `next start` output instead of portable
standalone packaging, which requires Windows symlink privileges. Normal cloud and
desktop builds retain the existing standalone configuration.

## Hosted measurements

Headless Chromium, the saved owner account, three sequential full page loads per
route in the same environment. Measure navigation until the application heading,
form or table is visible. These are small-sample acceptance measurements, not
production percentiles or a load test.

| Page | Baseline median | Deployed median |
| --- | ---: | ---: |
| Dashboard | 12,686 ms | **552 ms** |
| Products | 4,965 ms | **269 ms** |
| Customers | 5,252 ms | **517 ms** |
| Suppliers | 4,795 ms | **510 ms** |
| Sales | 6,455 ms | **506 ms** |
| New sale | 7,682 ms | **531 ms** |
| Reports | 6,491 ms | **544 ms** |

Baseline deployment: `3b21be5301bc5f37af1f537b52fc7cc93e9d20c0`, region `iad1`.
Optimized deployment: `b01c3fbbbf8c10a8be52e5baed7e251a34abb273`,
`dpl_2hMD2qbof8B5p3XjTivm49bP3LZq`, confirmed READY with the public alias
and region `sin1` on 15 October 2026. Dashboard median improved by **95.6%**.

All seven routes returned HTTP 200 and rendered application content using the
saved Pro account. The streamed page-2 pagination control rendered and returned
successfully to page 1. Separate hosted checks passed for login, Pro/unlimited
capacity, both test stores and dashboard/products/employees/team/reports access.
One of three New Sale samples took 3,116 ms; its median was 531 ms. These results
do not establish that every request will be subsecond.
Private local evidence: `.cache/performance-hosted-before.json`,
`.cache/performance-hosted-after.json`, `.cache/hosted-pro-verification.json`, compiled bundle
manifests, `.cache/performance-tests-final.log`, `.cache/performance-db-tests.log`.
Credentials, cookies and sessions are excluded from the report and Git.

## Remaining scale considerations

The POS still preloads the permitted product/customer catalog for immediate local
search. Very large catalogs may need a separate server search design. Report pages
still run their required financial queries; region locality and cheaper tenant
setup improve those paths without introducing stale financial caches. Deep offset
pagination may eventually warrant cursor pagination if data volumes justify it.
