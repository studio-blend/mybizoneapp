# Local Pro testing — 14 October 2026

**Owner's ongoing instruction:** Use `pro.owner@example.com` for all testing and verification. Future tasks must follow [the standard test-account record](TEST_ACCOUNT.md) and read the saved private credentials.

## Hosted account completed — 14 October 2026

Neon access now works. Project `mybizoneapp` (`silent-scene-72840763`), existing branch `production` (`br-odd-tree-aomevkex`), exposes the MyBizOne schema and reports ADMIN access. The owner identifies this website/database as development/testing despite the provider's branch label. This section supersedes the earlier authentication blockers below.

Applied the prepared account-creation SQL through the Neon plugin as one transaction. Verified the email did not exist beforehand and that required schema columns match. Created only the dedicated Pro test business, owner, hashed credential, two stores and usage snapshot; no schema change, provider subscription or deployment was needed.

**The same saved credentials now work at `https://mybizoneapp.vercel.app/login`.** Canonical file `.local/test-accounts/pro-owner.json` contains the preserved password plus verified hosted origin/project/branch metadata. Both it and the generated SQL remain ignored by Git.

`node scripts/verify-hosted-pro.mjs`: **passed**, exit 0; actual Chromium verified owner login, Pro plan/three unlimited indicators, both test stores, and dashboard/products/employees/team/reports access. Evidence: `.cache/hosted-pro-verification.json`. Initial sandbox attempt could not access the installed browser; approved retry passed. Scoped Biome check passed after approved pnpm-access retry.

This is hosted test-account acceptance. It does not establish payment/email provider, upload persistence or complete cloud release acceptance. Razorpay remains on hold. The earlier local Pro and commerce evidence remains documented below.

Razorpay work is on hold at the owner's request. Local Pro access is a test fixture, not a paid provider subscription or production license.

## Test account

- Login: `http://localhost:3000/login` while the isolated dev server is running.
- Email: `pro.owner@example.com`.
- Password: stored in ignored `.local/test-accounts/pro-owner.json`; not included in tracked documents. This is the canonical credential file for subsequent tasks, separate from disposable build/test caches. An initial copy remains in ignored `.cache/pro-test-account.json`.
- Business: MyBizOne Pro Test Shop.
- Role: owner, mapped by existing application policy to all business-level permissions without store restrictions.
- Plan: Pro, the highest implemented tier; unlimited stores, products and team members.
- Initial data: Main Test Store and Second Test Store; one demo product in each, 25 units, selling price 100 and cost 60. Non-GST by default; tax/commerce workflows are also covered using separate browser fixtures.

Pro access does not provide external service credentials or override security boundaries. Online payment/email/GST provider operations remain disabled in the isolated runner. Instance-level backup restrictions still apply to this multi-business test database.

## Reuse

Future tasks: read the canonical credential file locally without logging its contents. Reuse the account; do not rotate its password or overwrite user-created test data implicitly. Hosted access is verified as recorded above. Local files are not a cross-machine secret manager; copy credentials privately when moving to another machine. The existing local seed deliberately refuses remote databases; it must not be pointed at hosting by weakening its guard.

From the repository root:

```powershell
node scripts/release-check.mjs seed:pro
node scripts/release-check.mjs dev
```

The seed requires the exact disposable database URL from the helper and verifies its actual PostgreSQL data directory equals this repository's `.cache/test-pgdata`. It refuses to modify a colliding unrelated email/account and preserves existing fixture data on reruns. It neither loads `.env` nor changes production users. Start the existing isolated PostgreSQL cluster on localhost:55432 first if necessary. Do not run two Next servers sharing the build directory.

## Verification

- Full automated suite: **258 passed** (90 domain, 17 database, 23 storage, 126 web, 2 PDF); exit 0. `.cache/pro-full-tests.log` and `.exit`.
- Full-suite result above predates concurrent performance edits and the later dashboard fix; it is not a final-tree release gate. The initial full browser attempt was interrupted after concurrent edits restarted Next. The owner paused the other task.
- Explicit Pro browser acceptance: **1 passed**, zero retries; `.cache/pro-owner-browser-final.log/.exit`. First attempt encountered an ambiguous card/toast text selector, corrected to a heading. Both original stores and successful additional-store creation are verified.
- Dashboard fix: raw Date values in the new aggregate SQL failed at runtime; typed Drizzle comparisons now serialize them correctly. Real isolated PostgreSQL regression: **1 passed**, `.cache/pro-dashboard-test.log`.
- Workspace typecheck: **passed**, `.cache/pro-typecheck-final.log/.exit`, after narrowing the optional analytics key across its async initializer. Scoped Biome check: passed. No broad formatting or release build was run.
- Targeted commerce rerun: GST invoice scenario passed, but the process was interrupted before the non-GST result (saved exit 1073807364). Resumed only non-GST with `node scripts/release-check.mjs e2e:non-gst:dev`: **1 passed**, zero retries, exit 0; `.cache/pro-non-gst-final.log/.exit`. Includes purchase/stock, sale/UPI-reference recording, persisted PDF receipt, anonymous PDF denial, sales return, over-return rejection, supplier return and uploaded-image persistence. The expected over-return error in the server log is asserted by the test. These runs are targeted evidence, not a current full 20-scenario pass.
- Pro browser check uses `node scripts/release-check.mjs e2e:pro:dev`; seed the account first. It runs separately from CI's ordinary signup/commerce/mobile fixtures and does not require test credentials in Git.
- The Pro browser scenario verifies login, Pro/three unlimited indicators, access to both initial stores, creating an additional store beyond the Free limit, and 16 application/administration routes. Added stores remain available for manual testing.
- No live payment, provider checkout or external email was exercised. No release readiness claim.

## Hosted development account

Requested URL: `https://mybizoneapp.vercel.app/`.

Verified using the connected Vercel Primary account: project `mybizoneapp-web`, ID `prj_g8MSZoqRy6vnSDfqbkUbnq4oZIGf`, team `team_iggGTPHtEYjOqjTcxZXuIyX6`. Vercel calls this target production; the owner identifies it as their development website. This does not authorize unrelated customer/account modifications or publication of current local changes.

Hosted provisioning is pending. The connector could read project/environment metadata but returned 403 for the database secret; CLI fallback had no existing authentication, and its waiting login process was stopped. Local `.env` database hosts are localhost, so they are not evidence of hosted database access. Owner was asked to reconnect Vercel with the required team access or save the development database URL privately in ignored `.env.hosted-test`.

Once available, provision only a new test tenant/account with the canonical credentials, preserve existing users, grant Pro locally in that development database, and verify actual HTTPS login and billing/permission screens. Do not claim that local account creation automatically synchronizes databases. No hosted account, deployment, environment setting or provider subscription was changed in this attempt.

### Connection follow-up and private SQL handoff

The owner reconnected Vercel successfully. The database variable can now be inspected, but Vercel returns no value for this `sensitive` setting (`decrypted=false`). The owner confirmed `.env` is for testing; its actual connection is `localhost:5432/mybizone`, which currently refuses connections. The isolated helper uses its own running `.cache/test-pgdata` cluster on port 55432. Neither local address identifies the hosted database.

One HTTPS sign-in attempt using the saved test credentials returned 401 from `mybizoneapp.vercel.app`. Hosted login is not working yet. No signup or plan update was performed there.

Prepared an alternative private database-console handoff:

```powershell
node scripts/prepare-pro-hosted.mjs
```

This writes ignored `.local/test-accounts/pro-owner-hosted.sql` using the same saved password's Better Auth hash, plus two stores and Pro owner access. The generator never reads `.env` or connects to a database. An unrelated account with the same email causes the transaction to fail; a matching fixture is preserved. SQL syntax and existing-account guard were validated on isolated PostgreSQL with rollback. New hosted provisioning is still unexecuted and actual HTTPS access must be verified after application.

Run that private SQL only in the confirmed development database backing `mybizoneapp.vercel.app`, using the database provider's SQL editor, or provide its connection privately in `.env.hosted-test` so the task can complete provisioning. Keep the password and generated SQL out of Git and chat.

The owner identified **Neon** and requested the plugin. Plugin Management confirms `neon-postgres` installed and enabled. Read the plugin's Neon/Postgres skills and checked its configured MCP server. Connecting to server `neon` failed during initialization with **Auth required**; no authenticated Neon SQL tools are exposed in this session. Neon CLI is unavailable and `NEON_API_KEY` is not configured. Asked the owner to reconnect/sign in to Neon for the MyBizOne development project. No project or database was created or modified through Neon.

After the owner confirmed reconnection, the active task still received **Auth required** on Neon initialization and exposed no Neon SQL tools. A fresh Codex session/restart may be needed to reload the connection. Resume hosted provisioning there using the saved credentials and SQL; do not repeat local account creation or claim hosted success before verifying HTTPS login.
