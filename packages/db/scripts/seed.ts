/**
 * Dev seed: one demo business + one store. Idempotent on email.
 * Not run in CI; only for manual dev convenience.
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

async function run() {
  const [biz] = await sql<{ id: string }[]>`
    INSERT INTO businesses (name, gst_enabled, vertical)
    VALUES ('Demo Shop', false, 'retail')
    RETURNING id
  `;
  if (!biz) throw new Error('failed to insert business');

  await sql`SELECT set_config('app.business_id', ${biz.id}, false)`;

  await sql`
    INSERT INTO stores (business_id, name, address)
    VALUES (${biz.id}, 'Main Store', 'Demo Address')
  `;

  console.warn(`seeded business ${biz.id}`);
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
