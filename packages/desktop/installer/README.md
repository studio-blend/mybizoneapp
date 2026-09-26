# Windows x64 distribution

The installer is a **per-user installation** under `%LOCALAPPDATA%/Programs/MyBizOne`, so configuration, uploads and database files remain writable without administrator rights. The launcher binds HTTP and Postgres to loopback. Linux/macOS desktop packages are not produced by the release workflow.

## Required inputs

- Windows x64, Node.js 22 LTS, pnpm 9.12.0, Go and Inno Setup 6.
- A completed Windows-native Next.js standalone build. Linux native modules cannot be redistributed as a Windows application.
- Portable Node.js 22 and PostgreSQL 16 archives from official distribution hosts, with **independently verified SHA-256 values**.
- Seller-approved license text; an unsigned candidate must not invent a legal company or domain.

## Stage and compile

From the repository root, using a build-only environment with safe placeholder database/auth values:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @mybizone/web build
node scripts/package-desktop.mjs
```

The staging script copies the standalone tree, static assets, optional public assets, SQL migrations and a self-contained JavaScript migration runner into `dist/desktop/app`. It excludes traced `.env` files. Supply `NODE_RUNTIME_URL`, `NODE_RUNTIME_SHA256`, `POSTGRES_RUNTIME_URL`, `POSTGRES_RUNTIME_SHA256` and `SELLER_LICENSE_TEXT` through the build environment, then run:

```powershell
./scripts/stage-desktop-runtimes.ps1
go -C packages/desktop test ./...
go -C packages/desktop build -ldflags="-X main.Version=v1.0.0" -o ../../dist/desktop/mybizonelaunch.exe .
& 'C:/Program Files (x86)/Inno Setup 6/ISCC.exe' /DAppVersion=1.0.0 packages/desktop/installer/setup.iss
```

Keep Node/Postgres upstream license files inside their runtime folders. All runtimes are required; the installer does not assume Node/Postgres happen to be on the buyer's PATH.

## CI configuration

Set repository variables `NODE_RUNTIME_URL`, `NODE_RUNTIME_SHA256`, `POSTGRES_RUNTIME_URL`, `POSTGRES_RUNTIME_SHA256`, and the secret `SELLER_LICENSE_TEXT`. Tagged builds run cloud image validation and Windows-native packaging, then create a **draft** release. A manual workflow run produces candidate artifacts without publication. Release signing/acceptance remains a separate gate.

Optional update checks require `MYBIZONE_RELEASE_REPOSITORY=owner/repository` in the launch environment. The launcher checks published stable version numbers and offers only matching platform assets. Checks remain disabled until configured.

## Data and backup

`config.json` contains an installation-specific session secret. `data` holds Postgres, `data/backups` holds backups, and `uploads` holds files. Keep all of them when upgrading. Runtime-created data is not deleted by uninstall, but always take a separate backup before upgrade/uninstall.

Scheduled Go backups produce `.sql.gz`; web-requested backups produce PostgreSQL custom `.dump` archives. Both contain **database data only**. Copy uploads and configuration separately while the application is stopped, and retain an off-device copy.

Restore trusted `.dump` files with bundled `postgres/bin/pg_restore.exe --exit-on-error --single-transaction --no-owner --dbname=NEW_EMPTY_DATABASE backup.dump`. For `.sql.gz`, decompress to SQL and use bundled `psql.exe --no-psqlrc --set=ON_ERROR_STOP=1 --single-transaction --dbname=NEW_EMPTY_DATABASE --file=backup.sql`. These are operator recovery tasks against a new, empty database; the browser does not accept arbitrary SQL restores.

## Acceptance before sale

- Install as a standard Windows user on a clean machine with no Node/Postgres installed.
- Complete setup, login, billing, returns, printing and upload/download; restart and verify persistence.
- Verify occupied-port handling, startup failures, backup failure reporting, offline use and license activation.
- Restore database/uploads into a separate installation and reconcile totals and files.
- Test an upgrade from the previous shipped version and a rollback from backup.
- Sign launcher/installer with the seller's code-signing certificate and verify the signature.

Record evidence in [the delivery log](../../../docs/release/delivery-log.md). Automated build output alone does not establish these acceptance results.
