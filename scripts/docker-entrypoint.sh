#!/bin/sh
set -e

echo "[entrypoint] Running DB migrations..."
cd /app
pnpm --filter @mybizone/db migrate

if [ "${LAN_MODE}" = "true" ]; then
  echo "[entrypoint] Validating license key..."
  pnpm tsx scripts/validate-license.ts
fi

echo "[entrypoint] Starting app..."
exec "$@"
