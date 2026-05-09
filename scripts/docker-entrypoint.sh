#!/bin/sh
set -e

echo "[entrypoint] Running DB migrations..."
cd /app
pnpm --filter @mybizone/db migrate

echo "[entrypoint] Migrations complete. Starting app..."
exec "$@"
