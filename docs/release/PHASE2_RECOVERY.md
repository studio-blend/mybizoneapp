# Phase 2 local recovery acceptance

Date: 25 September 2026. Scope: local PostgreSQL and desktop backup library, disposable data only. Browser acceptance is recorded separately in VERIFICATION_REPORT.md.

## Actual result

`TestDisposableRecoveryAcceptance` passed against real PostgreSQL using the actual desktop `RunBackup` / `RestoreBackup` functions and bundled `pg_dump` / `psql`. The test first requires the release helper's explicit opt-in and exact pinned database URL, then verifies `SHOW data_directory` resolves to this repository's `.cache/test-pgdata`. It creates two uniquely named `mybizone_recovery_*` databases and drops both during cleanup. It never restores, clears or stops the browser acceptance database or cluster.

Verified:

- Complete gzip dump publication, restoration into an empty disposable destination and exact persisted row/upload-reference recovery.
- Database persistence across independent `psql` process connections; upload bytes persist across file close/reopen.
- Paired offline upload snapshot and restoration into a separate directory, even after original database rows and upload bytes change.
- Restore into a nonempty destination fails without changing existing rows.
- A valid compressed archive containing a successful UPDATE followed by invalid SQL fails and rolls back the UPDATE via the existing single-transaction restore.
- A truncated gzip archive is rejected before destination mutation.
- Valid restore retry succeeds after the operator clears the disposable destination fixture.
- Existing regressions also pass: successful archive publication/listing, failed dump preserves previous archive and removes partial output, retention preserves recent/unrelated files, corrupt archive validation and invalid-directory reporting.

No production backup-code defect was exposed by these checks. Saved backup changes were preserved.

## Exact commands and outcomes

From the repository root:

1. `gofmt -w packages/desktop/backup/recovery_integration_test.go` and `go version`: **failed**, commands not on PATH. Located the previously documented toolchain at `D:/Go/bin`.
2. `& 'D:/Go/bin/gofmt.exe' -w packages/desktop/backup/recovery_integration_test.go`: **passed**.
3. `$env:PATH = 'D:\Go\bin;' + $env:PATH` followed by `node scripts/release-check.mjs test:recovery`: sandbox invocation **failed before tests**, installed Go standard library inaccessible (`package ... is not in std`).
4. Same PATH assignment and `node scripts/release-check.mjs test:recovery`, approved unsandboxed execution: **passed**, exit 0; **7 tests, zero failures/skips** (six existing tests, one integration test), package runtime 3.257 seconds. SQL `relation already exists` and `missing_recovery_function` errors in output are intentional asserted recovery failures, not test failures. Fixture cleanup completed without error.

Helper command: `go -C packages/desktop test -tags=recovery -count=1 -v ./backup`. Integration test uses the `recovery` build tag so ordinary Go tests cannot silently choose an arbitrary database; invoking the explicit recovery command without its prerequisites fails rather than skips.

## Supported operator procedure and limits

Desktop `.sql.gz` and LAN web `.dump` archives are **database-only**. A complete recovery set additionally requires the uploads directory and securely stored deployment configuration/secrets. Stop application writes while taking the database dump and copying uploads into a new snapshot folder. Check all exit statuses and retain the previous good recovery set when any step fails. Restore a trusted archive into an empty replacement database with the app stopped, copy the matching uploads, verify application behavior, then switch the application to that replacement. Do not restore arbitrary uploaded SQL or overwrite a live database. The web restore action remains disabled.

This acceptance includes a purpose-built failure fixture and the complete migrated application schema. Controlled database-server restart is verified in the separate recovery cluster below. Launcher restart, Windows installer upgrade/uninstall persistence and Docker volume ownership/restart remain delivery-format acceptance in Phase 3. Both desktop gzip SQL and LAN web custom-format database archives are verified locally below. Docker deployment/volume handling remains outside this local gate. Provider checkout/webhook/email checks remain dependent on seller-owned sandbox credentials and are not established by local recovery.

## Expanded full-schema and restart check

Added `TestDisposableRecoveryAcceptance/FullApplicationAndRestart` after review of the first pass. This case creates its own temporary PostgreSQL cluster bound to loopback port 55433, reads a complete dump of the pinned disposable browser database, and restores it to the fresh cluster. It checks all 22 migration names, public tables and RLS flags, constraint definitions, policy definitions and business data. It fingerprints counts and complete row content of every restored public table before and after a controlled stop/start of its own cluster, and reopens the paired upload. It never stops the shared browser cluster. Port 55433 must be free; the test fails rather than selecting an arbitrary server.

A fresh cluster additionally requires the `app_user` role, which database-only `pg_dump` does not include. The fixture recreates `app_user NOLOGIN NOSUPERUSER NOBYPASSRLS` and grants it to the connection owner before restoration. Operators restoring to a new cluster must provision these role prerequisites; copying the database archive alone does not recreate cluster-global roles.

**Expanded verification passed on 25 September 2026.** Exact command: `$env:PATH = 'D:\Go\bin;' + $env:PATH; node scripts/release-check.mjs test:recovery`. Final exit **0**, seven top-level tests plus the full-schema/restart subtest passed, zero failed/skipped, 30.965 seconds. Evidence: `.cache/phase2-recovery-final.log` and `.exit`. All 22 migrations, public-table RLS flags, constraints and policies matched; every restored public-table row/count fingerprint and the paired upload survived controlled stop/start. Temporary databases and the replacement cluster were cleaned up successfully.

Earlier expanded attempt failed after a Windows test-harness hang: `pg_ctl` had exited but its daemon retained the captured output pipe. The parent confirmed the owned cluster's exact temporary data directory on port 55433 and stopped only that cluster with `pg_ctl stop -D 'C:\Users\Shyam_PC\AppData\Local\Temp\TestDisposableRecoveryAcceptanceFullApplicationAndRestart2338873264\001\pgdata' -m fast -w`; subsequent connection/cleanup failures are preserved in `.cache/phase2-recovery-attempt2.log`. Changed the harness to direct daemon-launch output into real log files; the final rerun above passed. No production backup-code change was needed. The agent's earlier escalation was not executed because automatic approval review hit a usage limit; parent execution later resolved that service blocker.

Separately, the shared disposable cluster was found stopped after an interruption. The parent verified `pg_ctl status`, restarted only `.cache/test-pgdata` on port 55432 and reconfirmed `SHOW data_directory`; `.cache/phase2-browser-postgres.log` records PostgreSQL's automatic crash recovery. This incidental restart is not substituted for the controlled restart assertions above.


## LAN custom-format recovery — 26 September 2026

The LAN web backup action produces PostgreSQL custom-format `.dump` archives, distinct from the desktop scheduler's gzip SQL format. Extended the same isolated full-application case to run `pg_dump --format=custom --no-owner --file=<temporary archive> postgresql://postgres@127.0.0.1:55433/postgres` against its stable, complete restored application snapshot. Restored into a second empty database in the owned cluster with `pg_restore --exit-on-error --single-transaction --no-owner --dbname=postgresql://postgres@127.0.0.1:55433/mybizone_recovery_custom <temporary archive>`. All migration names, public-table RLS flags, constraints, policies and every public-table count/content fingerprint matched. A second restore onto that nonempty database returned an error; every data fingerprint remained identical afterward. This tests the real LAN archive format and recovery tools; browser authorization/action invocation is separate acceptance.

Exact command: `$env:PATH='D:\Go\bin;'+$env:PATH` followed by `node scripts/release-check.mjs test:recovery`. Initial sandbox attempt **failed before tests**, installed Go standard library inaccessible. Approved unsandboxed retry **passed**, exit **0**, seven top-level tests plus one full-schema/restart/custom-format subtest; zero failures/skips. Package runtime **60.791 seconds**. Evidence: `.cache/phase2-recovery-custom.log` and `.cache/phase2-recovery-custom.exit`. This final run also reconfirmed all earlier gzip, failure, upload and controlled-restart checks. No production code changes were needed; shared browser database remained read-only to these checks, with both restore formats targeting disposable destinations.
