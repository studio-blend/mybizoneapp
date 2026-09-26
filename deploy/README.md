# MyBizOne deployment

Supported delivery targets: **one cloud application instance with persistent local uploads**, and **Windows x64 desktop**. R2 is not implemented. Desktop packaging instructions are in [the installer guide](../packages/desktop/installer/README.md).

## Docker prerequisites

- The **complete source checkout**, including `apps`, `packages`, `scripts`, Dockerfile and lockfile. Copying only `docker-compose.yml` cannot build the application.
- Docker Engine/Desktop with Compose v2, sufficient disk for the build and backups, and ports 3000/5432 available on loopback.
- For cloud use: the seller's domain, an HTTPS reverse proxy, durable host storage, off-host backup destination, production email configuration and payment credentials when selling subscriptions.
- Development/release builds use Node.js **22 LTS** and pnpm 9.12.0. Node is included in Docker.

## Configure a fresh deployment

Create a deployment `.env` in the checkout. Do not commit it. Generate **two different** random values with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

```dotenv
# Use independent 64-character random hexadecimal values, not these labels.
POSTGRES_PASSWORD=REPLACE_WITH_RANDOM_HEX
BETTER_AUTH_SECRET=REPLACE_WITH_ANOTHER_RANDOM_HEX
BETTER_AUTH_URL=https://YOUR_DOMAIN
LAN_MODE=false
STORAGE_BACKEND=local
NODE_ENV=production
APP_BIND_ADDRESS=127.0.0.1
# Set verified seller/support details and email configuration before launch.
SUPPORT_EMAIL=
RESEND_API_KEY=
EMAIL_FROM=
# Optional: Google OAuth and paid cloud subscriptions.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_RAZORPAY_KEY_ID=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_ID_MONTHLY=
RAZORPAY_PLAN_ID_ANNUAL=
```

The database password is interpolated into a connection URL: hexadecimal generation avoids URL escaping errors. Changing `POSTGRES_PASSWORD` after first initialization does **not** change the existing database role's password; coordinate password rotation separately.

For a shop-only HTTP deployment, set `BETTER_AUTH_URL` to the exact browser origin, `LAN_MODE=true`, and supply a valid `LICENSE_KEY`. Set `APP_BIND_ADDRESS=0.0.0.0` only when intentionally allowing the shop network to connect. The Windows desktop launcher uses loopback by default.

## Start and verify

```sh
docker compose up --build -d --wait
docker compose ps
docker compose logs --tail 100 app
```

Startup applies ordered transactional migrations before running the server. Migration failures prevent startup; multiple starting instances serialize migrations using a database advisory lock.

Configure the cloud reverse proxy to forward HTTPS traffic for `BETTER_AUTH_URL` to `127.0.0.1:3000`, preserving the host and forwarded protocol headers. Keep the database private. Verify health, signup, verification email, login, initial business setup, sale/purchase/return, upload/download and reports over the final HTTPS domain. Test payment and webhook lifecycle in the provider sandbox before switching production credentials.

`NEXT_PUBLIC_*` settings are build-time values; rebuild after changing them. App/database data lives in the `storage` and `dbdata` Docker volumes. Keep these volumes when replacing containers.

## Consistent backup: database and uploads

Use a **new backup folder per run**, and copy it to encrypted off-host storage. The commands below assume that `backups` does not contain another run. Stop the single application instance to keep uploaded files and database references consistent during the snapshot.

```sh
mkdir backups
docker compose stop app
docker compose exec -T db pg_dump -U mybizone -d mybizone -Fc -f /tmp/mybizone.dump
docker compose cp db:/tmp/mybizone.dump ./backups/mybizone.dump
docker compose cp app:/app/storage ./backups/uploads
docker compose start app
```

Check every command's exit status. If backup fails, restart the app and retain the last good backup. Schedule the routine and monitor failures. Back up deployment configuration/keys separately in secure storage. Database-only backups do **not** include uploads.

## Restore drill into a new deployment

Never test a restore over live customer data. Use a separate host/project with empty volumes; keep the app stopped until the restore and uploads are complete.

1. Start only the new database: `docker compose up -d db`.
2. Copy a trusted backup: `docker compose cp ./backups/mybizone.dump db:/tmp/mybizone.dump`.
3. Restore: `docker compose exec -T db pg_restore -U mybizone -d mybizone --exit-on-error --single-transaction --no-owner /tmp/mybizone.dump`.
4. Create the app container without starting it: `docker compose create app`.
5. Restore uploads: `docker compose cp ./backups/uploads/. app:/app/storage` and verify the files remain writable by container user 1001.
6. Start the app, check logs and health, sign in and reconcile representative sales, stock balances and uploaded files.

Restore only trusted archives supplied by the operator; a database archive can contain executable SQL. The web app intentionally offers backup/download rather than arbitrary SQL restore.

## Upgrade and rollback

Back up both data stores and configuration, stop the app, deploy the chosen source version and run `docker compose up --build -d --wait`. Test the workflows above. A code rollback alone may not reverse a schema migration: restore a verified pre-upgrade database/upload snapshot into a separate deployment when necessary, then switch traffic after validation.

`docker compose stop` preserves data. Do not use volume deletion as a routine upgrade or restart step.

## Launch gates

See [release work log](../RELEASE_WORK_LOG.md) and [delivery log](../docs/release/delivery-log.md). A passing build is not proof of production readiness. The seller must provide its legal identity, approved terms/license, support contact, domain, hosting, email/payment accounts and off-host backup operations. No support email/domain is invented by this project.
