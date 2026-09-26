# Phase 2 verification

## Provider acceptance follow-up — 26 September 2026

**BLOCKED: Phase 2 is not complete.** No actual Razorpay sandbox transaction, provider webhook delivery or Resend delivery was verified. The following is local preparation and synthetic regression evidence only. Existing browser/build/full-suite evidence below predates the mailer change in this session.

Configuration inspection (values never printed): process environment, `.env`, `.env.docker` and `apps/web/.env.local` contain no configured Razorpay key pair, public key, webhook secret, monthly/annual plan IDs or Resend API key. Existing sender/base-URL entries are unverified; their presence is not evidence of domain ownership or delivery. No customer database was selected. Base revision remains `c3d590e77d057f20b464f513aaeca1d9c4679589`; tests cover the preserved dirty tree plus this session's mailer/helper/tests changes.

### Independent work completed

- Corrected `createMailer`: Resend's resolved `{ error }` response now throws a generic delivery failure rather than falsely succeeding. Provider diagnostics are not included in that error. This does not add a durable outbox or automatic email retry.
- Added `test:providers` to the isolated helper without enabling providers or changing its pinned database/authentication/storage configuration.
- Added real PostgreSQL route regressions with synthetic HMAC-signed events: invalid signature causes no write; concurrent duplicates commit once; activation grants the stored Pro plan; cancellation removes it; stale paid events cannot restore it; unpaid/unrelated subscriptions are ignored; an injected pre-commit failure rolls back both entitlement and deduplication, returns 500, and the same event ID succeeds on retry. This asserts stored entitlement, not an end-to-end paid-feature browser journey.
- Added mailer regressions with the actual installed SDK and mocked HTTP: success, rejected API response, explicit caller retry and network failure. Existing signature/event-ordering and email-template tests also ran. Cloud signup/verification/reset token journeys were not run; template tests are not substitutes.

### Exact commands and outcomes

Commands run from the repository root.

| Command | Result |
| --- | --- |
| `& '.cache/postgres/pgsql/bin/psql.exe' -h 127.0.0.1 -p 55432 -U postgres -d mybizone_release_test -c 'SHOW data_directory;'` | Passed; confirmed this repository's `.cache/test-pgdata` before database tests |
| `node scripts/release-check.mjs test:providers` | Sandbox attempt failed before tests: `spawn EPERM`. First approved unsandboxed attempt: 17 passed, 3 failed due to Resend module mock not intercepting the package dependency. It attempted SDK requests with the literal noncredential `mock-only` and `.invalid` addresses; no successful delivery or provider acceptance claimed. Corrected to global HTTP mock; final approved run: **20 passed, 4 files, zero failed/skipped**, exit 0 |
| `pnpm exec biome check --write --diagnostic-level=error packages/auth-config/src/email.ts scripts/release-check.mjs apps/web/tests/unit/provider-mailer.test.ts apps/web/tests/integration/provider-webhooks.test.ts` | Passed; formatted only two new test files |
| `pnpm exec biome check --write --diagnostic-level=error apps/web/tests/unit/provider-mailer.test.ts` | Passed after correcting mock |
| `node scripts/release-check.mjs typecheck` (approved unsandboxed) | Passed, all eight workspace packages; repeated after final HTTP-mock correction, passed exit 0 |
| `pnpm exec biome check --diagnostic-level=error packages/auth-config/src/email.ts scripts/release-check.mjs apps/web/tests/unit/provider-mailer.test.ts apps/web/tests/integration/provider-webhooks.test.ts` | Passed, four files, no fixes/errors |
| `git diff --check` | Passed, exit 0 |


### Seller-owned setup required before actual acceptance

1. Razorpay seller dashboard access with **Test Mode** subscriptions available; a test key pair (`RAZORPAY_KEY_ID` beginning `rzp_test_`, `RAZORPAY_KEY_SECRET`) and identical `NEXT_PUBLIC_RAZORPAY_KEY_ID`. Supply secrets through a private local environment/secret store, never release documents or chat. Reject live-prefixed credentials in any future acceptance runner.
2. Seller-approved test-mode monthly/annual plans from that same account: `RAZORPAY_PLAN_ID_MONTHLY` and `RAZORPAY_PLAN_ID_ANNUAL`. Confirm currency, amounts, intervals and product choices with the seller; do not invent prices or activate live subscriptions.
3. An existing seller-controlled HTTPS callback endpoint routed exclusively to the disposable acceptance application, at `/api/webhooks/razorpay`, and its Test Mode webhook secret (`RAZORPAY_WEBHOOK_SECRET`). Subscribe to activated, charged, resumed, cancelled, completed, halted and paused subscription events; include authenticated/payment-failed events to observe ignored unpaid notifications. Need access to dashboard delivery status/retry evidence. No endpoint was published or tunnel created in this session.
4. Seller-owned Resend account, sending API key (`RESEND_API_KEY`), verified sender domain and `EMAIL_FROM`; owner-controlled test recipient inboxes and permission to send acceptance emails. Confirm receipt and sender/domain status, not just an API success response. See [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction).
5. Cloud-mode acceptance configuration (`LAN_MODE=false`), dedicated test auth secret, matching `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` pointing to the acceptance origin, disposable database/storage and rebuild with the test public key. Current ordinary helper deliberately blanks integration credentials and pins LAN mode: **do not use it as evidence that actual providers were exercised**. A separate fail-closed opt-in provider runner is still required once the seller configuration and existing endpoint are supplied; retain the helper's disposable database guard and never inherit a customer database URL. No public deployment is authorized by this task.

### Required acceptance record when unblocked

| Journey | Required evidence; currently NOT RUN |
| --- | --- |
| Checkout | Monthly/annual test-mode checkout success, provider-declined payment and modal dismissal. Reopen/reuse unfinished checkout; no Pro entitlement from the client success callback alone. Record redacted test subscription/event identifiers and before/after access. [Razorpay sandbox test guide](https://razorpay.com/docs/payments/subscriptions/test/) |
| Cancellation | Cancel test subscription via seller dashboard (no in-app cancellation action exists); receive cancellation event, verify free entitlement and restricted feature access after refresh/new session. Modal dismissal is separate from subscription cancellation |
| Webhooks | Actual signed provider delivery, tampered signature rejection without writes, duplicate event IDs, older and same-second conflicting events, forced isolated 500 and provider retry followed by one committed entitlement change. Record HTTP status, provider delivery attempts and final database state without secrets/raw personal payloads |
| Cloud auth/email | Signup requires verification; unverified login denied; actual verification inbox receipt/link and verified login; password-reset inbox receipt, valid/expired/reused-token behavior, old password rejected/new password accepted; provider rejection and caller retry. Capture redacted timestamps/message IDs and UI outcomes, never tokens/reset URLs/passwords |

Remaining limits: provider account ownership/configuration, endpoint availability and inbox access are absent; actual payment/auth/email and provider retry evidence remains blocked. Email has no durable outbox; SDK send success alone cannot prove delivery. No full-suite/build/browser rerun, public deployment, purchase, live payment, migration or Phase 3 work was performed. Next task: supply seller-owned test-mode/email prerequisites and complete this acceptance matrix through isolated provider verification; do not declare Phase 2 complete.


## Browser and local recovery acceptance — 26 September 2026

**Requested local acceptance complete.** Production Chromium browser acceptance: **20 passed, zero failed/skipped/flaky**, CI mode, 51.5 seconds. Local recovery: **seven top-level tests plus one full-schema/restart subtest passed**, zero failures/skips. Phase 2 overall remains open for provider-dependent acceptance; this is not installer, cloud deployment or sales-readiness approval.

Base revision remains `c3d590e77d057f20b464f513aaeca1d9c4679589`; results cover the preserved, uncommitted working tree, not the base commit. Source changed after the historical automated gate below. Final sorted SHA-256 manifest contains 431 existing tracked/untracked nonignored files, excluding `docs/` and `RELEASE_WORK_LOG.md`: `.cache/phase2-browser-source-manifest.txt`, digest `1a3c3c182313c1fd161f76f7ec77e7c70975e1b1a592b03c55c51847f958c6f4`. Enumeration: `git -c core.quotePath=false ls-files -co --exclude-standard > .cache/phase2-browser-files.txt`; PowerShell `Get-FileHash -Algorithm SHA256` hashed each sorted file and the UTF-8 manifest. Only documentation changed after this snapshot.

Inherited AGENTS.md was followed; graph tools remained unavailable. Existing dirty work was inspected and preserved. Independent permission-browser and recovery tasks were integrated. All database-affecting verification used `scripts/release-check.mjs`, pinned to the disposable database on loopback port 55432, with provider keys disabled and separate test storage. `SHOW data_directory;` reconfirmed this repository's `.cache/test-pgdata`. No customer data was used.

### Accepted journeys and fixes

| Coverage | Actual result |
| --- | --- |
| Signup/login/store | Real LAN owner signup, login, business onboarding, first store and store-plan count; public/login pages and unauthenticated redirect passed |
| Products/purchases | Non-GST product, exact uploaded image bytes, purchase of five units and stock increase passed |
| Sale/payment/documents | GST cash sale and actual PDF invoice; non-GST sale with locally recorded UPI reference and actual PDF receipt passed. PDF header/content type, persisted document link after reload/revisit and anonymous denial verified. No money transferred or provider invoked |
| Returns | Sales return restored stock; excessive cumulative return rejected without stock change; purchase return reduced stock; receipt/image still accessible |
| Permissions | Employee login, assigned-store sales/POS filtering, allowed export, denied other-store/tenant exports/files, denied direct pages and immediate role revocation passed |
| Mobile | Menu group opening/navigation/closing and 11 routes at 360px, including populated POS, passed |
| Local recovery | Real desktop gzip SQL and LAN custom-format archives restored into disposable destinations. All 22 migrations, RLS flags, constraints, policies and all public-table row fingerprints verified; controlled replacement-cluster restart and paired upload persistence passed. Corrupt archive, invalid SQL, nonempty target, rollback and valid retry checked. See [operator prerequisites and exact recovery evidence](PHASE2_RECOVERY.md) |

Defects fixed: non-GST receipt button now follows frozen sale tax facts; product form captures its upload before awaiting, navigates after successful save and handles absent non-GST HSN; mobile POS grid contains its table. Actual PDF generation exposed both an RSC/native React boundary incompatibility and an old renderer/font-layout failure. The PDF package now compiles to a native Node entry, explicitly externalized from the invoice server bundle, and the necessary renderer dependency moved from 4.0.0 to 4.9.0. Native GST/non-GST PDF regressions cover real output. The final production trace includes `packages/pdf/dist/invoice.js` and renderer 4.9.0 dependencies. Test repairs include onboarding selectors, employee navigation/fixtures and waiting for sale-detail navigation before saving its URL.

CI's e2e job now provisions the exact disposable PostgreSQL service and uses the helper for migration, build and browser execution. LAN skip conditions were removed; missing isolated configuration throws instead of skipping. **Hosted GitHub Actions was not executed**; the full local suite ran with `CI=true`. This covers Chromium with a 360px mobile viewport, not physical-device or other-browser certification.

### Commands and final results

Commands run from the repository root on Windows with Node 22.13.1 and pnpm 9.12.0. Each final command's real exit code is recorded in its `.exit` file; local `.cache` artifacts are ignored by Git.

| Exact command | Result | Local evidence |
| --- | --- | --- |
| `node scripts/release-check.mjs build` | Passed, exit 0; production compilation, type validation, static generation and standalone output | `.cache/phase2-browser-build.log/.exit` |
| `node scripts/release-check.mjs e2e:commerce` | Passed, exit 0; 2/2, zero skipped, 30.0s | `.cache/phase2-commerce-production.log/.exit` |
| `$env:CI='true'; node scripts/release-check.mjs e2e` | Passed, exit 0; **20/20**, zero skipped or retries, 51.5s | `.cache/phase2-browser-final.log/.exit`; `apps/web/playwright-report/` |
| `$env:PATH='D:\Go\bin;'+$env:PATH; node scripts/release-check.mjs test:recovery` | Passed, exit 0; 7 top-level tests plus 1 subtest, zero skipped, 60.791s | `.cache/phase2-recovery-custom.log/.exit` |
| `node scripts/release-check.mjs test:pdf` | Passed, exit 0; 2/2 native-renderer tests, zero skipped | `.cache/phase2-pdf-final.log/.exit` |
| `node scripts/release-check.mjs test:transactions` | Passed, exit 0; 19/19, zero skipped; before renderer update, transaction source unchanged afterward | `.cache/phase2-browser-transactions.log/.exit` |
| `node scripts/release-check.mjs typecheck` | Passed, exit 0; all 8 packages before renderer update; final build also validated web types afterward | `.cache/phase2-browser-typecheck.log/.exit` |
| `pnpm audit --prod --json` | Passed, exit 0; zero production advisories after renderer update | `.cache/phase2-browser-audit.json/.exit` |
| `git diff --check` | Passed, exit 0 after release documentation edits; all 431 source hashes separately reconfirmed unchanged | `.cache/phase2-browser-diff-check.log/.exit` |
| `pnpm --filter @mybizone/web exec playwright test --list` without helper configuration | Expected nonzero configuration failure; guard verified, no tests run | `.cache/phase2-e2e-guard.log` |

Final scoped check passed: `pnpm exec biome check --diagnostic-level=error apps/web/tests/e2e apps/web/playwright.config.ts apps/web/next.config.mjs apps/web/package.json packages/pdf 'apps/web/app/(app)/products/_components/product-form.tsx' 'apps/web/app/(app)/sales/new/cart.tsx' 'apps/web/app/(app)/sales/[id]/page.tsx' 'apps/web/app/(app)/sales/[id]/_components/generate-invoice-button.tsx' scripts/release-check.mjs` — 19 files, no errors/fixes; `.cache/phase2-browser-biome.log/.exit`. The historical 249-test full suite below was **not rerun** after these changes; targeted checks and final production/browser acceptance establish this task's evidence.

The administrator build runner `.cache/phase2-browser-build.ps1` executes the exact build command above, redirects output and saves its exit code. Launch: `Start-Process -FilePath 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "D:\Data\Project\Claude Code\Project Folder - AR\inventory-system-v2\.cache\phase2-browser-build.ps1"' -PassThru`. Standalone output was preserved. Browser tests use the production `next start` server; its standalone-launch recommendation is recorded, not treated as installed-launcher acceptance.

### Failed attempts and remaining checks

Intermediate browser commands were repaired and superseded: initial `e2e` 15 passed/1 failed (ambiguous store selector); `e2e:dev` 3 passed/5 failed/11 not run (cold compilation/navigation and employee predicate); expanded `e2e` 16 passed/4 failed (PDF, non-GST HSN, mobile overflow and missing permission product), then 18 passed/2 failed (PDFs; `.cache/phase2-browser-pdf-failed.log`). `e2e:commerce:dev` timed out starting its server, zero tests run. First final-build commerce attempt passed GST but failed the non-GST revisit because the test captured the list URL before navigation; `.cache/phase2-commerce-navigation-failed.log`. The corrected focused and complete runs above passed. Expected over-return and permission-denied server logs in the final run are asserted negative cases.

An earlier build failed because the disposable database had stopped; only the verified `.cache/test-pgdata` cluster was restarted, and the final build passed. Sandbox process restrictions caused pre-test failures; approved retries ran the tests. One automatic approval review hit a usage limit, then succeeded after the user resumed. Recovery's initial expanded Windows harness hung on a daemon-inherited output pipe; file-backed logs fixed it, with final recovery passed. Detailed commands/failures are in [the work log](../../RELEASE_WORK_LOG.md) and [recovery report](PHASE2_RECOVERY.md). Dependency update command: `pnpm --filter @mybizone/pdf add @react-pdf/renderer@4.9.0 --save-exact --store-dir D:/.pnpm-store`; passed. Registry lookup initially hit cache EPERM; `pnpm view @react-pdf/renderer version --cache .cache/npm` passed.

**Remaining Phase 2 prerequisite:** seller-owned sandbox payment and email configuration. Not run: provider checkout/cancellation, real duplicate/out-of-order webhook delivery, email verification/reset/invitations, delivery failure/retry. Local cash/UPI recording is not payment-provider acceptance. Live payments were not activated. Backup archives contain database data only: matching offline uploads/configuration/secrets and fresh-cluster `app_user` role provisioning are required. Actual browser owner backup-trigger execution is not claimed by archive-format tests; anonymous denial is covered. Installer/launcher/clean-machine and Docker/cloud persistence/recovery remain Phase 3. Other report PDFs and prior [accounting](S2_S5_STABILIZATION.md)/[security](S3_STABILIZATION.md) limitations remain outside this acceptance claim.

Next task: complete Phase 2 provider sandbox/email acceptance when seller configuration exists. Stop here; no publication, deployment, purchase or Phase 3 advancement.

## Historical automated gate — 25 September 2026

Everything below describes the earlier frozen snapshot. Its source hash, full-suite totals and deferred-work statements are historical; the 26 September results above supersede browser/local-recovery status.

Date: 25 September 2026 (Asia/Calcutta). Scope: automated gate only; Phase 2 acceptance remains incomplete.

## Revision and source state

Base revision: `c3d590e77d057f20b464f513aaeca1d9c4679589`. This verifies the integrated, uncommitted working tree, **not** that commit alone. Initial Git status contained 234 modified entries, one deleted entry and 30 untracked entries (directories collapsed). Existing work was preserved. This session changes release documentation only; no application, dependency, schema or test fixes were needed.

Local evidence is in `.cache/phase2/` (ignored by Git). `status-before.txt` and `diff-before.txt` preserve the starting status and diff summary. A sorted SHA-256 manifest covers all 426 existing tracked/untracked, nonignored files outside `docs/` and `RELEASE_WORK_LOG.md`, including source, tests, migrations, configuration and lockfile. Its digest is `fde73ff28c2836c85ded9aea89384733ad99ef950cd48682b3a6db7ec534fdfd`. Documentation is excluded so recording results does not invalidate the tested source. The first Node-based Git enumeration failed with sandbox `spawnSync git EPERM`; direct PowerShell Git enumeration succeeded. The baseline manifest was captured while the build was starting, after lint/types/tests; no source edits occurred between those gates.

Environment: Windows, Node `v22.13.1`, pnpm `9.12.0`. All commands below run from `D:\Data\Project\Claude Code\Project Folder - AR\inventory-system-v2`.

## Phase 1 prerequisite review

- S1: current damage action captures `[updated]` from the guarded stock update and throws within the transaction if stock is insufficient.
- S2: invoice regression imports `invoices`; sale tax snapshot columns and SQL/Drizzle consistency constraint are present. Disposable migrations include 0021. Full tests include migration backfill/constraint and invoice concurrency/tax regressions.
- S3: current role loading checks membership, active/locked/password state and managed-account revocation; current security regression suites run in the full gate.
- S4: pinned dependency/Sentry migration and standalone build configuration remain present. Earlier advisory assessments remain historical; this session does not claim a new audit. Windows administrator build capability is checked by the actual build below.
- S5: party locks, ambiguous credit-return rejection and rounded settlement allowance remain present. Full tests include the transaction/accounting regressions. [Accounting limits](S2_S5_STABILIZATION.md) and [security limits](S3_STABILIZATION.md) remain applicable.

Inherited `D:\Data\Project\Claude Code\AGENTS.md` was read. Its graph tools were unavailable in tool discovery; targeted current-file/diff inspection was used. No child AGENTS.md was found. No delegation was needed.

## Commands and results

Output was redirected to the named `.log`; each gate's actual `$LASTEXITCODE` was saved in the matching `.exit` file. A successful shell inspection is not used as a substitute for a gate exit code.

| Exact command | Result | Evidence under `.cache/phase2/` |
| --- | --- | --- |
| `node --version`; `pnpm --version` | Passed: versions above | Session output |
| `& '.cache/postgres/pgsql/bin/pg_ctl.exe' status -D '.cache/test-pgdata'` | Reported no process in sandbox; not treated as database identity evidence | Session output |
| `& '.cache/postgres/pgsql/bin/psql.exe' -h 127.0.0.1 -p 55432 -U postgres -d mybizone_release_test -c 'SHOW data_directory;'` | Passed before mutation; confirmed this repository's `.cache/test-pgdata`; repeated for saved evidence, exit 0 | `database-identity.log`, `.exit` |
| `node scripts/release-check.mjs migrate` | Passed, exit 0: all 22 migrations 0000–0021 already applied, no pending migration | `migrate.log`, `.exit` |
| `pnpm lint` | Passed, exit 0: 377 files, zero errors, 113 warnings; no fixes/suppression | `lint.log`, `.exit` |
| `node scripts/release-check.mjs typecheck` (sandbox) | Failed, exit 1: Windows `spawn EPERM`, before checks | `typecheck.log`, `.exit` |
| `node scripts/release-check.mjs typecheck` (approved unsandboxed retry) | Passed, exit 0: all eight workspace packages | `typecheck-final.log`, `.exit` |
| `node scripts/release-check.mjs test` (approved unsandboxed) | Passed, exit 0: **249 tests / 27 files, zero failed or skipped**. Domain 90/9 files; DB 17/3; storage 23/2; web unit/integration 119/13 | `test.log`, `.exit` |
| `node scripts/release-check.mjs build` (Windows administrator process) | Passed, exit 0: compiled, validated types, generated 17/17 static pages and completed standalone output | `build.log`, `.exit` |
| `git diff --check` | Passed, exit 0 before and after documentation edits | `diff-check.log`, `.exit` |

The isolated helper pins `127.0.0.1:55432/mybizone_release_test`, test authentication, LAN mode and local test storage, and disables real integration keys. No ordinary dotenv-backed root database command was used. Migration “skip” means already applied, not skipped test coverage. Existing-database migration state was checked; a fresh empty-cluster bootstrap was not run.

The full suite runs every workspace `test` script; packages without one are not represented as tested. It excludes Playwright by configuration and does not invoke Go desktop tests. No targeted reruns or repeat full-suite run were necessary because the suite passed on its first invocation.

Build launch (the helper command above is inside the saved runner):

```powershell
$buildProcess = Start-Process -FilePath 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "D:\Data\Project\Claude Code\Project Folder - AR\inventory-system-v2\.cache\phase2\admin-build.ps1"' -PassThru
$buildProcess.Id
```

The runner changes to the repository, executes `node scripts/release-check.mjs build *> .cache/phase2/build.log`, saves `$LASTEXITCODE` to `.cache/phase2/build.exit`, then exits with that code. No system setting or standalone validation was disabled.

## Final integrated result

**Automated gate passed**, 25 September 2026 at approximately 03:07 IST. Production build exit 0 and standalone `apps/web/.next/standalone/apps/web/server.js` verified. Two webpack cache serialization performance warnings occurred; PowerShell rendered native stderr as `NativeCommandError`, but the actual build exit was 0. No symlink failure occurred. Lint's 113 warnings remain; they were not converted into errors or suppressed.

Final source fingerprint matches the baseline exactly (`before-manifest.txt`, `after-manifest.txt`, `fingerprint-before.log`, `fingerprint-after.log`). Final status is in `status-final.txt`. Manifest commands: `git -c core.quotePath=false ls-files -co --exclude-standard > .cache/phase2/files.txt`, then `node .cache/phase2/fingerprint.cjs before` / `node .cache/phase2/fingerprint.cjs after`. The local script hashes each existing file and the sorted manifest; see the source-state exclusions above. No source/configuration/test changes followed the passing checks; only these release documents changed. No automated blocker remains.

## Deferred checks and remaining acceptance

Not run and not counted complete: browser/HTTP customer journeys and mobile navigation; provider sandbox checkout/webhooks; actual backup/restore and upload persistence/error recovery; first-install LAN bootstrap; Go desktop tests and clean Windows installer acceptance; Docker/cloud deployment; fresh dependency install/audit; external email and live payments. Historical advisory and accounting/security limitations remain open for their respective follow-ups. No publication, public deployment, purchase or payment activation occurred.

Next task: Phase 2 browser/HTTP acceptance using disposable data, including allowed/denied employee and store-scoped flows and non-GST receipts. Then finish operator recovery and provider sandbox acceptance when their prerequisites are available. Do not advance to packaging or declare the whole Phase 2 complete from this automated report.
