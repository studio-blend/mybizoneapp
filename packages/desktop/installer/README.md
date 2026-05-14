# MyBizOne Installer

## Requirements

- **Inno Setup 6+** — download from https://jrsoftware.org/isdl.php
- The compiled `mybizonelaunch.exe` Go binary placed in this directory
- The Next.js standalone build at `../../../apps/web/.next/standalone/`

## Optional bundles (place next to setup.iss before building)

- `portable-pg/` — portable PostgreSQL distribution (e.g. from https://www.enterprisedb.com/download-postgresql-binaries)
- `portable-node/` — portable Node.js (e.g. from https://nodejs.org/en/download/)

If these directories are absent the installer will skip them (the Check: condition handles this). The end-user will need to have PostgreSQL and Node.js installed separately in that case.

## Building

```powershell
# From this directory:
iscc /DAppVersion=1.0.0 setup.iss
# Output: output\MyBizOne-Setup-1.0.0.exe
```

## CI

The GitHub Actions `build-installer` job runs `choco install innosetup` then compiles this script automatically on every tagged release.
