# Delivery work log — 2026-09-15

Scope: Docker/cloud delivery, Windows desktop launcher, backup/restore, installer and release packaging. No customer database, secret `.env` values, deployment, or published release was accessed.

## Findings and changes

- Docker build referenced nonexistent package `build` scripts; builds the Next.js web package directly now.
- Docker entrypoint changed directory for migrations and then executed the server from the wrong directory; it now returns to `apps/web` before starting Next.js.
- LAN license validation now uses the installed database package's `tsx` runner and a resolvable local source import.
- Compose requires database and session secrets, binds the development database port to loopback, accepts the application URL, license, email and payment configuration, and forwards the public payment key at build time.
- R2 was an unfinished backend that failed on first file access; selection now fails immediately with an actionable persistent-local-volume instruction.
- Desktop creates its database before migration, starts Postgres only on loopback, avoids prepopulating the `initdb` directory, stops startup after prerequisite failures, locates the monorepo standalone server correctly, supplies persistent upload storage, and generates a random session secret per installation.
- Desktop maintenance starts once across restarts. Backup uses the actual desktop connection instead of an unset parent environment variable.
- Backup publication uses a temporary file and rename after successful dump/compression/sync; failed dumps do not appear as completed backups. Restore validates gzip integrity before invoking bundled `psql` with stop-on-error and one transaction. Missing directories are distinguished from inaccessible backup files. Retention defaults to 30 days and only targets `.sql.gz` archives. Failures are logged.
- Updater is opt-in through `MYBIZONE_RELEASE_REPOSITORY`, uses an HTTP timeout, checks HTTP errors, rejects unknown/prerelease versions, compares numeric stable versions, and avoids reporting unavailable platform assets.

## Tools and checks

- Go found at `D:/Go/bin/go.exe`, version `go1.22.10 windows/amd64`.
- Initial sandbox Go test failed to access the installed standard library/build cache. Approved rerun of `go test ./...` completed successfully (at that point packages had no tests).
- Docker CLI and PostgreSQL were absent from PATH; Docker executable also absent under its remaining Program Files folder.
- Downloaded the PostgreSQL 16.15 Windows binary archive from the [EDB distribution](https://www.enterprisedb.com/download-postgresql-binaries), using the network approval flow after the sandbox proxy rejected the download. Archive is in ignored `.cache/postgresql.zip`; extracted binaries in `.cache/postgres/pgsql`.
- Created an isolated test cluster in ignored `.cache/test-pgdata`. Root started it on loopback port **55432**, created `mybizone_release_test`, applied 21 migrations, and reported 16 RLS tests passing. This is test-only data; it does not use the existing `.env` database.

## Remaining delivery work / external gates

- Installer/release packaging correction in progress; previous files referenced absent license/icon/runtimes and built the Windows application on Linux.
- Docker image cannot yet be built/run here because Docker is unavailable.
- Seller identity, approved license/terms, support contact, cloud domain/hosting, production email/payment credentials, code-signing certificate and release repository remain external inputs.
- A clean Windows installation, upgrade, backup/restore drill and a cloud Docker smoke run must pass before selling either distribution.
- R2 remains unsupported; cloud launch requires a single application instance with durable local storage and off-host database/upload backups.

Further check results and packaging changes will be appended below.
