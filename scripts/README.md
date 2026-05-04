# Scripts

Repo-level utilities. Each runs via `pnpm tsx scripts/<file>.ts`.

## migrate-from-v1.ts

v1 (MongoDB) → v2 (Postgres) data migration. M2 stub — see file header for
the full plan. Run only after `pnpm db:migrate` has applied the v2 schema.

```bash
MONGO_URI=mongodb://localhost/ar-inventory \
DATABASE_URL=postgres://mybizone:mybizone@localhost:5432/mybizone \
pnpm tsx scripts/migrate-from-v1.ts
```

The `_v1_migration_lookup` table is created on first run and maps Mongo
ObjectIds to v2 UUIDs. Subsequent runs skip already-migrated rows. To
fully re-migrate, `DROP TABLE _v1_migration_lookup` (and the v2 data).
