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
| Dashboard | 12,686 ms | Pending deployment |
| Products | 4,965 ms | Pending deployment |
| Customers | 5,252 ms | Pending deployment |
| Suppliers | 4,795 ms | Pending deployment |
| Sales | 6,455 ms | Pending deployment |
| New sale | 7,682 ms | Pending deployment |
| Reports | 6,491 ms | Pending deployment |

Baseline deployment: `3b21be5301bc5f37af1f537b52fc7cc93e9d20c0`, region `iad1`.
Private local evidence: `.cache/performance-hosted-before.json`, compiled bundle
manifests, `.cache/performance-tests-final.log`, `.cache/performance-db-tests.log`.
Credentials, cookies and sessions are excluded from the report and Git.

## Remaining scale considerations

The POS still preloads the permitted product/customer catalog for immediate local
search. Very large catalogs may need a separate server search design. Report pages
still run their required financial queries; region locality and cheaper tenant
setup improve those paths without introducing stale financial caches. Deep offset
pagination may eventually warrant cursor pagination if data volumes justify it.
