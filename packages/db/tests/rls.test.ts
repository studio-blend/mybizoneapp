import postgres from 'postgres';
/**
 * Two-tenant RLS proof: insert stores under business A and B.
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
  // Insert two tenants. Businesses RLS allows INSERT freely.
  const [a] = await sql<{ id: string }[]>`
    INSERT INTO businesses (name) VALUES ('Tenant A') RETURNING id`;
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO businesses (name) VALUES ('Tenant B') RETURNING id`;
  if (!a || !b) throw new Error('seed failed');
  bizA = a.id;
  bizB = b.id;

  // Insert one store under each tenant. Use SET LOCAL inside a transaction so
  // the WITH CHECK clause sees the right business_id.
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
    await tx`INSERT INTO stores (business_id, name) VALUES (${bizA}, 'A-Main')`;
  });
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.business_id', ${bizB}, true)`;
    await tx`INSERT INTO stores (business_id, name) VALUES (${bizB}, 'B-Main')`;
  });
});

afterAll(async () => {
  // Clean up rows we inserted. RLS allows delete only with matching context per tenant.
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
    await tx`DELETE FROM stores WHERE business_id = ${bizA}`;
    await tx`DELETE FROM businesses WHERE id = ${bizA}`;
  });
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.business_id', ${bizB}, true)`;
    await tx`DELETE FROM stores WHERE business_id = ${bizB}`;
    await tx`DELETE FROM businesses WHERE id = ${bizB}`;
  });
  await sql.end();
});

describe('RLS tenant isolation', () => {
  it('tenant A sees only A stores', async () => {
    const rows = await sql.begin(async (tx) => {
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
      await tx`SELECT set_config('app.business_id', ${bizB}, true)`;
      return tx<{ name: string; business_id: string }[]>`SELECT name, business_id FROM stores`;
    });
    const row = rows[0];
    expect(rows.length).toBe(1);
    expect(row?.name).toBe('B-Main');
    expect(row?.business_id).toBe(bizB);
  });

  it('no tenant context → 0 rows visible', async () => {
    // Intentionally do NOT set app.business_id. RLS policies refuse to match.
    const rows = await sql<{ id: string }[]>`SELECT id FROM stores`;
    expect(rows.length).toBe(0);
  });

  it('tenant A cannot insert into tenant B', async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
        await tx`INSERT INTO stores (business_id, name) VALUES (${bizB}, 'leak')`;
      }),
    ).rejects.toThrow();
  });
});
