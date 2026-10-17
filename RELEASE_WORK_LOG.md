# MyBizOne release preparation work log

## 13. Phase 2 browser and local recovery acceptance — 25–26 September 2026 (complete within requested scope)

- Read inherited AGENTS.md, status/phase plan and recent work-log entries; inspected the saved dirty tree before editing. Graph tools were unavailable, so used bounded source/diff inspection. Preserved prior work. Independent agents added permission-browser fixtures and disposable recovery coverage; the parent integrated and verified them. No customer database, deployment, purchase or live payment was used.
- Added actual onboarding, GST/non-GST commerce, image upload, purchase/sales return, employee/store/tenant boundaries and mobile-menu coverage. Removed LAN skip conditions; browser configuration now rejects an unconfigured database/LAN environment. CI e2e uses the same pinned helper for migrations/build/browser and a disposable port-55432 service, so missing LAN configuration cannot quietly skip core tests. Hosted CI has not been run from this local session.
- Fixed non-GST receipt availability using the sale's frozen tax facts; product form event lifetime, successful-save navigation and absent non-GST HSN input; mobile POS grid overflow. Production acceptance exposed PDF React runtime incompatibility and a native font/layout failure. The PDF package now compiles separately, with an explicit native webpack boundary; the only new dependency upgrade is required PDF renderer 4.0.0 → 4.9.0 and its transitive runtime. No unrelated upgrade/refactor.
- Browser history: first production attempt **15 passed / 1 failed** (ambiguous store/toast selector); cold-development attempt **3 passed / 5 failed / 11 not run**; expanded production attempt **16 passed / 4 failed** (GST PDF, non-GST HSN, mobile overflow, missing permission fixture product); next production attempt **18 passed / 2 failed** (PDFs). Focused development startup later timed out with zero tests run. First final-build commerce check passed GST but failed the non-GST revisit because its test captured the list URL before detail navigation; added an explicit URL assertion. Corrected `node scripts/release-check.mjs e2e:commerce` **passed 2/2**, zero skipped, 30.0s. Final `$env:CI='true'; node scripts/release-check.mjs e2e` **passed 20/20**, zero failed/skipped/retries, 51.5s, exit 0. Failed runs are not treated as acceptance.
- Isolated full-schema recovery **passed**, seven top-level Go tests plus one restart subtest, zero failures/skips. Real dump/restore, 22 migrations, RLS/constraints/policies, all restored public-table fingerprints across a controlled new-cluster restart, paired uploads and rollback/corruption/retry paths verified. See [exact recovery commands, intermediate Windows harness failure and operator prerequisites](docs/release/PHASE2_RECOVERY.md). Database archives require separately paired uploads/configuration and fresh-cluster application-role provisioning.
- Build initially failed on a stopped disposable PostgreSQL cluster; confirmed and restarted only `.cache/test-pgdata`, then reconfirmed its identity. Final `node scripts/release-check.mjs build` in a hidden administrator process **passed**, exit 0, including types/static generation/standalone output and the native PDF correction. Compiled invoice route uses native import; output trace includes the compiled PDF entry and renderer 4.9.0. Automatic approval review hit a usage limit on one transaction invocation (not executed); after the user resumed, `node scripts/release-check.mjs test:transactions` **passed 19/19**, and `node scripts/release-check.mjs typecheck` passed all 8 packages. Those checks preceded the renderer upgrade. `node scripts/release-check.mjs test:pdf` **passed 2/2**, zero skipped, using the actual updated renderer. Native PDF smoke initially failed with `unitsPerEm`, then passed after the necessary upgrade.
- Final scoped Biome check **passed**, 19 files, zero errors/fixes; exact command is in [the verification report](docs/release/VERIFICATION_REPORT.md). `pnpm audit --prod --json` **passed**, zero production advisories. Unconfigured `pnpm --filter @mybizone/web exec playwright test --list` failed as intended at the isolation guard, before tests. No repeat full unit suite or hosted CI was run; the earlier 249-test result remains historical. Expected permission/over-return server errors in the final browser log are asserted denial paths, not failures.
- Final evidence: `.cache/phase2-browser-build.log/.exit`, `.cache/phase2-commerce-production.log/.exit`, `.cache/phase2-browser-final.log/.exit`, `.cache/phase2-recovery-custom.log/.exit`, `.cache/phase2-pdf-final.log/.exit`, `.cache/phase2-browser-transactions.log/.exit`, `.cache/phase2-browser-typecheck.log/.exit`, `.cache/phase2-browser-biome.log/.exit`, `.cache/phase2-browser-audit.json/.exit`. Prior PDF and navigation failures preserved separately. Current 431-file source manifest SHA-256: `1a3c3c182313c1fd161f76f7ec77e7c70975e1b1a592b03c55c51847f958c6f4`; base revision remains `c3d590e77d057f20b464f513aaeca1d9c4679589`, with existing dirty work preserved.
- Updated [verification report](docs/release/VERIFICATION_REPORT.md), [status/next tasks](docs/release/STATUS_AND_NEXT_TASKS.md), [phase plan](docs/release/PHASE_PLAN.md) and [recovery evidence](docs/release/PHASE2_RECOVERY.md). Requested local work complete. Remaining Phase 2 blocker: absent seller-owned email/payment sandbox configuration; delivery/retry, checkout/cancellation and actual duplicate/out-of-order provider webhook acceptance are unrun. Next task is that provider acceptance when prerequisites exist. Installer/launcher/cloud acceptance remains Phase 3; no phase advancement, deployment or live payment. Stop here.
- Final `git diff --check` **passed**, exit 0 (`.cache/phase2-browser-diff-check.log/.exit`); all 431 source-file hashes reconfirmed unchanged after documentation updates.

## Scope and reporting rules

- Requested: complete and prepare MyBizOne for sale, using a team.
- Delivery: **both Windows desktop/local network and cloud**.
- Owner confirmed no business identity, support address, domain, hosting, or payment accounts are established yet.
- This log records work from the start of this effort, including work performed before the log was requested. Entries describe observed results; planned checks are not counted as passed.
- No production deployment, existing-database migration, customer-data changes, payment activation, or paid service purchase has been performed.
- Local secret files are not copied into this log. Temporary development/test credentials must never be reused for deployment.

## Team

| Workstream | Responsibility | Detailed log |
| --- | --- | --- |
| Integration (primary agent) | Baseline checks, public experience, subscription billing, integration and release evidence | This document |
| Access security | Authentication, employee lifecycle, authorization and tenant/store scope | [Security log](docs/release/security-log.md) |
| Transaction integrity | Sales, returns, settlements, EMI and inventory correctness | [Transaction log](docs/release/transactions-log.md) |
| Delivery readiness | Docker, Windows launcher/packaging, backup and isolated test database | [Delivery log](docs/release/delivery-log.md) |

## 1. Project discovery (read-only)

- Inspected workspace structure, root CLAUDE.md, ARCHITECTURE.md, ROADMAP.md, v2 README, package manifests, launch checklist and recent git history.
- No AGENTS.md was found in the searched workspace.
- Identified legacy MERN app in `inventory-system` and main Next.js/Postgres product in `inventory-system-v2`.
- Traced server actions, session lookup, RLS transaction helper, sale creation, role permissions, storage, deployment, test configuration and CI.
- V2 working tree was initially clean. Latest observed commit: `c3d590e` (auth layout prerender fix).
- Found documentation drift: README/checklist refer to 17 migrations; 20 existed at baseline. Documentation's "code complete" statement is not evidence of release readiness.

## 2. Baseline verification

- `pnpm typecheck`: first attempt failed with Windows sandbox `spawn EPERM`. Reran with requested escalation: **passed** across workspace.
- `pnpm --filter @mybizone/domain --filter @mybizone/storage --filter @mybizone/web test`: first attempt failed with the same sandbox restriction. Escalated rerun: **128 tests passed** (74 domain, 23 storage, 31 web).
- These were baseline unit/type checks only. Database isolation tests, production build, browser flows and clean-machine desktop startup were not verified by these commands.
- Node and pnpm are installed. Docker and PostgreSQL were not found on PATH. Delivery agent located Go outside PATH and began preparing isolated local PostgreSQL tooling.

## 3. Blockers found and work in progress

- Security agent found missing authorization in employee mutations, locked-account session handling and scope-gate problems; fixes and regression checks in progress.
- Transaction agent found unsafe return valuation/quantity handling, settlement/EMI concurrency and overpayment issues; fixes and regression checks in progress.
- Delivery agent found broken Docker working directory, desktop database initialization and runtime/packaging paths; fixes in progress.
- Cloud R2 storage implementation is a stub. Supported cloud deployment is being based on a persistent filesystem volume; serverless R2 deployment must not be represented as complete.
- Public homepage contained an unowned WhatsApp number, unconfirmed domain and prices; help screen contained an unconfirmed support email. Replacing these with configurable, truthful information is queued.
- Subscription webhook used event type + subscription ID as its deduplication key, committed deduplication before plan updates, swallowed unrelated database failures as duplicates, and had no subscription binding/order protection.

## 4. Integration changes started

- Added `packages/db/migrations/0020_subscription_state.sql` and business schema fields for subscription ID/status/event timestamp. Migration has **not yet been applied**.
- Added `apps/web/lib/subscription-events.ts`: validated event shape, constant-time HMAC comparison, supported entitlement transitions, and stale-event ordering guard. Tests and route integration are pending.
- Consulted official [Razorpay webhook validation documentation](https://razorpay.com/docs/webhooks/validate-test/) for event-ID deduplication and delivery ordering semantics.

## Release status

**In progress — not approved for sale or production.** Passing the baseline checks does not establish business-flow correctness. The final release record must include actual test results and remaining external setup/validation requirements.

## 5. Implemented integration and validation (15–16 September 2026)

- Replaced the homepage's invented WhatsApp number, domain and prices with factual product descriptions and optional configured support links. Added `/guide` with shop setup, purchases, billing, returns and backup guidance. Help and license screens no longer advertise an unowned address/domain.
- Added `SUPPORT_EMAIL` / existing WhatsApp config handling in `lib/public-config.ts`; invalid or absent contact details are omitted.
- Signup now reports account-ready in LAN mode when no verification email is required. Production cloud signup rejects registration before account creation if email delivery is unavailable.
- Completed subscription webhook integration: raw-body HMAC validation, provider event ID, transactionally committed deduplication and plan update, stored subscription binding, and rejection of older entitlement events. Added unit regressions for signatures, invalid payloads and event ordering.
- Subscription checkout now checks permission, requires complete billing configuration, serializes creation and reuses unfinished subscriptions. Checkout loads its script before enabling the button, handles failures/dismissal and waits for server confirmation before representing a plan as active. Hardcoded price claims were removed; checkout displays the configured provider price.
- Isolated PostgreSQL 16 cluster was provisioned under ignored `.cache`, bound to `127.0.0.1:55432`. Created only `mybizone_release_test` and applied migrations 0000–0020 successfully. Original database configuration was not used. Test server may need restarting after a session interruption.
- Added `scripts/release-check.mjs` to force isolated database/auth/storage values and disable real email/payment/analytics integrations for verification.
- Confirmed all 16 existing RLS tests pass. Subsequent combined test runs passed 90 domain, 23 storage and 34 web unit tests. Transaction agent subsequently reported 175 total tests passing, including action-level concurrency regressions; see its detailed log for exact cases and later results.
- Production build compiled JavaScript but failed type validation because Better Auth 1.1.1's inferred signup result did not expose `user`. Security agent changed response validation to explicit Zod parsing. Production build remains pending after dependency migration.
- Initial lint found 312 errors / 29 warnings. Applied Biome safe fixes (171 files; mostly formatting and import organization), then targeted string-literal, Node import, template and self-closing JSX fixes. Remaining diagnostics require targeted edits; lint is not yet green. One attempted `biome check --only` command failed because that option belongs to `biome lint`; reran using the supported subcommand.
- Subagents hit account usage limits twice. Saved changes were preserved. They resumed when available and created individual logs; no unfinished result is treated as passed.

## 6. Dependency release blockers and migration in progress

- Registry audit initially failed due to sandbox network restrictions; escalated retry succeeded. Snapshot `.cache/dependency-audit.json` reported 2 critical, 45 high, 21 moderate and 5 low advisories. Counts include transitive packages and optional feature exposures; this is not a count of demonstrated exploitable app bugs.
- Official [Next.js August 2026 release](https://nextjs.org/blog/august-2026-security-release) documents patched maintenance version 15.5.24 and a Windows-hosted mixed-router RCE. Replaced unsupported 14.2.18 with 15.5.24. Official async request migration tool is being run for cookies/headers/route params.
- Selected patched Better Auth 1.6.33 (latest 1.6 patch returned by npm), Drizzle 0.45.2, Playwright 1.63.0, PostCSS 8.5.28 and Axios 1.20.0 based on registry advisory/version checks. Installation and compatibility checks are in progress.
- Switched SheetJS from obsolete npm 0.18.5 to the vendor's [documented 0.20.3 package](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/). Download and export compatibility verification are pending.
- Package installation uses the existing `D:/.pnpm-store` with escalation because it is outside the workspace. The initial default-store attempt was rejected before changing dependencies. An initial codemod invocation rejected `--store-dir`; the corrected command uses pnpm dlx.

**Current gate:** dependency installation/migration, full typecheck/lint/build, browser flows and desktop acceptance remain pending. No public release or sales-readiness claim has been made.

## 7. Saved-work handoff and requested stop — 17 September 2026

- Owner requested a status update, an upcoming plan/task document and a stop. Interrupted the running security and delivery agents; the transaction agent had already stopped on its account limit. No further implementation or release was performed during this handoff.
- Dependency installation and the saved API migration progressed beyond section 6: Next 15.5.24, Better Auth 1.6.33, Drizzle 0.45.2, Playwright 1.63.0, Vitest 4.1.11, vendor SheetJS 0.20.3, Vite 6.4.3 and Zod 4 with application `zod/v3` imports. These are installed changes, not final compatibility approval.
- Inspected the latest audit snapshot: 0 critical, 0 high and 1 moderate advisory (esbuild). Remaining exposure/fix assessment is pending.
- Inspected saved build/test exit files: both exit 1. Build compiled JavaScript but failed type validation at `damage-logs/actions.ts:84` because `updated` is undefined; confirmed the defect remains in source. Latest web tests report 51 passed and 1 failed: invoice concurrency test lacked `invoices`. The import is now present in source, but no passing rerun was recorded.
- Migration `0021_sale_tax_snapshot.sql` exists with related unfinished/unverified changes. Only migrations through 0020 have recorded successful isolated application. Earlier passing test totals do not validate the current tree.
- Browser acceptance, final lint/typecheck, installer acceptance and cloud deployment remain unverified. No customer launch, seller account setup or payment activation occurred.
- Created [Status and next tasks](docs/release/STATUS_AND_NEXT_TASKS.md), covering saved work, evidence, blockers, phased priorities/owners/acceptance, external owner inputs and safe resume commands. Updated [Phase plan](docs/release/PHASE_PLAN.md) to mark the requested pause.
- Documentation handoff complete. Engineering and commercial readiness remain incomplete; resume with the stabilization tasks in the handoff document.

## 8. S1 / S4 stabilization — 18 September 2026

- Inspected current Git status/diffs, release notes, action/transaction code and inherited AGENTS.md before editing. Preserved the large saved migration/security/transaction/delivery diff. Requested graph tools were unavailable; used targeted file inspection. No subagents were needed.
- **S1 complete:** captured `[updated]` from the guarded damage stock UPDATE, preserving tenant transaction rollback and the SQL stock predicate. Corrected the stale negative-stock comment. Added excessive-damage and concurrent-final-unit regressions checking inventory and damage/audit persistence.
- **S4 code work:** resolved all five lint errors using only the reported files; upgraded direct `tsx` 4.19.2 to pinned 4.20.5 and refreshed the lockfile; added the current Sentry `onRequestError` hook and replaced obsolete source-map configuration options. No validation checks, error reporting or standalone output were disabled.
- `node scripts/release-check.mjs test:damage`: final **passed**, 2 passed / 7 intentionally filtered. First helper version incorrectly let pnpm consume the name filter: 4 passed / 5 failed in the complete transaction file. Those unrelated failures require missing disposable-database migration 0021 and are recorded for S2; no migration was applied in this scope.
- `pnpm lint`: initial **failed**, 5 errors / 44 warnings; final **passed**, 0 errors / 44 existing warnings. `node scripts/release-check.mjs typecheck`: sandbox attempt **failed** on `spawn EPERM`; elevated source-fix and final post-install/Sentry runs **passed** all 8 workspace packages.
- `pnpm --filter @mybizone/db add -D tsx@4.20.5 --store-dir D:/.pnpm-store` and `pnpm install --frozen-lockfile --store-dir D:/.pnpm-store`: **passed**. `pnpm --filter @mybizone/db exec tsx --version`: **passed**, tsx 4.20.5 / Node 22.13.1.
- `pnpm audit --prod --json`: **passed**, zero advisories. `pnpm audit --json`: **advisories remain**, 2 moderate esbuild findings in old Drizzle Kit development paths and 1 low CSS-parser finding, 0 high/critical. Removed the original tsx/esbuild production peer path. Full dependency paths, exposure assessment and outstanding Drizzle upgrade decision are in the evidence document; this is not a clean-full-audit claim.
- Verified PostgreSQL PID 15268 serves only the intended `.cache/test-pgdata` at `127.0.0.1:55432/mybizone_release_test` using `pg_ctl status` and `psql ... -c 'SHOW data_directory;'`. Sandbox process visibility was misleading; an attempted cluster start failed because it was already running. Did not remove lock files or use another database.
- `node scripts/release-check.mjs build`: **failed**, exit 1. Compilation, type validation and all 17 static pages succeeded; standalone tracing/copying then failed to create directory symbolic links (`EPERM`). An elevated minimal local symlink probe reproduced the OS restriction. **S4 remains blocked on build acceptance.** Sentry follow-up edits pass final lint/types but have not completed a production rebuild. Kept standalone configuration intact; did not repeat a predictably blocked build or change system settings.
- `pnpm exec biome check apps/web/instrumentation.ts apps/web/next.config.mjs scripts/release-check.mjs` and `git diff --check`: **passed**. No full-suite rerun, browser acceptance, schema migration, packaging, publishing or live integrations were run.
- [Detailed commands, results and advisory assessment](docs/release/S1_S4_STABILIZATION.md), [updated status](docs/release/STATUS_AND_NEXT_TASKS.md), and [phase plan](docs/release/PHASE_PLAN.md) preserve the evidence and limitations. Next: finish S4's build gate in a symlink-capable Windows/Linux environment, then S2 migration/invoice/tax regression work. S3/S5 and integrated acceptance remain pending.

## 9. S1 / S4 completion after requested continuation — 18 September 2026

- Re-inspected current changes, status/phase plan, prior evidence and the build failure. `whoami /priv`, `wsl --list --quiet` and the Windows principal check showed the unsandboxed process was not a Windows administrator and no WSL distribution was available.
- Resolved the build prerequisite by launching the isolated helper in an administrator PowerShell process with `Start-Process -Verb RunAs -WindowStyle Hidden`. This used Windows UAC; no Developer Mode, registry, security-policy, dependency or application-source change was needed. The first temporary runner failed before building because PowerShell stripped inline JavaScript quotes. Moved the probe to `.cache/s1-s4-symlink-probe.cjs`; the corrected administrator probe **passed**. Exact launch command and logs are in [S1/S4 evidence](docs/release/S1_S4_STABILIZATION.md).
- `pnpm lint`: **passed**, 0 errors / 44 existing warnings (`.cache/s1-s4-resume-lint.log`). Reconfirmed disposable PostgreSQL data directory with `pg_ctl status` and `psql ... -c 'SHOW data_directory;'`. `node scripts/release-check.mjs test:damage`: **passed**, 2 passed / 7 intentionally filtered (`.cache/s1-s4-resume-damage.log`).
- `node scripts/release-check.mjs typecheck`: **passed**, all 8 workspace package checks (`.cache/s1-s4-resume-typecheck.log`).
- `node scripts/release-check.mjs build` in the Windows administrator process: **passed, exit 0**, approximately 22:27 IST. Final source compiled, types passed, 17 static pages generated and standalone output completed. Confirmed generated `apps/web/.next/standalone/apps/web/server.js`. Logs: `.cache/s1-s4-build-admin.log` and `.cache/s1-s4-build-admin.exit`. Only webpack cache-performance warnings remained; neither the old Sentry missing-hook warning nor the symlink error recurred. `git diff --check`: **passed**.
- **S1 and S4 are now complete.** Previous section's build blocker is resolved by the administrator invocation. Remaining full-audit development findings (2 moderate esbuild, 1 low CSS parser), 44 lint warnings and S2's missing migration 0021 / unrelated transaction failures remain explicitly documented; no new full-suite or browser acceptance claim is made.
- Updated [status](docs/release/STATUS_AND_NEXT_TASKS.md) and [phase plan](docs/release/PHASE_PLAN.md). Stopped at stabilization scope. Next: S2 migration/invoice/tax verification through the isolated helper, then S3/S5. No packaging, public deployment, payments or customer database operations were performed.


## 10. S2 / S5 completion - 18 September 2026

- Read release status/plan, recent work log, transaction log and inherited AGENTS.md; inspected the dirty tree and scoped code/diffs before editing. Preserved saved work. Required graph tools were unavailable; used targeted inspection. No delegation, dependency upgrades, publishing, customer data or live services.
- **S2 complete:** verified saved invoice-test import; completed Drizzle parity with migration 0021's tax CHECK; verified saved sale snapshots and invoice generation, removing unused current-tax reads and stale inference instructions. Applied 0021 only through the isolated helper. Regressions prove backfill/unknown handling, constraints, concurrent single-number issuance, delayed issuance after settings changes, intra/interstate tax, non-GST receipts, missing-PDF tax recovery and rejection of unknown historical tax.
- **S5 complete within explicit limitations:** fixed credit returns reducing unrelated debt after unallocated settlements. Party locks serialize receipt/return decisions; ambiguous allocation, absent original party and insufficient debt now fail atomically. Reject non-completed sales and duplicate-product returns with conflicting original costs. Fixed paisa rounding in the reserved-EMI allowance. Added supplier, mixed EMI/settlement and return/receipt race coverage.
- Extracted the existing P&L query to a shared report helper for actual-database coverage of tax-exclusive revenue/returns, free-goods COGS, returned original cost, estimates, India-midnight cutoff and expenses. Existing all-movement closing-stock regression passes. Precise unsupported accounting cases are recorded in [S2/S5 evidence](docs/release/S2_S5_STABILIZATION.md); no accounting certification is claimed.
- `node scripts/release-check.mjs migrate`: **passed**, applied 0021 after skipping 0000-0020. Rerun **passed**, all 22 migrations already applied. Compatibility regression executes actual migration SQL against temporary pre-0021 tables.
- `node scripts/release-check.mjs test:domain`, `node scripts/release-check.mjs test:db`, `node scripts/release-check.mjs test:transactions`: initial sandbox attempts **failed before tests** with `spawn EPERM`. Approved unsandboxed reruns: domain **90 passed / 0 skipped**, DB **17 passed / 0 skipped**. Transactions first **14 passed**; expanded run **16 passed / 1 failed** because the new expense fixture omitted required description. Corrected fixture; final **19 passed / 0 skipped**, exit 0 at 22:54 IST. **126 distinct relevant tests passed**, not a full-suite result.
- `node scripts/release-check.mjs typecheck`: **passed**, exit 0, all 8 workspace packages.
- `pnpm exec biome check --write scripts/release-check.mjs packages/db/src/schema/sales.ts packages/db/tests/sale-tax-migration.test.ts 'apps/web/app/(app)/invoices/actions.ts' 'apps/web/app/(app)/returns/actions.ts' 'apps/web/app/(app)/purchase-returns/actions.ts' 'apps/web/app/(app)/settlements/actions.ts' 'apps/web/app/(app)/reports/pl/page.tsx' apps/web/lib/reports/profit-loss.ts apps/web/tests/integration/transaction-actions.test.ts`: **passed**, 10 files, 24 non-null-assertion warnings, no unsafe fixes. Final same command with `--diagnostic-level=error` after `--write`: **passed**, zero errors. Only scoped files formatted.
- `& '.cache/postgres/pgsql/bin/pg_ctl.exe' status -D '.cache/test-pgdata'`: sandbox **reported no process** (visibility restriction); unsandboxed **passed**, PID 15268 using `.cache/test-pgdata` on 127.0.0.1:55432. All database mutations/tests used the pinned release helper configuration. No restart/lock removal. `git diff --check`: **passed**.
- **Not run / no new passing claim:** full workspace tests/lint/build, browsers, actual PDF/storage failure acceptance, fresh-cluster bootstrap, backup/restore, packaging, cloud or payment acceptance. Earlier S4 build predates these edits.
- Updated [evidence and accounting limits](docs/release/S2_S5_STABILIZATION.md), [transaction log](docs/release/transactions-log.md), [status](docs/release/STATUS_AND_NEXT_TASKS.md) and [phase plan](docs/release/PHASE_PLAN.md). No blocker remains for bounded S2/S5; limitations require owner/accountant acceptance before launch. **Next: S3 read-side route/export/store isolation, role revocation and session regressions.** Stopped without advancing phases.

## 11. S3 security stabilization — 24–25 September 2026

- Read status/phase plan, security log, recent work log and inherited AGENTS.md; inspected current files and the large dirty-tree diff before editing. Graph tools required by inherited instructions were unavailable after discovery, so used targeted inspection. Preserved saved S1/S2/S4/S5 work. Independent page/export, mutation and onboarding reviews used nonoverlapping ownership; root completed integration and verification.
- **S3 complete within the documented supported scope:** added missing page/report-action gates; protected store-specific sales/POS/CSV, product pages/images and persisted-record file access; validated cross-business foreign references in catalogues/products/categories/departments/quotation/challan/customer-note/tag mutations. Scoped staff cannot use shared customer balances or business-wide report/administration endpoints without an unscoped grant.
- Fixed final-role revocation restoring legacy privileges, stale role-string administration checks and legacy backfill scope/owner compatibility. Current role loading checks business membership, active/locked state and temporary-password status. Employee operations protect legacy and explicit owners; password resets revoke sessions; sign-in/password changes coordinate account locks. Ownership transfers revalidate both parties and do not log tokens.
- Hardened invitation acceptance, new-business creation, administration-only onboarding pages (including demo-product writes), cloud-denied/atomic/validated LAN bootstrap, malformed credential bodies, concurrent failed-login counting and pending-password boundaries. Kept existing Better Auth integration; no authentication redesign or schema/dependency upgrade.
- Backup status/download/trigger share sole-matching-business LAN owner authorization; web restore stays offline. Regression checks exercise denied entry points before filesystem/process access, with allowed filesystem/pg_dump behavior mocked. Public license probes no longer expose business/plan/expiry details. Actual dump provenance, concurrent provisioning, backup/restore and first-install LAN bootstrap success are deferred operator/acceptance checks, explicitly documented.
- Database prerequisite: `& '.cache/postgres/pgsql/bin/pg_ctl.exe' status -D '.cache/test-pgdata'` initially reported no cluster (also confirmed unsandboxed); `& '.cache/postgres/pgsql/bin/psql.exe' -h 127.0.0.1 -p 55432 -U postgres -d mybizone_release_test -c 'SHOW data_directory;'` initially failed with connection refused. `& '.cache/postgres/pgsql/bin/pg_ctl.exe' start -D '.cache/test-pgdata' -l '.cache/s3-postgres.log' -o '-h 127.0.0.1 -p 55432'` **passed**; subsequent data-directory query **passed**, confirming this repository's disposable `.cache/test-pgdata`. No lock removal/customer database use.
- `node scripts/release-check.mjs test:security`: sandbox attempt **failed before tests** (`spawn EPERM`). Approved unsandboxed initial run: **48 tests passed but suite failed** on two fixture cleanup hooks (`user_roles_store_id_fkey`); fixed role-first cleanup. Expanded run **52 passed / 1 failed** on circular React test serialization; fixed assertion. Subsequent **60 passed**, then final **62 passed / 0 skipped**, exit 0, 25 September 02:51 IST (`.cache/s3-security-final.log`). All authorization behavior assertions passed on final source.
- `node scripts/release-check.mjs test:permissions`: **14 passed / 0 skipped**, exit 0 (`.cache/s3-permissions.log`). `node scripts/release-check.mjs test:transactions`: **19 passed / 0 skipped**, exit 0 (`.cache/s3-transactions.log`); one targeted existing-suite rerun justified by sale/return/product authorization changes. **95 distinct relevant tests passed**, not a full-suite count.
- `node scripts/release-check.mjs typecheck`: initial and final **passed**, exit 0, all eight workspace packages (`.cache/s3-typecheck.log`, `.cache/s3-typecheck-final.log`). Final functional source passed; later changes were formatting/documentation only.
- `pnpm exec biome check --diagnostic-level=error apps/web/app apps/web/lib/get-user-roles.ts apps/web/lib/backup-access.ts apps/web/tests/integration apps/web/tests/unit/backup-access.test.ts apps/web/tests/unit/backup-routes.test.ts scripts/release-check.mjs`: initial **failed**, 42 formatting errors (41 newly introduced CRLF page endings and one test layout). Restored those page endings to LF and ran `pnpm exec biome check --write --diagnostic-level=error apps/web/tests/integration/security-routes.test.ts` (**passed**). Final same read-only scoped command **passed**, 218 files / zero errors (`.cache/s3-biome-final.log`). Warnings remain; no unsafe fixes or broad unrelated formatting. `git diff --check`: **passed**.
- **Not run / no passing claim:** migrations (none needed for S3), full workspace tests/lint/build, browser acceptance, first-install empty-instance LAN bootstrap success, actual backup/restore, packaging/cloud deployment, real email or live payments. Earlier S4 build is stale for this source. Failed early fixture cleanup left only disposable S3 data; final cleanup passed.
- Updated [S3 evidence, exact commands, supported behavior and risks](docs/release/S3_STABILIZATION.md), [security log](docs/release/security-log.md), [status](docs/release/STATUS_AND_NEXT_TASKS.md) and [phase plan](docs/release/PHASE_PLAN.md). No local prerequisite blocker remains for bounded S3. Department-only workflows, business-wide account/report access, request-time revocation semantics, email outbox/abuse-limiting and operator backup constraints remain explicit limits. **Next: Phase 2 integrated verification against one frozen source snapshot.** Stopped after S3; no publication, deployment, purchase or payment activation.

## 12. Phase 2 automated gate - 25 September 2026

- Read inherited AGENTS.md, release status/plan and recent work-log entries; inspected current Git changes and Phase 1 source before running gates. Graph tools were unavailable; used targeted inspection. Preserved all saved work; no subagents, application edits, dependency upgrades or schema changes were needed.
- Confirmed current damage-stock capture, invoice import/tax constraint, role/account-state checks, party locks/credit-return reconciliation and rounded settlement guard. Prior security/accounting limitations remain explicit; historical audit results were not rerun or presented as current.
- Base revision `c3d590e77d057f20b464f513aaeca1d9c4679589`, dirty tree: initially 234 modified entries, one deletion and 30 untracked entries (directories collapsed). Gates verify that integrated working tree, not HEAD alone. Only release documentation changed this session. Before/after 426-file non-documentation SHA-256 manifest: `fde73ff28c2836c85ded9aea89384733ad99ef950cd48682b3a6db7ec534fdfd`.
- `node --version` / `pnpm --version`: passed, v22.13.1 / 9.12.0. `& '.cache/postgres/pgsql/bin/pg_ctl.exe' status -D '.cache/test-pgdata'` reported no process in sandbox. `& '.cache/postgres/pgsql/bin/psql.exe' -h 127.0.0.1 -p 55432 -U postgres -d mybizone_release_test -c 'SHOW data_directory;'`: passed, confirming this repository's disposable `.cache/test-pgdata` before mutation; repeated for saved evidence. No restart, lock removal or customer database use.
- `node scripts/release-check.mjs migrate`: passed, exit 0; all 22 migrations 0000-0021 already applied, none pending. Full suite includes actual legacy tax migration SQL regression. Fresh empty-cluster bootstrap not run.
- `pnpm lint`: passed, exit 0, 377 files / zero errors / 113 warnings. No broad formatting or suppression. `node scripts/release-check.mjs typecheck`: sandbox failed exit 1 on `spawn EPERM`; approved unsandboxed retry passed exit 0, all eight packages.
- `node scripts/release-check.mjs test` (approved unsandboxed, isolated helper): passed first invocation, exit 0, **249 tests / 27 files / zero failed or skipped**: domain 90, DB 17, storage 23, web unit/integration 119. No targeted rerun or repeated full suite was necessary.
- `node scripts/release-check.mjs build` through a hidden Windows administrator PowerShell runner: passed, exit 0 at 03:06:49 IST, compilation/types, 17 static pages and standalone output complete. `Test-Path apps/web/.next/standalone/apps/web/server.js`: True. Two webpack cache performance warnings remain; PowerShell's native-stderr label did not indicate a failed build. Exact administrator launch and runner behavior are in [verification report](docs/release/VERIFICATION_REPORT.md). No system settings or build gates changed.
- `git -c core.quotePath=false ls-files -co --exclude-standard > .cache/phase2/files.txt`; `node .cache/phase2/fingerprint.cjs before` / `node .cache/phase2/fingerprint.cjs after`: passed, identical source manifests. Initial Node child-process Git enumeration failed with sandbox `spawnSync git EPERM`; direct PowerShell enumeration resolved it. `git diff --check`: passed before and after documentation. Logs, actual gate exit codes, initial/final status and manifests are under `.cache/phase2/`; the report preserves material results because local logs are ignored.
- **Automated portion complete; whole Phase 2 remains incomplete.** Not run: browser/HTTP/mobile acceptance, provider sandbox checkout/webhooks, actual backup/restore/upload recovery, first-install LAN success, Go desktop tests, installer/cloud acceptance, fresh install/audit, external email or live payments. No publication, public deployment, purchase or payment activation. No automated prerequisite blocker remains; other acceptance and documented product limitations still block release readiness.
- Updated [verification report](docs/release/VERIFICATION_REPORT.md), [status and next tasks](docs/release/STATUS_AND_NEXT_TASKS.md), and [phase plan](docs/release/PHASE_PLAN.md). **Next task: Phase 2 browser/HTTP acceptance with disposable data, including employee/store boundaries and non-GST receipts.** Stopped at the requested automated gate.


## 13. Phase 2 provider acceptance preparation — 26 September 2026

Read inherited AGENTS.md, required release documents and current scoped source/diffs before edits. Graph tools were unavailable after discovery; used targeted inspection. Preserved saved work, with no delegation, dependency upgrade or unrelated refactoring.

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


## Grouped Git commits — 26 September 2026

- Owner requested commits split according to the work completed. Created eight implementation/test commits on local `main`, followed by a documentation commit; see [commit handoff](docs/release/COMMIT_HANDOFF.md) for hashes and scope.
- Preserved the saved application tree; grouped final file versions by dependency/runtime, security, transactions, billing, customer guidance, delivery, acceptance and provider work. Did not reconstruct intermediate snapshots or claim each commit independently passes release gates.
- Initial index was empty; Git diff checks passed before staging and for each staged group. Credential-pattern/file inventory checks excluded environment files, ignored databases/caches, private signing keys and generated outputs. No application edits or new test executions were needed for this bookkeeping task.
- Added the release evidence, phase plans, supported limitations and session logs to version control. Actual provider acceptance, desktop/cloud acceptance and seller setup remain pending. No push, deployment or publication performed.

## Local manual testing launch

- Owner asked whether Docker is needed and requested a local launch. Confirmed Node 22.13.1, pnpm 9.12.0 and the repository's isolated PostgreSQL cluster on 127.0.0.1:55432. Docker is not installed and is not required for this native development path.
- Production startup failed: initial sandbox socket permission denial, then approved retry reported no usable production build. No passing production-start claim.
- Added a `dev` option to the isolated release helper and bound both dev/start to 127.0.0.1. Development mode retains pinned disposable database/storage and disabled payment/email integrations. Approved `node scripts/release-check.mjs dev` started the server for manual testing on port 3000.
- PDF package compiled and Next reported Ready. Manual testing is local only; it does not satisfy provider, installer or cloud acceptance. Existing real business data and credentials were not used. Launch changes remain uncommitted after the earlier grouped commit handoff.

## Controlled local webhook setup — 29 September 2026

- User authorized an HTTPS endpoint for local testing and confirmed test keys/plans exist in root `.env`. Inspected only presence/test-prefix/matching-ID booleans, never printed credential values or loaded unrelated customer database configuration.
- Added `webhook:dev` isolated runner on localhost:3001 and a webhook-only HMAC gateway on localhost:3300. Created ignored `.env.webhook-test` with a random secret (existing secrets are never overwritten), plus an unused ignored `.env.razorpay-test` blank template before owner clarified the actual credential file.
- Official cloudflared downloaded into ignored cache with published checksum verification. Local Next app and gateway started; synthetic signed ignored-event roundtrip passed HTTP 200. Focused gateway regression passed after approved retry of sandbox spawn denial. Existing isolated PG restarted and data directory verified. No real provider API calls or subscription writes performed.
- Public HTTPS setup remains incomplete: default DNS refuses api.trycloudflare.com; Cloudflare process-specific resolver retry did not fix initial API resolution. Explicit diagnostic DNS query succeeded. No system DNS/hosts/firewall changes made; no tunnel is connected and no public URL was produced.
- Documented restart commands, secret location, tests and exact blocker in [local webhook guide](docs/release/LOCAL_WEBHOOK_TESTING.md). Phase 2 provider acceptance remains blocked. Local processes remain running for testing; application checkout/email remain disabled in this runner. Changes uncommitted.

## Reusable Pro test account and acceptance — 14 October 2026

- Owner requested holding Razorpay and creating the highest-access test account, then asked to preserve credentials for future tasks and enable the same account on https://mybizoneapp.vercel.app/.
- Created `pro.owner@example.com` in the verified disposable PostgreSQL database, business MyBizOne Pro Test Shop, owner role (all tenant-level permissions), Pro plan (unlimited stores/products/users), two initial stores and sample stock. No provider subscription or production license was created. Verified seed rerun preserves the existing account/data.
- Added guarded `scripts/seed-pro-test.mjs`, isolated `seed:pro` command and separate `e2e:pro:dev` browser scenario. Canonical reusable credentials are in ignored `.local/test-accounts/pro-owner.json`, outside disposable caches; added an explicit ignore rule. Initial ignored cache copy is retained. Passwords were not printed, committed or included in reports.
- Full automated suite passed: 258 tests (90 domain, 17 DB, 23 storage, 126 web, 2 PDF), exit 0; `.cache/pro-full-tests.log/.exit`. This run predates concurrent performance edits and the later dashboard fix; it is not final-tree full-suite evidence.
- First full browser run was invalidated by concurrent edits to dashboard/list pages and Next configuration. Login timed out and the server restarted; stopped only this session's identified test process tree. User agreed to pause the other task. Preserved its changes rather than reverting them.
- Typecheck exposed an optional analytics key lost across an async closure in the concurrent PostHog change. Passed the narrowed key as an explicit string argument. Pro browser testing then exposed raw Date parameters in the new dashboard aggregates; replaced them with Drizzle typed comparison expressions. Added real isolated-DB dashboard date regression: 1 passed. Final workspace typecheck passed; scoped Biome passed.
- Initial Pro test successfully created an extra store but failed because its text selector matched both a card and toast. Changed assertion to the store heading. Rerun passed: 1 browser scenario, zero retries, verifying login, Pro/unlimited indicators, extra-store creation and 16 application/admin routes; `.cache/pro-owner-browser-final.log/.exit`. Browser-created stores remain for manual use.
- Identified the requested hosted site's Vercel Primary project/team. Connector metadata access succeeded, but database-secret access returned 403; same-scope CLI fallback lacked login and its waiting process was stopped. Local env files point to localhost. Asked owner to reconnect the Vercel account or privately supply development DB configuration. No hosted database/account/environment/deployment was modified. Razorpay stays on hold.
- Updated phase/status docs and [local Pro report](docs/release/LOCAL_PRO_TESTING.md). Hosted setup and final targeted commerce results are recorded there. No commits/pushes in this session; preserve the other task's performance changes.

## Test-account continuation and hosted handoff — 14 October 2026

- User clarified `.env` is a testing database. Verified its connection metadata without printing credentials: localhost:5432/mybizone; connection refused. This local connection cannot identify the Vercel-hosted database. No `.env.hosted-test` connection exists.
- Vercel reconnection succeeded, replacing the earlier 403, but its sensitive DATABASE_URL is not retrievable (no value, decrypted=false). One HTTPS test-account sign-in returned 401. Hosted account still unprovisioned; no hosted mutations/deployment made. Asked which database provider backs the site.
- Prepared `scripts/prepare-pro-hosted.mjs` and private ignored `.local/test-accounts/pro-owner-hosted.sql` to provision the same saved credentials via the confirmed hosted development database console. It creates only the dedicated tenant/account/stores, uses a password hash, preserves matching fixtures and refuses unrelated email collisions. Validated syntax/existing-fixture behavior with rollback on isolated PostgreSQL. Scoped Biome passed after approved retry for pnpm sandbox access.
- Previous targeted commerce run had GST success but was interrupted before non-GST completion (exit 1073807364). Resumed only non-GST acceptance. Restarted verified isolated PostgreSQL because it was offline after the interruption. Razorpay remains on hold and all provider integrations are disabled in the test helper.
- Resumed non-GST browser acceptance completed: 1 passed, zero retries, exit 0 (3.6-minute scenario); `.cache/pro-non-gst-final.log/.exit`. Verified purchases/stock, payment-reference recording, PDF receipt persistence/access denial, bounded sales and supplier returns, and product-image persistence. Expected over-return rejection was asserted successfully. Repeated Pro fixture check confirmed active owner/Pro with four stores after capacity testing.
- Restarted the isolated dev app on localhost:3000 for manual Pro-account use. Credentials remain in `.local/test-accounts/pro-owner.json`. Hosted access remains pending; private SQL handoff is ready and local validations passed. No live provider activity, hosted account modification, deployment or commit performed.
- Owner identified Neon and requested plugin access. Plugin search confirms Neon installed/enabled. Used its local Neon/Postgres skill instructions; the configured MCP server failed initialization with Auth required. Neon CLI/API-key authentication is unavailable. Asked owner to reconnect Neon specifically; Vercel reconnection alone does not authenticate Neon. Hosted SQL remains unapplied. Local Pro app is running; manual login endpoint check recorded separately.

## Neon reconnection follow-up — 14 October 2026

- Owner confirmed Neon reconnected. Retried the configured Neon MCP connection; initialization still fails with Auth required. No Neon SQL tools are exposed in the active task. No hosted database or account mutation occurred.
- Checked Codex MCP registration status without printing configurations/secrets: no standalone Neon registration was listed by the CLI; the enabled plugin's session connection remains the relevant path. Suggested reopening/restarting Codex to reload the plugin connection rather than asking the owner to share secrets again.
- Hosted provisioning remains pending authentication in a fresh session. Reuse the private canonical credentials and prepared SQL from the local Pro test report. Existing passing local Pro/commerce evidence is unchanged; no unnecessary test reruns performed.
- Owner requested another Neon retry. The configured MCP server again failed initialization with Auth required; no Neon tools became available and no hosted changes were made. Private SQL handoff remains ready for the confirmed hosted development database.
- Owner asked for exact Neon authentication steps. Checked installed `codex mcp add/login --help` and official Codex/Neon documentation. Created docs/release/NEON_CONNECTION.md with normal-user PowerShell registration, browser OAuth, verification and connection reload instructions. No authentication token was requested or printed; no new login flow launched by the agent.

## Neon access and hosted Pro account verified — 14 October 2026

- Neon tools became available. `list_projects` found `mybizoneapp` (silent-scene-72840763) with ADMIN access; branch list found existing production branch br-odd-tree-aomevkex; tables and required-column metadata matched MyBizOne. These are provider labels for the website the owner explicitly designated development/testing.
- Continued previously authorized hosted test-account setup. Verified pro.owner@example.com was absent, then applied the prepared SQL using Neon run_sql_transaction. Created only dedicated business/owner/credential/two stores/usage snapshot. SQL uses the same saved password hash and collision guards; no customer account overwrite, schema migration, deployment or Razorpay action.
- Database verification confirmed active, email-verified owner, Pro plan and two stores. Added scripts/verify-hosted-pro.mjs for actual website acceptance with the private credentials; it does not print passwords or sessions.
- Actual Chromium verification passed, exit 0: hosted login, Pro/three unlimited indicators, both stores and dashboard/products/employees/team/reports. Evidence .cache/hosted-pro-verification.json. Initial sandbox browser path failure was resolved by approved retry using installed browser. Scoped Biome passed after approved retry of sandbox pnpm access.
- Updated canonical ignored .local/test-accounts/pro-owner.json with hosted URL/project/branch and verification date while preserving the password. Updated local Pro report, release status and phase plan to supersede the old authentication blockers. Test SQL/credentials remain ignored. No broad test rerun or sale-readiness claim; payment/email and full delivery acceptance remain pending.

## Standard test-account instruction — 14 October 2026

- Owner instructed using the existing Pro account for all testing and verification. Saved the instruction, local/hosted URLs and canonical private credential location in docs/release/TEST_ACCOUNT.md, linked from current status and Pro evidence.
- Future authenticated product checks must reuse pro.owner@example.com and preserve its password/test data. Low-level regressions retain isolation; permission checks must not be weakened to substitute owner access for another role.
- Corrected a stale reuse paragraph that still said hosted access was unverified. No credentials, account records or application behavior changed; documentation-only update required no test rerun.

## Hosted performance optimization — 15 October 2026

Owner authorized optimization, Git push and hosted testing with the saved Pro account.
Pushed code commit `b01c3fbbbf8c10a8be52e5baed7e251a34abb273`; Vercel deployment
`dpl_2hMD2qbof8B5p3XjTivm49bP3LZq` reached READY at the requested public alias.
Moved functions from Virginia (`iad1`) to Singapore (`sin1`), matching the existing
Neon database. Reduced dashboard data SELECTs from 15 to 10, combined tenant
context setup, joined current roles, bounded catalog lists to 50 rows and deferred
analytics. No hosted schema migration or unrelated account change was made.

Validation: 133 isolated web tests + 17 DB tests passed; scoped Biome, TypeScript,
isolated production build and local production owner smoke passed. Hosted owner,
Pro/unlimited capacity, two stores, seven performance routes and pagination passed.
Three-load hosted medians: dashboard 12,686→552 ms, products 4,965→269 ms,
customers 5,252→517 ms, suppliers 4,795→510 ms, sales 6,455→506 ms,
new sale 7,682→531 ms, reports 6,491→544 ms. Dashboard median improved 95.6%.
The new-sale run included one 3,116 ms outlier; this is small-sample acceptance
measurement, not a production percentile or load-test claim. Compiled initial
JavaScript is about 50.6 KB smaller compressed. Full evidence and limitations:
[PERFORMANCE_OPTIMIZATION.md](docs/PERFORMANCE_OPTIMIZATION.md). Credentials stay private.

## Project status review — 15 October 2026

- Read current phase/status documents, local/hosted Pro evidence, latest work-log entries and committed performance report. Latest code commits include b01c3fb (performance) and 4229436 (its evidence). Confirmed saved test tooling/documentation remains uncommitted.
- Updated current status/phase-plan headlines with the deployed performance results and remaining provider, installer, complete cloud recovery and launch gates. Distinguished the verified hosted development site from complete cloud release acceptance and historical test totals from latest targeted validation.
- No application edits, new tests, deployment or external mutations performed for this status update. Razorpay remains on hold; standard Pro testing account remains the required login.

## Four-store hosted test seed — 15 October 2026

- Owner requested a realistic four-store test account with two furniture stores,
  electronics and utensils, departments, users/employees, hierarchy and products.
  Reused the saved Pro owner and confirmed hosted tenant in Neon project
  silent-scene-72840763, branch br-odd-tree-aomevkex. Preserved owner credentials.
- Renamed the two confirmed empty hosted placeholders into AR Furniture - Central
  and AR Furniture - North, preserving their IDs; added AR Electronics and
  AR Utensils. Each has 3 departments, 6 products and 7 employees. Added global
  admin, operations manager, accounts and marketing: 33 users including owner.
- Added 33 explicit grants across nine role types, including one cashier with
  billing + sales. Branch/staff grants are store-scoped; 12 floor managers have
  department scopes. The app has no reports-to field; private manifest/CSV records
  the sample reporting structure. Existing owner remains the application owner.
- Added 4 brands, 16 categories including parent/child structure, 6 customers,
  4 suppliers, prices/costs/MRP/wholesale tiers, SKUs/specs/opening stock and
  3 low-stock examples. Non-GST and no fabricated transaction history.
- Seed generator makes private SQL only, enforces fixture identity/collision and
  empty-placeholder guards, persists stable IDs/individual passwords before writes,
  and refreshes usage. Applied using one Neon transaction. Initial incorrect
  purchase store-column check rolled back; corrected tenant guard then succeeded.
  Reapplication succeeded with unchanged counts and no duplicate data. Database
  scope checks found zero mismatches; usage is 4 stores / 24 products / 33 users.
- Actual Chromium acceptance passed, exit 0: existing owner; all 32 new employee
  logins, authenticated sessions and dashboards; 27 checks covering data visibility,
  branch/inventory six-product store restrictions, sales/billing POS store selection
  and global-role routes. Evidence .cache/four-store-hosted-verification.json.
  Separate browser probe confirmed cross-store denial and the existing limitation
  that department-only floor managers cannot open the store-scoped product page.
  Evidence .cache/four-store-scope-probe.json. Preserved restricted grants.
- Scoped Biome and Node syntax checks passed. Updated the older hosted owner smoke
  to recognize expanded fixture store names. Private credentials, CSV and generated
  SQL are Git-ignored; no passwords/sessions printed. Handover and limits:
  docs/release/FOUR_STORE_TEST_DATA.md. Hosted data only; local fixture unchanged.
  No application deployment, commit/push, welcome mail or payment-provider action.

## Linked hosted transaction seed — 15 October 2026

- Owner requested additional bills/sales and other sample data in the four-store
  test account. Captured live stock/prices/balances and reused its fixture contacts,
  store employees and preserved owner login. Added 20 sales with non-GST receipt
  records, 4 estimates, 8 purchases, 4 customer collections, 4 supplier payments,
  4 sales returns, 4 supplier returns, 8 expenses, 4 quotations, 4 delivery challans,
  4 EMI plans/12 instalments, 4 damage logs and 6 tags/6 customer notes.
- Used existing domain calculators for discounts/free items and EMI principal.
  Applied record creation and corresponding stock/balance deltas in one guarded
  Neon transaction. All documents use separate DEMO prefixes; counters unchanged.
  Reapplied safely: counts, stock and balances unchanged. Reconciliation passed
  for source/line totals, stock movement ledgers, customer/supplier balances, EMI,
  and same-store product links, with no negative stock or balances.
- Bill-detail acceptance exposed an existing hosted schema mismatch; Vercel logs
  confirmed missing sales.gst_enabled_at_sale. Tested the existing migration 0021
  on temporary Neon branch br-old-rice-aog40tl0. Owner explicitly approved applying
  it and deleting the temporary branch. Applied through the migration tool, deleted
  the temporary branch and recorded 0021 in _migrations. Seed amounts and unrelated
  legacy transaction amounts were preserved; unknown legacy tax context stays null.
  Migration 0020 is still pending; no unrelated provider setup performed.
- Final hosted Chromium acceptance passed, exit 0: 22 checks of transaction lists,
  four store bill details, settlements, EMI lists/details and financial/stock reports.
  Scoped Biome and Node syntax checks passed. Private fixture/SQL files ignored.
  No PDFs generated, external payments/emails, deployment or commit/push.
  Evidence and seed details: docs/release/FOUR_STORE_TRANSACTIONS.md; private/cache
  evidence paths recorded there. Owner and staff credentials remain unchanged.

## Dashboard workspaces — 15 October 2026

- Implemented seven role-aware workspaces: Master, Store operations, Sales,
  Billing, Inventory, Accounts and Customer. Owner/admin can switch to every
  workspace and narrow supported views to a store or department. Multiple-role
  staff receive the relevant workspace union, with grants applied per view.
- Added date comparisons, daily activity, priorities, inventory movements, recent
  bills, business ledger and store comparison where permitted. Navigation follows
  destination permissions. Department-only activity restricts mixed bills to
  authorized lines and omits full bill identifiers/customer details and costs.
- Validation: 21 policy, isolated PostgreSQL and role-revocation tests passed;
  scoped Biome, TypeScript and isolated production build passed. Local browser
  acceptance passed 21 checks before publication.
- Published commit `8e16366be3ee98815845a9d874c78d166618b491` through the connected
  GitHub account after the automatic approval service recovered. Its Git tree
  exactly matches the tested local commit `5d3175f8a810f54625d969ea360c5f074e6b5a01`.
  Local main was aligned only after verifying tree equality and an empty index;
  unrelated workspace edits were preserved.
- Vercel deployment `dpl_2S6gYSwnZMqTrBSr3ySTeuLPnE4W` reached READY in `sin1`
  with `https://mybizoneapp.vercel.app` assigned. The hosted production build passed.
- All 21 hosted Chromium acceptance checks passed: all owner workspaces, actual
  store/department filter submission, nine staff role defaults, multi-role
  switching, restricted navigation and rejected unauthorized URLs. Owner, floor,
  inventory and customer layouts passed 360px overflow checks. Hosted screenshots
  were visually inspected, including department stock and receipt movements.
- Evidence: `.cache/dashboard-browser-hosted.json`, `.cache/dashboard-hosted-run.log`,
  `.cache/dashboard-screenshots/`, `.cache/dashboard-tests.log`,
  `.cache/dashboard-typecheck.log`, `.cache/dashboard-build.log`.
  Design/data rules: `docs/DASHBOARD_WORKSPACES.md`. No additional schema change,
  external payment, email or credential change was required.

## Business profiles and owner insights — Phase 1, 16 October 2026

- Added business-level industry/selling defaults and independent per-store
  overrides, onboarding fields and audited settings forms. Existing stores
  inherit. Profiles change dashboard priorities and stock review periods while
  preserving product prices, customer tiers, transactions and role permissions.
- Added top product gross-profit bars, per-store slow-stock reviews, explicitly
  approximate stock-cover estimates and store comparisons with previous-period
  sales, gross profit and margins. Missing cost snapshots withhold product/store
  profit; returns and free-item costs are included. Department/inventory payloads
  omit financial values. Roadmap: docs/BUSINESS_PROFILES_AND_INSIGHTS.md.
- Validation passed: 28 policy/database/authenticated-action tests, scoped Biome,
  TypeScript, isolated production build, seven profile browser checks and all
  21 existing owner/staff workspace checks. Owner and department layouts were
  visually inspected at 360px. The local account preserves older test stores.
- Tested additive migration 0022 on Neon branch br-shy-smoke-aogxemq6. The owner
  explicitly approved applying it and publishing Phase 1. Applied through the
  Neon migration tool (b1ea920b-9a51-4406-be0d-9e382052d5f4), removed its temporary
  branch and recorded 0022 in _migrations. Preserved 26 sales / 370300 total,
  34 products / 1172.250 stock units, customer/supplier balances and 34 grants.
  Migration 0020 remains unrelated and was not applied to the hosted database.
- Published commit b1b8e2ecf52a11f736f972d16d9c650447fc2300, identical source tree
  to tested local commit 3846cf246f70029bada767506060ae68fac1d693. Main was aligned
  after tree/index checks. Unrelated existing workspace edits were preserved.
- Hosted build/acceptance is in progress for deployment
  dpl_6rVLBhB4YfxL9PCruKDb9B4UfP4i. No external payment or email was performed;
  saved account passwords remain unchanged.
- Hosted acceptance caught an unrelated existing-schema dependency in three new
  profile pages: selecting all business fields included subscription columns from
  pending migration 0020. Narrowed these pages to their two required profile fields
  and verified the query on hosted data; TypeScript/scoped Biome passed. Published
  fix 94323c055af1ff817a7257bb25e46feafc215dae (local source 1bc2356), with the same
  Git tree verified. Migration 0020 remains unapplied. The browser runner now waits
  for the streamed settings form before checking options.
- Final deployment dpl_3gRjMDU5iLEuqQpf9S7pTJPum71a reached READY with the public
  alias https://mybizoneapp.vercel.app and commit 94323c0. All seven new hosted
  profile checks and all 21 existing workspace checks passed, exit 0. Browser
  saves proved independent inheritance, preserved explicit overrides and restored
  final demo defaults to general retail / retail. Both furniture stores now use
  furniture profiles, electronics uses electronics and utensils general retail;
  selling models inherit. Hosted owner/department screenshots were inspected.
  Evidence: .cache/business-profiles-browser-hosted.json,
  .cache/business-profiles-browser-hosted.log,
  .cache/business-profiles-workspace-hosted-regression.log,
  .cache/business-profile-screenshots/. Phase 2 operating analysis and Phase 3
  specialised workflows remain planned as documented; they are not claimed shipped.

## Operating analysis — Phase 2, 16 October 2026

- Added /dashboard/analysis for daily sales/profit trends, normalized day/hour
  heatmaps, bill drill-downs, current collection priorities and separate product
  breakdowns for discounts, free items, returns and damage. Each non-marketing
  workspace preserves its existing scope and permissions; inventory and department
  views omit financial costs/profit/shared balances. Owners retain all role views.
- Corrected dashboard/product/store gross profit and margins to exclude GST,
  preserving tax-inclusive billed-sales totals. Free costs and returned costs are
  included; missing cost snapshots yield unavailable profit and chart gaps.
  The isolated GST fixture reconciles with the existing independent P&L report.
- Collection actions preselect a tenant-validated customer on the existing
  settlement form; tests never submit payments. Rankings use current shared
  customer balances, not invented invoice ageing. Discounts/free retail values,
  returned billed value and damage cost stay separate measures.
- Added shared scoped query helpers; the initial dashboard query count is
  unchanged. Detailed analytics load only on their dedicated page, with bounded
  rows. No schema migration, dependency/provider setup, real payment or email.
- All 39 focused policy/profile/database/auth tests passed. The eight new analysis
  database tests were rerun after adding P&L reconciliation. TypeScript, scoped
  Biome and final isolated production build passed. All 20 new analysis browser
  checks and 21 existing workspace browser checks passed locally; owner, accounts,
  inventory and department layouts were inspected at 360px.
- Browser acceptance caught a stalled client-router time drill-down; native links
  fixed it. An extra JavaScript-disabled check confirmed the existing streamed
  loading boundary cannot finish rendering without JavaScript. The observation
  is retained separately and the docs no longer claim full no-JavaScript support.
  Mobile assertions wait for screenshot/layout stabilization after chart resizing.
- Published commit 73a5a86d327b55be675638e6799601176f348e70 with the verified source
  tree from local commit 81e7343f3a034480336719710175a67db5198699. Local main was
  aligned after tree/index checks and unrelated work was preserved. Vercel build
  dpl_Gr7hGEeqQWTqwxZHh2eJ1m7Bfxtu is in progress; hosted acceptance follows.
- Rules and evidence: docs/OPERATING_ANALYSIS.md, .cache/operating-analysis-tests.log,
  .cache/operating-analysis-report-tests.log, .cache/operating-analysis-build.log,
  .cache/operating-analysis-browser-local.json,
  .cache/operating-analysis-workspace-local.log,
  .cache/operating-analysis-nojs-observation.json,
  .cache/operating-analysis-screenshots/. Credentials and cookies remain private.
- The first hosted build reached READY with the public alias and passed all 20
  new analysis checks. Early hosted staff-login attempts hit ECONNRESET and
  Chromium ERR_NETWORK_CHANGED. Added a test-only helper permitting two retries
  for those specific transport errors; HTTP failures/assertions are not retried.
  The successful 20-check hosted run needed zero retries. Its owner screenshot
  was visually inspected. No financial entries were submitted.
- An existing workspace mobile check measured before Recharts completed resize.
  Added chart containment to prevent transient page overflow and standardized
  screenshot/layout stabilization before mobile assertions in both runners.
  Scoped Biome and TypeScript passed. Published final hardening commit
  58508dcf08fb9801d3c5ba4eaa4261139d2135e2 (same tree as local f1bd86d). The only
  application change in that follow-up is the chart container's overflow class;
  calculation/permission queries are unchanged. Final build/hosted acceptance
  follows at dpl_62uoUYQvnqA2PstBKExiEQUhWHTK.
- Final deployment dpl_62uoUYQvnqA2PstBKExiEQUhWHTK reached READY with commit
  58508dcf08fb9801d3c5ba4eaa4261139d2135e2 and the public alias
  https://mybizoneapp.vercel.app. All 20 operating-analysis checks and all 21
  existing workspace checks passed on this deployment, exit 0 and zero transport
  retries in both successful final runs. Hosted screenshots were visually reviewed.
  Evidence: .cache/operating-analysis-browser-hosted.json,
  .cache/operating-analysis-browser-hosted.log,
  .cache/operating-analysis-workspace-hosted.log,
  .cache/operating-analysis-hosted-network-observation.log. No financial entry,
  external payment, email, schema migration or saved-password change was made.
  Phase 2 is complete; Phase 3 specialised workflows remain separately planned.

### Phase 3a — optional batch stock, expiry and FEFO (16 October 2026)

- Implemented optional per-product batch activation with exact physical-stock
  reconciliation; existing products stay untracked. Grocery and mixed retailers
  can opt in without changing industry profiles or inventing expiry dates.
- Connected purchases, FEFO checkout (including free items), customer-return
  quarantine, supplier returns and exact-lot damage. Estimates remain stock-neutral.
  Inspection release/recall quarantine writes audit notes and preserves physical
  quantity. Known expiry/code metadata cannot be extended to release expired lots.
- Added Batches & expiry register, inspection forms, bill allocation trace and
  scoped expiry/quarantine dashboard alerts. No costs are added to nonfinancial
  alert payloads. Global inventory destination access follows the existing damage
  permission boundary; department/store viewers retain scoped dashboard visibility.
- Product locks serialize activation, review and stock changes. The batch helper
  reloads tracking after the aggregate stock update and rejects drift atomically.
  Product edits cannot change tracked units/store/quantity; tracked products stay
  active to keep physical lots and historical return workflows manageable.
- 80 automated tests passed across nine suites. Includes 19 batch integration and
  three batch-policy tests, plus existing transaction, profile, workspace,
  operating-analysis and authenticated-security regressions. Evidence:
  .cache/stock-batches-regression-verified.log. Test cleanup was corrected for the
  existing restrictive department/store foreign keys; all final fixture cleanup
  passed. No hosted mutation fixtures were used.
- Migration 0023 prepared successfully on Neon branch br-mute-shadow-aomxqost,
  parent br-odd-tree-aomevkex, migration e9a3f3f5-5002-4040-be30-1769ef7cbd89.
  Row digests matched across all 13 checked product, document, balance and grant
  tables. Preserved 34 products / 1172.250 units, 26 sales / 370300.00, eight
  purchases / 768160.00, return totals 18660.00 and 37700.00, customer balance
  24860.00, supplier balance 346380.00, and 34 grants. Both new tables force RLS;
  cross-tenant composite keys and sign/expiry checks exist; app_user cannot update
  or delete movements or delete batches. All products remain disabled and the new
  tables empty on the copied branch. Hosted application awaits explicit approval
  required by the Neon completion tool. Prepared context is saved privately in
  .local/test-accounts/pending-stock-batches-migration.json. Do not apply unrelated
  pending migration 0020.
- The first production-browser run found a stale register after successful
  activation: the transaction saved correctly but client-router refresh retained
  the old empty result. Native GET navigation after activation and reload after
  review replace that transition. The runner was also corrected to follow the
  existing POS redirect to /sales before opening the saved bill's detail page.
  Final production/browser verification follows below.
- Final acceptance completed 17 October 2026: 12 new production-browser checks
  passed, plus the 20 operating-analysis and 21 workspace regressions (zero
  transport retries). The saved fixture reconciled to 1.750 kg in product, lot
  and movement totals and was removed after checking. Staff checks confirm global
  admin management, store-inventory dashboard alerts without global mutation
  navigation, and sales/department boundaries. The browser runner's initial
  inventory-navigation expectation was corrected to respect that seeded user's
  actual store scope; permissions were not expanded to satisfy the test.
- Visual review caught a narrow mobile product filter despite no page overflow.
  Replaced its phone flex layout with a full-width grid, made status cards two
  columns and added a minimum readable filter-width assertion. The final isolated
  production build passed, as did all 12 browser checks against that build. Owner
  register, admin register, scoped inventory and supplier-return layouts were
  inspected at 360px. Scoped Biome passed without errors (existing/non-null
  assertion warnings remain). No additional calculation changes followed the
  successful 80-test run.
- Evidence: .cache/stock-batches-build-mobile.log,
  .cache/stock-batches-browser-mobile-final.log,
  .cache/stock-batches-browser-local.json,
  .cache/stock-batches-operating-regression.log,
  .cache/stock-batches-workspace-regression.log,
  .cache/stock-batches-lint-complete.log,
  .cache/stock-batches-screenshots/. Hosted schema and public deployment remain
  unchanged until the user approves the tested migration and publication.
- The owner subsequently approved "Apply migration and publish Phase 3a".
  Applied prepared migration e9a3f3f5-5002-4040-be30-1769ef7cbd89 through Neon's
  completion tool on 17 October 2026. The tool removed br-mute-shadow-aomxqost.
  All 13 before/after row hashes matched; recorded 0023_stock_batches.sql in
  _migrations. Both new tables force RLS, movement update/delete rights are absent,
  existing product tracking remains disabled and migration 0020 remains pending.
- Published commit 985ed567442eabcdadb21f45d62b7a975d7763e6 with tree
  3ff0d12a194e50326145af87fa6e7671258cd736, verified identical to the reviewed local
  source plus two documentation status updates. Vercel deployment
  dpl_86UWZ6PTZsCCg3RqC6phU3r2y4S8 is building. Local main was aligned to the
  identical remote tree with guarded update-ref; unrelated workspace changes
  remain unstaged. Hosted acceptance follows below.
- Final deployment dpl_86UWZ6PTZsCCg3RqC6phU3r2y4S8 reached READY, and the public
  mybizoneapp.vercel.app alias resolves to commit
  985ed567442eabcdadb21f45d62b7a975d7763e6. All 72 hosted browser checks passed:
  nine live-register/form/scope checks, 21 workspace checks, 20 operating-analysis
  checks and 22 seeded transaction/bill/report checks. All four runners exited 0;
  the three runners with transport retry counters reported zero retries.
- Hosted review confirmed readable 360px filters and expanded reconciliation
  fields. No opening lot or financial form was saved. The register check opens
  the Inventory menu explicitly before checking its management link; an earlier
  assertion incorrectly expected a closed dropdown's link to be in the DOM (the
  local populated dashboard also has a separate review link). No application or
  permission change was needed. After all checks, the 13 financial/inventory/grant
  row hashes still exactly matched the pre-migration baseline.
- Hosted evidence: .cache/stock-batches-register-hosted-final.log,
  .cache/stock-batches-browser-hosted.json,
  .cache/stock-batches-workspaces-hosted.log,
  .cache/stock-batches-analysis-hosted.log,
  .cache/stock-batches-transactions-hosted.log,
  .cache/stock-batches-hosted-screenshots/. Phase 3a is published and complete.
  Subsequent specialised workflows remain separate deliveries.

## 17 October 2026 — feature Phase 3b candidate: serials and recorded warranties

- User approved proceeding after the project-status/documentation review. Saved
  the consolidated status, roadmap, work log and test-data/admin notes in local
  documentation commit 8bc6ac6a3edac197dd15740ffa295f8ce2cb409b. This commit has
  not been published independently. Unrelated test-account/tunnel tooling remains
  unstaged, and the hosted application is still Phase 3a commit 985ed567.
- Implemented optional piece/pc serial reconciliation, normalized business-wide
  serial uniqueness, exact-unit purchases/checkout, partial customer return
  quarantine, audited hold/release, original-receipt supplier returns and damage.
  Product and unit locks protect concurrent stock changes; count drift, wrong
  serials and duplicate returns roll back their complete financial transaction.
  Free units consume serials; estimates do not. Batch/serial tracking is exclusive.
- Added serial inventory filters/history, future warranty settings, original web
  bill snapshots, scoped warranty lookup and dashboard inspection priorities.
  Warranty defaults are copied at sale time and do not rewrite old records.
  Return/resale preserves separate sale histories. Historical returns may register
  unknown serials in quarantine without inventing a past warranty. PDF serial
  printing, claims/repairs and serial-level costing are not part of this phase.
- 110 unique automated tests passed across 11 suites. The first regression run
  collected 98 tests, with a stale navigation expectation failing and an older
  mutation suite failing to import React cache. Updated the warranty navigation
  expectation and supplied an identity cache mock in that test harness; the two
  corrected suites passed all 21 tests (nine dashboard and 12 mutation security).
  The other nine suites passed 89 tests, including serial policy/transactions,
  batch stock, transaction actions, profiles and operating analysis. Production
  permission checks were not relaxed. Evidence: .cache/stock-serials-tests.log,
  .cache/stock-serials-regression.log,
  .cache/stock-serials-regression-recheck.log,
  .cache/stock-serials-automated-verification.json.
- Migration 0024 prepared on br-super-bread-aocfknpv, parent br-odd-tree-aomevkex,
  migration a42cb41b-3884-445d-88d1-99bdb2dfef9d. All 13 existing table hashes
  match the parent. Existing 34 products retain tracking disabled and no warranty;
  new tables are empty. Stock 1172.250, sales 370300.00, purchases 768160.00,
  customer balance 24860.00, supplier balance 346380.00 and all 34 role grants
  remain preserved. Verified tenant composite keys, state/term checks, forced RLS,
  no unit-delete grant and no event-update/delete grant. Exact prepared context is
  privately saved in .local/test-accounts/pending-stock-serials-migration.json;
  evidence is .cache/stock-serials-migration-validation.json. Do not apply unrelated
  pending migration 0020. Hosted application of 0024 requires explicit approval
  after local acceptance, as required by Neon's migration completion tool.
- Initial isolated production build passed. Browser preflight passed 16 serial
  workflow/access checks, 12 batch/expiry checks, 21 workspace checks and 20
  operating-analysis checks. The serial fixture covers receipt, two-unit sale,
  partial return, quarantine, inspection, changed future terms, resale, supplier
  return and damage, reconciling physical stock to zero and preserving 11 serial
  events. Temporary fixtures were removed. Dashboard and analysis runners had
  zero transport retries. Streamed pages and native form reloads now have explicit
  browser waits; an unrelated disabled activation button is not a save-completion
  signal. These were test synchronization corrections.
- Visual preflight found cramped serial entry inside the horizontally scrolling
  checkout table. Moved each product's serial entry to a full-width fieldset below
  that table. The final rebuild and acceptance use a minimum readable field-width
  assertion; preflight's earlier narrow field is not final-layout evidence.
  Final results, local commit and hosted rollout state will be recorded below.
- Final isolated production build passed: .cache/stock-serials-build-final.log.
  All 16 serial workflow and access checks passed against that build, with the
  readable full-width checkout fields and loaded unit register visually inspected
  at 360px. The final register screenshot waits for actual unit cards, replacing
  an early screenshot of a loading placeholder. Read-only rollout runner passed
  ten more checks with zero transport retries; no existing product was activated.
  Rechecked the 12 existing batch browser checks against the final shared cart.
  Together with unchanged workspace/analysis code's 21 + 20 passed checks, local
  browser acceptance totals 79. All temporary mutation fixtures were cleaned up.
- Scoped Biome passed 41 changed TypeScript files with no errors/fixes and 13
  non-null assertion warnings. Both acceptance runners passed their scoped lint.
  Restored generated next-env.d.ts/tsconfig build-directory changes before commit.
  Evidence: .cache/stock-serials-browser-final.log,
  .cache/stock-serials-browser-local.json,
  .cache/stock-serials-register-local.log,
  .cache/stock-serials-register-local.json,
  .cache/stock-serials-batch-regression-final.log,
  .cache/stock-serials-workspace-regression.log,
  .cache/stock-serials-analysis-regression.log,
  .cache/stock-serials-lint-complete.log,
  .cache/stock-serials-screenshots/ and register-local screenshots.
  The feature and evidence are saved in a local candidate commit. Hosted schema,
  migration ledger and deployment remain unchanged pending explicit approval of
  migration 0024, temporary-branch cleanup and publication. Hosted acceptance must
  follow publication; these local results do not claim it has already passed.
- Owner approved "Apply migration and publish Phase 3b". Applied prepared migration
  a42cb41b-3884-445d-88d1-99bdb2dfef9d through Neon's completion tool. The tool
  removed br-super-bread-aocfknpv; branch listing confirms removal. All 13 fresh
  hosted before/after row hashes match, existing tracking defaults are unchanged,
  and both new tables retain forced RLS and narrow grants. Recorded only
  0024_stock_serials.sql in _migrations. Unrelated migration 0020 remains pending.
  Application publication and hosted acceptance follow.
- Published application commit 62e3ca5bdf983e0a7c06dfdcc82f4a8d8c76b16a with tree
  1479630512290aa86b9a339b109790f2f76e30b0, verified identical to reviewed local
  candidate b14727c (feature plus documentation/migration-status updates). This
  also publishes the earlier consolidated status, work log, admin notes and
  test-data reports. Local main was aligned using guarded update-ref after
  fetching and confirming identical trees; unrelated unstaged changes remain.
- Vercel deployment dpl_H8ANzvuiPo4jMfzrnzGM8SMFwYDa reached READY, and the public
  mybizoneapp.vercel.app alias resolved to commit 62e3ca5b. All 82 hosted browser
  checks passed: 10 serial/register, nine batch, 21 workspace, 20 operating-analysis
  and 22 seeded transaction/bill/report checks. All five runners exited 0. The
  four runners with transport retry counters reported zero retries. Hosted phone
  reconciliation and warranty layouts were inspected at 360px. No stock activation
  or financial form was submitted. All 13 checked row hashes still match the fresh
  pre-migration baseline after all hosted acceptance.
- Evidence: .cache/stock-serials-hosted-preapply.json,
  .cache/stock-serials-hosted-migration-applied.json,
  .cache/stock-serials-hosted-final-hashes.json,
  .cache/stock-serials-hosted-acceptance.json,
  .cache/stock-serials-register-hosted.log,
  .cache/stock-serials-workspaces-hosted.log,
  .cache/stock-serials-analysis-hosted.log,
  .cache/stock-serials-transactions-hosted.log,
  .cache/stock-serials-batches-hosted.log and register-hosted screenshots.
  Phase 3b is published and complete within its documented scope. The final
  documentation-only follow-up records this acceptance without changing tested
  application code. Furniture orders/advances/delivery are the next planned
  feature phase; commercial delivery/launch gates remain separate and open.

## 17 October 2026 — feature Phase 3c candidate: customer orders and advances

- Continued the owner's approved phased roadmap with a complete order workflow,
  useful for furniture and available independently of the business profile.
  Added Billing → Customer orders: customer/store agreement, promised handover,
  address, immutable item/price/GST snapshots, partial handovers and source-bill
  links. Booking leaves stock, sales revenue and customer debt unchanged.
- Physical handover creates a normal bill and consumes stock exactly once using
  existing batch/expiry and serial/warranty paths. Cumulative integer rounding
  preserves the agreement across partial GST deliveries; current cost is captured
  at handover. Changed store/unit/activity or GST identity prevents unsafe billing.
- Append-only receipts/refunds and signed allocation entries pay only this order's
  bills. Unused funds are advance liabilities; delivered unpaid value enters the
  shared customer balance. Legacy general settlements exclude order debt as well
  as reserved EMI principal. Existing invoice backfill/cashbook limits remain.
- Order-linked returns lock the order before the bill, clear its exact unpaid
  value, and reapply released funds to other unpaid bills of that same order.
  Remaining released funds stay held until an explicit actual refund is recorded.
  Cancellation closes only undelivered quantities and requires held funds refunded
  first; delivered bills/debt survive. Returns do not reopen replacement quantity.
- Added scoped dashboard handover priorities and separate period receipts/refunds,
  advances held and delivered bills due. Nonfinancial/department views omit money
  and customer details. Due-bill reports show exact allocated order remainder,
  while clearly identifying the unreconciled general-bill values. Management
  balance sheet includes held advances; date cutoffs use India calendar boundaries.
- Enforced store/report reads, global sales mutations and global finance plus
  order-read permission for receipts/refunds. Database FORCE RLS and composite
  foreign keys bind tenant/store/customer/order/delivery ownership. Column grants
  protect agreed prices; payment/allocation history cannot be updated or deleted.
  Customer deletion gives a clear history guard even when receivable debt is zero.
- Request UUIDs/fingerprints and order/advisory locks make competing/repeated
  commands safe. Browser preflight fixed form readiness and visible quantity
  submission, so slow client loading cannot send an accidental native GET or omit
  a displayed quantity. Forms retain request IDs on uncertain save retries.
- 137 automated tests across 13 focused suites passed, zero skipped/failed:
  order policy/integration, stock batch/serial policy/integration, transaction
  actions, dashboard policy/integration, business profiles, operating analysis
  policy/integration and security mutation regressions. Scoped Biome passed with
  three non-null assertion warnings in returns; both new acceptance scripts passed
  Biome. All 19 development-browser workflow checks passed. The isolated production
  build (including TypeScript) passed, exit 0. All **108 production-browser checks**
  passed: 19 order workflow, 10 read-only order/register, 12 batch workflow, 16
  serial workflow, 10 serial/register, 21 dashboard workspaces and 20 operating
  analysis. All seven runners exited 0; read-only transport retry counts were zero.
  A new register test's ambiguous text locator was narrowed to the metric term;
  the source build was unchanged and passed suites were retained. Phone layouts
  were visually inspected at 360px. These are local candidate results, not rollout.
- Prepared migration 0025 on Neon temporary branch `br-bold-sea-ao7nfopd`, parent
  `br-odd-tree-aomevkex`, migration `a9cba0a9-41fd-47fe-8b85-957f0148ec0f`.
  All 19 checked existing tables have identical row counts/hashes on parent/copy;
  six new tables are empty, tenant policies/column grants/composite keys passed.
  Durable pending context is ignored `.local/test-accounts/pending-customer-orders-migration.json`.
  **Hosted migration, branch deletion and publication remain unapplied/unapproved.**
  Neon's completion tool requires explicit approval after final local acceptance.
- Evidence: `.cache/customer-orders-regression-final.log`,
  `.cache/customer-orders-lint.log`, `.cache/customer-orders-script-lint.log`,
  `.cache/customer-orders-browser-preflight6.log`,
  `.cache/customer-orders-migration-validation.json`,
  `.cache/customer-orders-migration-foreign-keys.json` and local phone screenshots.
  Final evidence: `.cache/customer-orders-build.log`,
  `.cache/customer-orders-production-acceptance.json` and seven individual
  `.cache/customer-orders-production-*.log` runner logs. Generated Next build
  configuration was restored; unrelated work remains unstaged. The accepted
  37-file candidate will be committed locally and await explicit migration and
  publication approval before any hosted change.
  Feature scope: `docs/CUSTOMER_ORDERS_AND_ADVANCES.md`; current roadmap:
  `docs/PROJECT_STATUS.md`. Preexisting unrelated changes remain outside this phase.
- Owner approved "Apply migration and publish Phase 3c". Applied prepared migration
  `a9cba0a9-41fd-47fe-8b85-957f0148ec0f` to `br-odd-tree-aomevkex` and recorded only
  `0025_customer_orders.sql` in `_migrations`. Temporary branch `br-bold-sea-ao7nfopd`
  was removed by the completion tool. All 19 fresh pre-migration table hashes
  match after application; six tables retain FORCE RLS and narrow grants.
  Unrelated subscription migration 0020 remains pending. Accepted local feature
  commit `a0515d044a51cb43af51284276ba86055b738cc6` is unchanged apart from this
  documentation follow-up. Publication and hosted acceptance follow.
- Published application commit `4ef78ec84b6f9909308a9416402f87b3828048aa`, tree
  `01035831528a7a106ffa5a490255327f78856a50`, identical to local feature plus
  migration-status documentation commit `b810fef21a803db2ae0af0b2179ce6e2a25eb28e`.
  Guarded GitHub ref update and read-only fetch/tree comparison passed; local main
  was aligned without modifying unrelated working files. Vercel deployment
  `dpl_E1xh2C2CzKscMwberF36GYfKHTE7` is READY and its public alias resolves to that SHA.
- All **92 hosted browser checks passed**: 10 order/register, 10 serial/register,
  nine batch, 21 dashboard workspace, 20 operating-analysis and 22 seeded
  transaction/bill/report checks. All six runners exited 0; the five with transport
  counters reported zero retries. Hosted phone order forms/registers were visually
  inspected at 360px. No financial/inventory form was saved. All six new order
  tables remain empty, and all 19 checked table hashes still match the fresh
  pre-migration baseline after acceptance. Existing stock, transactions, balances
  and role grants are preserved.
- Final hosted evidence: `.cache/customer-orders-hosted-preapply.json`,
  `.cache/customer-orders-hosted-migration-applied.json`,
  `.cache/customer-orders-hosted-schema-checks.json`,
  `.cache/customer-orders-hosted-final-hashes.json`,
  `.cache/customer-orders-hosted-acceptance.json` and six
  `.cache/customer-orders-hosted-*.log` runner logs. Phase 3c is published and
  complete within its documented scope. The final documentation-only follow-up
  records acceptance without changing tested application code. Wholesale
  packs/units/credit/fulfilment is the next product phase; commercial launch gates
  remain separate and open.
