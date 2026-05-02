/**
 * Hand-rolled migrator: runs `migrations/*.sql` in lexical order, tracking
 * applied files in `_migrations`. Idempotent — safe to re-run.
 *
 * Why hand-rolled instead of drizzle-kit's migrator?
 *   We hand-write RLS policies in SQL. drizzle-kit's generator doesn't model
 *   policies cleanly. Treating migrations as ordered SQL files keeps RLS and
 *   table DDL in one auditable place.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const here = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

const sql = postgres(url, { max: 1, prepare: false });

async function run() {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    (await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.warn(`skip  ${file} (already applied)`);
      continue;
    }
    const body = await readFile(join(migrationsDir, file), 'utf8');
    console.warn(`apply ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
  }

  console.warn('migrations: up to date');
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
