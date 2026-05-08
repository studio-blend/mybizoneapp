# Father's Shop — v2 Deployment Runbook

Personal runbook for installing MyBizOne v2 on the shop PC alongside v1 (no v1 disruption). You (Shyam) do this once on-site; your father uses what you set up.

**Goal:** 2-week parallel run. v1 keeps recording sales. v2 records the same sales separately. End of 2 weeks, compare and decide cutover.

**Key principle:** v1 (`../inventory-system/`) is NEVER touched until cutover finishes. If v2 breaks, v1 keeps running.

---

## 0. Pre-install checklist

Bring with you:
- [ ] Laptop with current v2 repo at the latest `master` commit
- [ ] USB drive (8 GB+) with: Docker Desktop installer for Windows
- [ ] `.env` file pre-prepared (see §2 below)
- [ ] `BETTER_AUTH_SECRET` generated (`openssl rand -base64 32`) — write it down
- [ ] Phone with WhatsApp open (for screenshotting any error to yourself)

Verify on the shop PC:
- [ ] Windows 10/11 (Docker Desktop requires this)
- [ ] At least **8 GB RAM** total (Docker needs 2 GB; v1 + Windows need the rest)
- [ ] At least **20 GB free disk** (image is 2 GB, Postgres data grows over time)
- [ ] Port `3000` and `5432` not used by anything else (`netstat -ano | findstr :3000` should be empty)
- [ ] Internet connection (one-time, for Docker image pulls)
- [ ] Admin password for the PC

---

## 1. Install Docker Desktop on shop PC

1. Plug in the USB drive, copy installer to `C:\temp\`.
2. Run `Docker Desktop Installer.exe`. Default options. Reboot when asked.
3. After reboot: open Docker Desktop. Sign-in is **NOT required** — close the prompt.
4. In Docker Desktop → Settings → Resources: set Memory to **2 GB**, CPUs to **2**. (Leaves headroom for v1 + Windows.)
5. Wait for the whale icon in the system tray to stop animating (Docker is ready).
6. Open PowerShell, run `docker --version` → should print `Docker version 24.x.x` or higher. If it fails, Docker isn't running yet — wait 30 seconds and retry.

---

## 2. Copy v2 to the shop PC

```powershell
# On the shop PC, in PowerShell:
mkdir C:\mybizone
cd C:\mybizone
```

Copy these files **only** from your laptop's `inventory-system-v2/` to `C:\mybizone\` (use a USB or a private GitHub repo):

```
docker-compose.yml
Dockerfile
.dockerignore
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.base.json
biome.json
apps/         (full folder)
packages/     (full folder)
```

Do **NOT** copy: `node_modules/`, `.next/`, `.git/`, `.code-review-graph/`, `storage/`. The `.dockerignore` excludes them anyway during build, but copying is wasteful.

---

## 3. Create the `.env` file

In `C:\mybizone\.env` (NotePad is fine, save with no `.txt` extension):

```env
# Database (do not change — internal Docker network)
DATABASE_URL=postgres://mybizone:mybizone@db:5432/mybizone

# Auth — paste the BETTER_AUTH_SECRET you generated
BETTER_AUTH_SECRET=<paste-the-32-char-secret-here>
BETTER_AUTH_URL=http://localhost:3000

# Local network mode — skip HTTPS / Secure cookies
LAN_MODE=true

# Local FS storage for product images / bills
STORAGE_BACKEND=local
STORAGE_DIR=/app/storage

# Production
NODE_ENV=production

# Email — leave blank for now (invitations log to console, you read them via `docker logs`)
RESEND_API_KEY=
EMAIL_FROM=MyBizOne <noreply@mybizone.local>
```

Save and close.

---

## 4. First-time build + start

```powershell
cd C:\mybizone
docker compose --env-file .env up -d
```

This will:
- Build the app image (~5–10 min the first time, depending on PC speed)
- Pull Postgres image (~395 MB download, ~2 min)
- Start both containers
- Create persistent volumes (`mybizone_dbdata`, `mybizone_storage`)

**Watch the build:** stays on screen. Look for `Image inventory-system-v2-app Built` and then `Container mybizone-app Started`.

---

## 5. Run database migrations (REQUIRED on first run)

```powershell
docker compose exec app pnpm --filter @mybizone/db migrate
```

Should print 9 migration names ending with `Done`. If it fails: `docker compose logs db` to check Postgres is up.

---

## 6. Verify

Open browser → `http://localhost:3000`

Expected: landing page with "Log in" / "Sign up" buttons.

If you see "Internal Server Error" or a blank page:
```powershell
docker compose logs app --tail 50
```
Screenshot whatever error shows up. WhatsApp it to yourself for debugging later.

---

## 7. Initial setup (15 min)

1. Click **Sign up**. Create your father's account using his email.
2. Email verification: since RESEND_API_KEY is blank, the verification link prints to logs. Get it:
   ```powershell
   docker compose logs app | findstr "verify-email"
   ```
   Copy the URL, paste into browser, verify.
3. Onboarding wizard: enter business GST + first store name + address.
4. Add 5–10 representative products from the shop (with current inventory counts).
5. Make 1 test sale through POS to verify the flow works end-to-end.
6. Generate 1 GST invoice from that sale, download PDF, eyeball it for correctness.

---

## 8. Hand-off to father

Show him:
1. **How to open** — desktop shortcut to `http://localhost:3000` (create it: right-click desktop → New → Shortcut → enter URL)
2. **How to log in** — his email + password
3. **How to record a sale** — POS page, scan/search products, click Save
4. **How to see daily total** — Dashboard
5. **When to stop using v1** — DON'T. Keep using v1 for billing customers. v2 is a parallel record.
6. **What to do if v2 doesn't load** — call you. Don't touch anything.

Print this sheet, leave it next to the shop PC:
> v2 not opening?
> 1. Check whale icon in system tray (bottom-right). If missing, restart PC.
> 2. Still not working: call Shyam. Don't touch anything else.
> 3. v1 (the old system) keeps working — use it for actual customer billing.

---

## 9. Daily monitoring (you, remotely)

Set up TeamViewer / AnyDesk on the shop PC for remote support. Daily for the first 2 weeks:

```powershell
docker compose logs app --since 24h | findstr /C:"error" /C:"Error"
docker compose ps                              # are containers healthy?
docker stats --no-stream                       # is RAM/CPU OK?
```

Track in a spreadsheet:
| Date | Sales recorded in v2 | Sales recorded in v1 | Match? | Issues |
|------|---------------------|----------------------|--------|--------|

---

## 10. Backup (do this every Sunday)

```powershell
# Creates timestamped Postgres dump on the shop PC
$ts = Get-Date -Format "yyyyMMdd"
docker compose exec -T db pg_dump -U mybizone mybizone > "C:\mybizone\backups\backup-$ts.sql"
```

Copy the latest `.sql` file to your laptop weekly. If the shop PC dies, you can restore.

---

## 11. Updating v2 (when you ship a fix)

```powershell
cd C:\mybizone
docker compose down
# Copy new files over (overwrite apps/, packages/, root configs)
docker compose --env-file .env build app
docker compose --env-file .env up -d
docker compose exec app pnpm --filter @mybizone/db migrate    # only if new migrations shipped
```

Data in volumes (`mybizone_dbdata`, `mybizone_storage`) is preserved across rebuilds.

---

## 12. Rollback / panic stop

```powershell
docker compose down                  # stops v2 cleanly. Data preserved.
```

v1 is untouched. Father's billing flow unaffected.

To **wipe v2 entirely** (only if cutover is decided to be a no-go):
```powershell
docker compose down -v               # stops + DELETES volumes. Permanent.
docker rmi inventory-system-v2-app:latest
```

---

## 13. Cutover criteria (end of 2-week parallel run)

Cut over to v2 only if all of these are true:
- [ ] Daily sales counts match between v1 and v2 (±1 sale tolerance)
- [ ] No data loss reported by father in 2 weeks
- [ ] v2 has been up >99% of the time (track via `docker compose logs`)
- [ ] At least 1 GST invoice has been verified by your CA as correct
- [ ] Father is comfortable with the v2 UI (not still asking for help on basics)

If yes → schedule cutover (separate runbook, not in scope here).
If no → diagnose, fix, extend parallel run by another 2 weeks.

---

## Things that will probably go wrong

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Browser shows "this site can't be reached" | Container died | `docker compose ps` — if `Exited`, run `docker compose up -d` |
| App slow to load (>5 sec) | PC running out of RAM | Check Task Manager. Close other apps. Increase Docker memory limit |
| Can't log in / "invalid credentials" | Forgot password | `docker compose exec db psql -U mybizone mybizone` then `UPDATE "user" SET ...` (ask Claude in a fresh session for the exact SQL) |
| Bill image upload fails | Disk full | `docker system df` — if storage volume is huge, archive old images |
| `docker compose up` says "port 3000 already in use" | Something else on the PC owns 3000 | Edit `docker-compose.yml`, change `"3000:3000"` to `"8080:3000"`, access via `localhost:8080` |
| Postgres health check fails | First-boot timing race | `docker compose down && docker compose up -d` — Postgres usually fine on second try |

For anything else: `docker compose logs app --tail 100`, screenshot, debug in a fresh Claude Code session.
