/** Ordered SQL migrations shared by development, Docker and portable desktop. */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const migrationsDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'migrations');

try {
  // A session lock prevents two application instances applying the same migration.
  await sql`SELECT pg_advisory_lock(18429, 1)`;
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const applied = new Set((await sql`SELECT name FROM _migrations`).map((row) => row.name));
  for (const file of files) {
    if (applied.has(file)) {
      console.info(`skip  ${file} (already applied)`);
      continue;
    }
    const body = await readFile(join(migrationsDir, file), 'utf8');
    console.info(`apply ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO _migrations (name) VALUES (${file})`;
    });
  }
  console.info('migrations: up to date');
} finally {
  // Closing the sole connection releases the lock even after a failed migration.
  await sql.end({ timeout: 5 });
}
