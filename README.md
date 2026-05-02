# MyBizOne (inventory-system-v2)

Production-grade rewrite of the AR Inventory System. Stack: Next.js 14 + TypeScript strict + Postgres + Drizzle + shadcn/ui + Better Auth.

See [`../ARCHITECTURE.md`](../ARCHITECTURE.md), [`../ROADMAP.md`](../ROADMAP.md), [`../AUDIT_REPORT.md`](../AUDIT_REPORT.md), [`../CLAUDE.md`](../CLAUDE.md).

## Prereqs

- Node 20 (`.nvmrc`)
- pnpm 9
- Docker (for local Postgres)

## First run

```bash
cp .env.example .env
pnpm install
pnpm db:up           # starts Postgres in Docker
pnpm db:migrate      # applies Drizzle migrations + RLS policies
pnpm dev             # http://localhost:3000
```

## Layout

```
apps/web/          Next.js 14 (App Router)
packages/db/       Drizzle schema + migrations + RLS
packages/ui/       shadcn primitives
packages/auth-config/  Better Auth + email templates
packages/domain/   Pure business logic (zero framework deps)
packages/config/   Shared tsconfig + Tailwind preset
```

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm typecheck` | TS check across workspace |
| `pnpm lint` | Biome check |
| `pnpm test` | Vitest across packages |
| `pnpm test:e2e` | Playwright |
| `pnpm db:generate` | Generate migration from schema diff |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:up` / `db:down` | Docker Postgres |

## M1 status

See [`../ROADMAP.md`](../ROADMAP.md) §M1.
