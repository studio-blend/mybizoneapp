# S1 / S4 stabilization evidence — 18 September 2026

Scope is S1 and S4 only, on the pre-existing uncommitted release working tree. No release, packaging, payment activation or customer database operation was performed. No graph tools were available to satisfy the ancestor AGENTS.md preference; targeted source inspection was used instead.

**Final result: S1 and S4 complete.** The continuation below records the successful administrator production build and fresh targeted checks. Earlier failed attempts are retained as history, not current blockers.

## Changes

- Damage handling captures the product row returned by the guarded UPDATE. The stock predicate remains in SQL inside `safeAction`'s tenant transaction; an empty result throws and rolls back the preceding damage insert. Corrected the stale comment that claimed negative stock was allowed.
- Added real PostgreSQL regressions for excessive damage (unchanged stock, no damage/audit rows) and two concurrent requests for the final unit (one success, zero remaining stock, one damage/audit pair).
- Added `test:damage` to the isolated release helper so these checks run with fixed disposable database and integration settings.
- Fixed the five lint errors by formatting only the four reported files and organizing the transaction test imports: invoice action, sale action, sales schema, transaction tests. Existing tax snapshot behavior was preserved. No validation or lint rule was disabled.
- Updated the direct database development dependency `tsx` from 4.19.2 to pinned 4.20.5 and regenerated the lockfile, removing its esbuild 0.23.1 path. No broad dependency update was performed.
- Completed the Sentry/Next API migration surfaced by the build: exported `onRequestError = captureRequestError`, replaced obsolete `hideSourceMaps` / `dryRun` options with the installed SDK's `sourcemaps.disable` and `deleteSourcemapsAfterUpload`. Source-map functionality requires both a DSN and upload token. Checked the installed SDK declarations; online manual retrieval failed, so it was not used as evidence.

## Dependency advisory assessment

The [esbuild maintainer advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) affects versions through 0.24.2; 0.25.0 fixes permissive CORS in esbuild's serve feature. A malicious website could read files served by that development server, including on loopback. Merely using esbuild to transform code does not establish that exposure.

The old production-audit path was `web / auth-config -> better-auth 1.6.33 -> vitest 4.1.11 (peer) -> vite 6.4.3 -> tsx 4.19.2 (peer) -> esbuild 0.23.1`. The direct source of tsx was `packages/db`'s development dependency. Updated tsx uses esbuild 0.25.x; the final production audit reports zero advisories. Vite itself resolves esbuild 0.25.12.

The full audit still reports two moderate esbuild findings in development tooling:

- `packages/db -> drizzle-kit 0.28.1 -> esbuild 0.19.12` (also its `esbuild-register 3.6.0` peer).
- `packages/db -> drizzle-kit 0.28.1 -> @esbuild-kit/esm-loader 2.6.5 -> @esbuild-kit/core-utils 3.3.2 -> esbuild 0.18.20`.

Repository scripts use Next for development/production serving, tsx for seed/license execution, and a plain Node/Postgres migration runner. Source inspection found no application use of esbuild serve and no matching serve invocation in the installed Drizzle CLI. This is a bounded exposure assessment, not proof that every optional tool mode is safe. **Outstanding decision:** separately upgrade and validate Drizzle Kit's generate/push/studio workflows before declaring the development toolchain advisory-free; do not force a cross-major esbuild override into old loaders without compatibility evidence. Do not expose an esbuild development server while those copies remain.

The fresh full audit also reports one unrelated low advisory, `postcss-selector-parser 6.1.2`, through Tailwind 3.4.14 / postcss-nested 6.2.0 (including config/UI consumers). [Maintainer advisory GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92) is recorded for the next dependency follow-up. No claim of a clean full audit is made.

## Check record

Commands below ran from the repository root. Logs are under ignored `.cache/s1-s4-*`; this report preserves their material results. Elevated retries were used for Windows process/network restrictions. No ordinary dotenv-backed root database test command was used.

| Command | Result |
| --- | --- |
| `pnpm lint` (initial) | Failed: 5 errors, 44 warnings. |
| `pnpm exec biome check . --diagnostic-level=error --max-diagnostics=30` | Failed: same 5 errors; isolated their four files. |
| `node scripts/release-check.mjs typecheck` (sandbox) | Failed before checking: Windows `spawn EPERM`. |
| `pnpm exec biome check --write 'apps/web/app/(app)/invoices/actions.ts' 'apps/web/app/(app)/sales/actions.ts' packages/db/src/schema/sales.ts apps/web/tests/integration/transaction-actions.test.ts scripts/release-check.mjs` | Passed; 5 files fixed, 9 existing warnings in selected files. |
| `node scripts/release-check.mjs typecheck` (elevated, after source fixes) | Passed all 8 workspace package checks. |
| `.cache/postgres/pgsql/bin/pg_ctl.exe status -D .cache/test-pgdata` | Sandbox incorrectly reported no running server; elevated check confirmed PID 15268 and loopback port 55432. |
| `.cache/postgres/pgsql/bin/pg_ctl.exe start -D .cache/test-pgdata -l .cache/s1-s4-postgres.log -w` | Failed because that cluster was already running; no lock files removed. |
| `.cache/postgres/pgsql/bin/psql.exe -h 127.0.0.1 -p 55432 -U postgres -d mybizone_release_test -c 'SHOW data_directory;'` | Passed; verified this repository's `.cache/test-pgdata` before test writes. |
| `node scripts/release-check.mjs test:damage` (first helper version) | Failed overall: 4 passed / 5 failed. pnpm consumed `-t damage`, so all 9 transaction tests ran. Both damage cases passed. Invoice, closing-stock, sales-return, EMI and sale-concurrency cases failed because disposable schema lacks migration 0021 (`gst_enabled_at_sale`). These remain S2 work. |
| `pnpm view tsx@4.20.5 dependencies --json` | Passed; verified esbuild `~0.25.0` dependency. |
| `pnpm --filter @mybizone/db add -D tsx@4.20.5 --store-dir D:/.pnpm-store` | Passed. |
| `pnpm install --frozen-lockfile --store-dir D:/.pnpm-store` | Passed; resolution skipped, lockfile up to date. This validates current-environment reproducibility, not a clean-machine installation. |
| `node scripts/release-check.mjs test:damage` (corrected helper, after install) | Passed: 2 passed, 7 intentionally filtered/skipped. Uses `pnpm --filter @mybizone/web exec vitest run tests/integration/transaction-actions.test.ts --testNamePattern=damage`. |
| `pnpm audit --json` (before / after) | Advisory exit status: full audit changed from 3 moderate + 1 low to 2 moderate + 1 low; zero high/critical. |
| `pnpm audit --prod --json` (after) | Passed, zero advisories. |
| `pnpm -r why esbuild` | Passed; captured before/after paths. |
| `pnpm --filter @mybizone/db exec tsx --version` | Passed; upgraded runner starts on Node 22.13.1. |
| `pnpm lint` (final) | Passed, 0 errors and 44 existing warnings. Warnings were not suppressed or reclassified. |
| `pnpm exec biome check apps/web/instrumentation.ts apps/web/next.config.mjs scripts/release-check.mjs` | Passed, 3 files, no fixes or diagnostics. |
| `git diff --check` | Passed. |
| `node scripts/release-check.mjs typecheck` (final, post-install and Sentry edits) | Passed all 8 workspace packages. |
| `node scripts/release-check.mjs build` | Failed, exit 1: compilation, type validation and 17 static pages passed, then standalone copying failed on Windows directory symlinks (`EPERM`), even outside the sandbox. The build used the pre-follow-up Sentry configuration. The follow-up hook/config edits passed final lint/types, but production rebuilding is blocked by the same confirmed prerequisite. |

The final elevated capability probe also failed with `EPERM` and cleaned up its temporary workspace directory:

```powershell
node -e 'const fs=require("node:fs"),path=require("node:path");const dir=fs.mkdtempSync(path.join(process.cwd(),".cache/s1-s4-symlink-probe-"));const target=path.join(dir,"target"),link=path.join(dir,"link");fs.mkdirSync(target);try{fs.symlinkSync(target,link,"dir");console.log("directory symlink supported");fs.unlinkSync(link);}catch(e){console.error(e.code+": directory symlink creation denied");process.exitCode=1;}finally{fs.rmdirSync(target);fs.rmdirSync(dir);}'
```

**Initial S4 build prerequisite:** a Windows process allowed to create directory symbolic links (appropriate OS privilege / Developer Mode) or a suitable Linux build environment. The first session stopped after confirming the restriction. See the continuation below for the administrator-process resolution; no system security setting was changed, build error hidden, or standalone output disabled.

Not run: migration 0021, full-suite rerun after installation, browser acceptance, Drizzle generate/push/studio, packaging, deployment. S2/S3/S5 and integrated release acceptance remain open. The five unrelated transaction failures above must not be represented as passing.

## Continuation — Windows build capability

The user requested completion after the initial blocked handoff. Inspection with `whoami /priv`, `wsl --list --quiet`, and the Windows principal administrator check established that the unsandboxed tool process was still non-administrator and no WSL distribution was available. An unsandboxed process is not the same as a Windows administrator process.

Started a separate administrator PowerShell process through Windows UAC using `Start-Process -Verb RunAs -WindowStyle Hidden`. The first temporary runner failed before building because Windows PowerShell stripped quotes from inline `node -e` code. Moved the probe into `.cache/s1-s4-symlink-probe.cjs` and retried; `node .cache/s1-s4-symlink-probe.cjs` **passed**, confirming directory symlinks work in the administrator process. Temporary probe directories were removed. No Developer Mode, privilege-policy or registry setting was changed.

Exact launch command for the corrected local runner:

```powershell
$buildProcess = Start-Process -FilePath 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "D:\Data\Project\Claude Code\Project Folder - AR\inventory-system-v2\.cache\s1-s4-admin-build.ps1"' -PassThru
$buildProcess.Id
```

The temporary runner performs the probe and invokes `node scripts/release-check.mjs build`, recording all build output in `.cache/s1-s4-build-admin.log` and the actual exit code in `.cache/s1-s4-build-admin.exit`. It does not change application build options or catch an unsuccessful build as a pass. To reproduce without the temporary runner, open an administrator terminal, change to the repository root, and run `node scripts/release-check.mjs build` directly. The helper continues to force the disposable database and disabled integrations.

Resumed targeted checks: `pnpm lint` **passed**, 0 errors / 44 existing warnings; the elevated `pg_ctl status` and `psql ... -c 'SHOW data_directory;'` checks reconfirmed `.cache/test-pgdata`; `node scripts/release-check.mjs test:damage` **passed**, 2 passed / 7 intentionally filtered. Logs: `.cache/s1-s4-resume-lint.log`, `.cache/s1-s4-resume-damage.log`.

Final `node scripts/release-check.mjs typecheck` **passed** all eight workspace packages (`.cache/s1-s4-resume-typecheck.log`). Final `node scripts/release-check.mjs build` in the administrator process **passed, exit 0**, on 18 September 2026 at approximately 22:27 IST. It compiled the final Sentry changes, passed type validation, generated all 17 static pages and completed standalone output including `apps/web/.next/standalone/apps/web/server.js`. The prior missing-hook and symlink errors did not recur. Webpack emitted two cache serialization performance warnings; Windows PowerShell labels native stderr as `NativeCommandError` in the redirected log, but these warning records did not terminate the command or alter the captured exit code. `git diff --check` also passed.

The Windows build blocker is resolved by the administrator invocation. S4 includes the documented esbuild assessment and outstanding development-tool upgrade decision, not a claim that every advisory was removed. Next task is S2: apply/verify migration 0021 through the isolated helper, then verify invoice concurrency and stored tax facts. S3/S5 and later release phases remain open; no packaging or broader feature work was performed.
