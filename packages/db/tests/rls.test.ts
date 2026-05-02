import postgres from 'postgres';
/**
 * Two-tenant RLS proof: insert stores under business A and B.
 * Each query block SETs LOCAL ROLE app_user so RLS actually applies (the
 * connection user is typically a superuser and bypasses RLS otherwise).
 * Set app.business_id = A → only A's stores visible.
 * Set app.business_id = B → only B's stores visible.
 *
 * If this test fails, multi-tenancy is broken. M1 cannot ship without it green.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.DATABASE_URL ?? 'postgres://mybizone:mybizone@localhost:5432/mybizone';
const sql = postgres(url, { max: 1, prepare: false });

let bizA = '';
let bizB = '';

beforeAll(async () => {
  // Insert two tenants as the superuser connection (bypasses RLS for setup).
  const [a] = await sql<{ id: string }[]>`
    INSERT INTO businesses (name) VALUES ('Tenant A') RETURNING id`;
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO businesses (name) VALUES ('Tenant B') RETURNING id`;
  if (!a || !b) throw new Error('seed failed');
  bizA = a.id;
  bizB = b.id;

  // Insert one store under each tenant via app_user, so the INSERT goes through
  // the same code path the app uses (RLS WITH CHECK against app.business_id).
  await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`;
    await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
    await tx`INSERT INTO stores (business_id, name) VALUES (${bizA}, 'A-Main')`;
  });
  await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`;
    await tx`SELECT set_config('app.business_id', ${bizB}, true)`;
    await tx`INSERT INTO stores (business_id, name) VALUES (${bizB}, 'B-Main')`;
  });
});

afterAll(async () => {
  // Cleanup as superuser (no RLS) to guarantee teardown regardless of state.
  await sql`DELETE FROM stores WHERE business_id IN (${bizA}, ${bizB})`;
  await sql`DELETE FROM businesses WHERE id IN (${bizA}, ${bizB})`;
  await sql.end();
});

describe('RLS tenant isolation', () => {
  it('tenant A sees only A stores', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`;
      await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
      return tx<{ name: string; business_id: string }[]>`SELECT name, business_id FROM stores`;
    });
    const row = rows[0];
    expect(rows.length).toBe(1);
    expect(row?.name).toBe('A-Main');
    expect(row?.business_id).toBe(bizA);
  });

  it('tenant B sees only B stores', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`;
      await tx`SELECT set_config('app.business_id', ${bizB}, true)`;
      return tx<{ name: string; business_id: string }[]>`SELECT name, business_id FROM stores`;
    });
    const row = rows[0];
    expect(rows.length).toBe(1);
    expect(row?.name).toBe('B-Main');
    expect(row?.business_id).toBe(bizB);
  });

  it('no tenant context (still under app_user) → 0 rows visible', async () => {
    // Switch to app_user but DO NOT set app.business_id.
    // current_setting('app.business_id', true) returns NULL → cast to uuid stays NULL → policy fails.
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`;
      return tx<{ id: string }[]>`SELECT id FROM stores`;
    });
    expect(rows.length).toBe(0);
  });

  it('tenant A cannot insert into tenant B', async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE app_user`;
        await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
        await tx`INSERT INTO stores (business_id, name) VALUES (${bizB}, 'leak')`;
      }),
    ).rejects.toThrow();
  });
});
