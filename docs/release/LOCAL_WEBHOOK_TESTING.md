# Local Razorpay webhook endpoint — 29 September 2026

## Status

Local app and signature-checked gateway are running and verified. **Public HTTPS endpoint is blocked by DNS; no public URL exists yet.** This is connectivity preparation, not actual Razorpay provider acceptance.

- Isolated application: `http://localhost:3001` (test database only).
- Gateway: `http://127.0.0.1:3300/api/webhooks/razorpay`.
- Only the exact webhook POST route is forwarded. HMAC authentication precedes forwarding; body limit is 1 MiB. Cookies/arbitrary headers and upstream debug responses are not exposed. Upstream status is preserved for provider retries.
- Webhook secret: repository-root `.env.webhook-test`, ignored by Git. Copy its value privately into the Razorpay Test Mode webhook Secret field once the URL exists. Do not use a live webhook endpoint with this secret.
- Owner's API keys/plans are in `.env`. Presence, test prefix and public/private ID match were checked without printing values. They were not transmitted to Razorpay or enabled in the webhook runner. The runner continues to disable checkout/email integrations; actual checkout needs the separate cloud-mode acceptance setup.

## Start after restart

Run from the repository root. Confirm the existing isolated database on port 55432 belongs to `.cache/test-pgdata`; start that cluster if needed. Avoid concurrent Next dev processes sharing the same `.next` directory.

```powershell
node scripts/webhook-test-gateway.mjs --init
node scripts/release-check.mjs webhook:dev
```

In another terminal:

```powershell
node scripts/webhook-test-gateway.mjs
```

Then start the tunnel in another terminal:

```powershell
& '.cache/webhook-tunnel/cloudflared.exe' tunnel --url http://127.0.0.1:3300 --no-autoupdate --protocol http2 --logfile .cache/webhook-tunnel/tunnel.log
```

Use the HTTPS hostname printed by cloudflared plus `/api/webhooks/razorpay` in Razorpay Test Mode. Do not point the tunnel directly at the Next app. The URL changes when a new Quick Tunnel is created; update the dashboard accordingly. Stop each process with Ctrl+C in its terminal when finished. No Windows service or automatic startup was installed.

## Current network blocker

Cloudflared failed twice with `lookup api.trycloudflare.com: no such host`. `Resolve-DnsName api.trycloudflare.com` reported DNS operation refused. An explicit diagnostic query to Cloudflare's `1.1.1.1` resolver succeeded, but cloudflared's process-specific DNS override did not affect its initial Quick Tunnel API lookup. Windows DNS/hosts/firewall settings were not modified.

Next: use an owner-approved network/resolver that resolves `api.trycloudflare.com`, or provide an existing account-backed tunnel setup. Retry the command and verify the public route before registering the URL. An account-backed tunnel has not been configured here.

## Evidence

- Official Cloudflare executable downloaded to ignored `.cache/webhook-tunnel/cloudflared.exe`; published GitHub SHA-256 verified: `f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2`. Download metadata is in the same directory.
- `node --test scripts/webhook-test-gateway.test.mjs`: sandbox spawn denied; approved retry passed 1 test, zero failed/skipped. Covers private-path rejection, method checks, signatures, cookie stripping, raw body forwarding and retry status sanitization.
- A synthetic signed ignored event traversed the local gateway and actual Next webhook route: HTTP 200. No customer subscription mutation or real provider event was used.
- Disposable database data-directory query confirmed the repository's `.cache/test-pgdata`. Initial sandbox PostgreSQL start failed; approved start succeeded. PDF compilation and Next startup passed.

Reference: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/). Quick Tunnels are temporary development endpoints, without an uptime guarantee.
