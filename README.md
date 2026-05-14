# MyBizOne

Indian SMB retail management SaaS — billing, inventory, GST compliance, CRM, and analytics for shop owners. Built as a cloud SaaS with an optional self-hosted desktop mode.

**Stack:** Next.js 14 · TypeScript strict · PostgreSQL · Drizzle ORM · shadcn/ui · Better Auth · Razorpay

---

## Features

| Area | What's included |
|------|----------------|
| **Billing (POS)** | GST / Non-GST / Estimate bills · 5 GST slabs · Cash, UPI, Card, EMI, Cheque · Per-item discounts · Free items · FY bill series |
| **EMI** | Instalment schedules · Payment ledger · Overdue tracking |
| **Inventory** | Products · Purchase bills · Purchase & sales returns · Damage logs · Closing stock on any date · Inventory valuation |
| **Customers & Suppliers** | Credit limits · Outstanding balances · Rate categories · Opening balance carry-forward |
| **GST Compliance** | GSTR-1 Excel + JSON (GSTN v1.1) · GSTR-3B summary · HSN-wise report · E-invoice IRN (sandbox) |
| **Accounting** | P&L report · Balance sheet · Expense ledger |
| **Analytics** | Interactive dashboard (Recharts) · KPI cards with delta · Revenue trend · Category donut · Payment split · Performance reports |
| **CRM** | Customer tags · Notes timeline · Segmentation builder · WhatsApp campaigns (wa.me) |
| **RBAC** | Role hierarchy: super_admin → admin → managers → multi-role staff · Department scoping · Ownership transfer |
| **Multi-store** | Store-scoped data · Branch & floor manager scoping · Department bill series |
| **Monetisation** | Plan limits · Usage metering · Razorpay subscription checkout · RSA license keys |
| **Desktop mode** | Go launcher · First-run setup wizard · Daily backup · Auto-update check · Inno Setup installer |

---

## Local Development

### Prerequisites
- Node 20+ (`nvm use` if using `.nvmrc`)
- pnpm 9 (`npm i -g pnpm`)
- Docker (for local Postgres)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/studio-blend/mybizoneapp.git
cd mybizoneapp
pnpm install

# 2. Configure environment
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local — set DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL

# 3. Start Postgres and apply migrations
pnpm db:up
pnpm db:migrate

# 4. Start dev server
pnpm dev
# → http://localhost:3000
```

### Environment variables

Copy `.env.example` to `apps/web/.env.local`. The only required vars for local dev:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mybizone_dev
BETTER_AUTH_SECRET=any-random-32-char-string
BETTER_AUTH_URL=http://localhost:3000
```

All other vars (Razorpay, Resend, Sentry, GSTN) are optional — features degrade gracefully when unset.

---

## Project Structure

```
apps/
  web/                  Next.js 14 App Router (main application)
    app/(app)/          Authenticated pages (POS, reports, CRM, settings)
    app/setup/          First-run wizard (LAN/desktop mode)
    app/api/            API routes (auth, webhooks, backup)
    lib/                DB client, session, env, safe-action wrapper

packages/
  db/                   Drizzle schema + 17 migrations + RLS policies
  domain/               Pure business logic (sale calc, GST, permissions, bill series)
  ui/                   shadcn/ui component primitives
  auth-config/          Better Auth configuration + email templates
  desktop/              Go launcher binary (portable desktop distribution)
  config/               Shared tsconfig + Tailwind preset
```

---

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript check across workspace |
| `pnpm lint` | Biome lint + format check |
| `pnpm test` | Vitest unit tests (74 tests across 7 files) |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm db:generate` | Generate Drizzle migration from schema diff |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Drizzle Studio (visual DB browser) |
| `pnpm db:up` | Start local Postgres via Docker |
| `pnpm db:down` | Stop local Postgres |

---

## Deployment (Cloud SaaS)

**Recommended:** Vercel (web) + Neon (Postgres)

1. Connect this repo to Vercel
2. Set root directory to `apps/web`
3. Add all env vars from `.env.example` in Vercel dashboard
4. Run migrations: `pnpm db:migrate` against your Neon DB once after first deploy

See [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) for the full pre-launch checklist.

---

## Desktop / Self-hosted Mode

Set `LAN_MODE=true`. The Go launcher in `packages/desktop/` starts portable Postgres + Node and opens the browser. First-run wizard at `/setup`. See `packages/desktop/installer/README.md` for building the Windows installer.

---

## Architecture Notes

- **Multi-tenancy:** Row-Level Security on all tenant tables. Every DB query must use `withTenant(db, businessId, tx => ...)` — RLS only fires under the `app_user` Postgres role.
- **Money:** `NUMERIC(12,2)` in DB · `round2()` from `@mybizone/domain/money` for arithmetic · never use floats.
- **Server actions:** All mutations use `safeAction()` wrapper with Zod validation.
- **Bill numbering:** Atomic `nextBillNo()` keyed by (business_id, doc_type, financial_year).
- **Permissions:** `hasPermission(userRoles[], gate)` in `@mybizone/domain/permissions`. Super_admin always bypasses all gates.
