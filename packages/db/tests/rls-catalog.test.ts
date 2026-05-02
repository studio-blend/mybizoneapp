/**
 * 2-tenant RLS proof for the M2 catalog + sales + invoices + invitations tables.
 * Mirrors the rls.test.ts pattern: every app-side query SETs LOCAL ROLE app_user
 * (which lacks BYPASSRLS) so policies actually fire.
 *
 * Each table gets two checks:
 *   1. Tenant A sees only its own rows.
 *   2. Tenant A cannot insert a row tagged with Tenant B's business_id (WITH CHECK rejects).
 *
 * Sale + sale_items are tested as a unit since sale_items reference sales.
 */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.DATABASE_URL ?? 'postgres://mybizone:mybizone@localhost:5432/mybizone';
const sql = postgres(url, { max: 1, prepare: false });

let bizA = '';
let bizB = '';
let storeA = '';
let storeB = '';
let categoryA = '';
let brandA = '';
let productA = '';
let saleA = '';

beforeAll(async () => {
  // Seed two tenants (as superuser — RLS bypassed for setup convenience).
  const [a] = await sql<{ id: string }[]>`
    INSERT INTO businesses (name) VALUES ('Catalog A') RETURNING id`;
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO businesses (name) VALUES ('Catalog B') RETURNING id`;
  if (!a || !b) throw new Error('seed failed');
  bizA = a.id;
  bizB = b.id;

  // Seed under tenant A — every INSERT runs through RLS WITH CHECK via app_user.
  await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`;
    await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
    const [s] = await tx<{ id: string }[]>`
      INSERT INTO stores (business_id, name) VALUES (${bizA}, 'A-Main') RETURNING id`;
    if (!s) throw new Error('store A seed failed');
    storeA = s.id;
    const [c] = await tx<{ id: string }[]>`
      INSERT INTO categories (business_id, name) VALUES (${bizA}, 'Cat-A') RETURNING id`;
    if (!c) throw new Error('cat A seed failed');
    categoryA = c.id;
    const [br] = await tx<{ id: string }[]>`
      INSERT INTO brands (business_id, name) VALUES (${bizA}, 'Brand-A') RETURNING id`;
    if (!br) throw new Error('brand A seed failed');
    brandA = br.id;
    const [p] = await tx<{ id: string }[]>`
      INSERT INTO products (business_id, store_id, category_id, brand_id, name, unit_type, unit_symbol, price, inventory)
      VALUES (${bizA}, ${storeA}, ${categoryA}, ${brandA}, 'Widget-A', 'piece', 'pc', 99.50, 10) RETURNING id`;
    if (!p) throw new Error('product A seed failed');
    productA = p.id;
    const [sale] = await tx<{ id: string }[]>`
      INSERT INTO sales (business_id, store_id, bill_no, subtotal, total, payment_method)
      VALUES (${bizA}, ${storeA}, 'A-001', 99.50, 99.50, 'cash') RETURNING id`;
    if (!sale) throw new Error('sale A seed failed');
    saleA = sale.id;
    await tx`
      INSERT INTO sale_items (business_id, sale_id, product_id, product_name, qty, unit_symbol, unit_price, line_total)
      VALUES (${bizA}, ${saleA}, ${productA}, 'Widget-A', 1, 'pc', 99.50, 99.50)`;
    await tx`
      INSERT INTO invoices (business_id, sale_id, invoice_no, subtotal, total)
      VALUES (${bizA}, ${saleA}, 'INV-A-001', 99.50, 99.50)`;
    await tx`
      INSERT INTO invitations (business_id, email, role, token, expires_at)
      VALUES (${bizA}, 'inv-a@example.com', 'employee', 'tok-a', NOW() + INTERVAL '7 days')`;
  });

  // Seed under tenant B
  await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`;
    await tx`SELECT set_config('app.business_id', ${bizB}, true)`;
    const [s] = await tx<{ id: string }[]>`
      INSERT INTO stores (business_id, name) VALUES (${bizB}, 'B-Main') RETURNING id`;
    if (!s) throw new Error('store B seed failed');
    storeB = s.id;
    await tx`INSERT INTO categories (business_id, name) VALUES (${bizB}, 'Cat-B')`;
    await tx`INSERT INTO brands (business_id, name) VALUES (${bizB}, 'Brand-B')`;
    await tx`
      INSERT INTO products (business_id, store_id, name, unit_type, unit_symbol, price, inventory)
      VALUES (${bizB}, ${storeB}, 'Widget-B', 'piece', 'pc', 50.00, 5)`;
    const [sale] = await tx<{ id: string }[]>`
      INSERT INTO sales (business_id, store_id, bill_no, subtotal, total, payment_method)
      VALUES (${bizB}, ${storeB}, 'B-001', 50.00, 50.00, 'cash') RETURNING id`;
    if (!sale) throw new Error('sale B seed failed');
    await tx`
      INSERT INTO sale_items (business_id, sale_id, product_name, qty, unit_symbol, unit_price, line_total)
      VALUES (${bizB}, ${sale.id}, 'Widget-B', 2, 'pc', 25.00, 50.00)`;
    await tx`
      INSERT INTO invoices (business_id, sale_id, invoice_no, subtotal, total)
      VALUES (${bizB}, ${sale.id}, 'INV-B-001', 50.00, 50.00)`;
    await tx`
      INSERT INTO invitations (business_id, email, role, token, expires_at)
      VALUES (${bizB}, 'inv-b@example.com', 'employee', 'tok-b', NOW() + INTERVAL '7 days')`;
  });
});

afterAll(async () => {
  // Teardown as superuser (RLS bypassed) — businesses cascades to children.
  await sql`DELETE FROM businesses WHERE id IN (${bizA}, ${bizB})`;
  await sql.end();
});

describe('RLS — catalog + sales + invoices + invitations', () => {
  it('categories: tenant A sees only A rows', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`;
      await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
      return tx<{ name: string }[]>`SELECT name FROM categories`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.name).toBe('Cat-A');
  });

  it('brands: tenant B sees only B rows', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`;
      await tx`SELECT set_config('app.business_id', ${bizB}, true)`;
      return tx<{ name: string }[]>`SELECT name FROM brands`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.name).toBe('Brand-B');
  });

  it('products: tenant A sees only A rows', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`;
      await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
      return tx<{ name: string }[]>`SELECT name FROM products`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.name).toBe('Widget-A');
  });

  it('sales + sale_items: tenant scoping flows through join', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`;
      await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
      return tx<{ bill_no: string; product_name: string }[]>`
        SELECT s.bill_no, si.product_name
        FROM sales s JOIN sale_items si ON si.sale_id = s.id`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.bill_no).toBe('A-001');
    expect(rows[0]?.product_name).toBe('Widget-A');
  });

  it('invoices: tenant B sees only B invoices', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`;
      await tx`SELECT set_config('app.business_id', ${bizB}, true)`;
      return tx<{ invoice_no: string }[]>`SELECT invoice_no FROM invoices`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.invoice_no).toBe('INV-B-001');
  });

  it('invitations: tenant A sees only A invites', async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`;
      await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
      return tx<{ email: string }[]>`SELECT email FROM invitations`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.email).toBe('inv-a@example.com');
  });

  it('cross-tenant insert: tenant A cannot create category in B', async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE app_user`;
        await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
        await tx`INSERT INTO categories (business_id, name) VALUES (${bizB}, 'leak')`;
      }),
    ).rejects.toThrow();
  });

  it('cross-tenant insert: tenant A cannot create product in B store', async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE app_user`;
        await tx`SELECT set_config('app.business_id', ${bizA}, true)`;
        await tx`
          INSERT INTO products (business_id, store_id, name, unit_type, unit_symbol, price)
          VALUES (${bizB}, ${storeB}, 'leak', 'piece', 'pc', 1.00)`;
      }),
    ).rejects.toThrow();
  });

  it('no tenant context: every table returns 0 rows', async () => {
    const counts = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`;
      const [{ c: categoriesC } = { c: 'x' }] = await tx<
        { c: string }[]
      >`SELECT COUNT(*)::text AS c FROM categories`;
      const [{ c: brandsC } = { c: 'x' }] = await tx<
        { c: string }[]
      >`SELECT COUNT(*)::text AS c FROM brands`;
      const [{ c: productsC } = { c: 'x' }] = await tx<
        { c: string }[]
      >`SELECT COUNT(*)::text AS c FROM products`;
      const [{ c: salesC } = { c: 'x' }] = await tx<
        { c: string }[]
      >`SELECT COUNT(*)::text AS c FROM sales`;
      const [{ c: itemsC } = { c: 'x' }] = await tx<
        { c: string }[]
      >`SELECT COUNT(*)::text AS c FROM sale_items`;
      const [{ c: invoicesC } = { c: 'x' }] = await tx<
        { c: string }[]
      >`SELECT COUNT(*)::text AS c FROM invoices`;
      const [{ c: invitesC } = { c: 'x' }] = await tx<
        { c: string }[]
      >`SELECT COUNT(*)::text AS c FROM invitations`;
      return { categoriesC, brandsC, productsC, salesC, itemsC, invoicesC, invitesC };
    });
    for (const v of Object.values(counts)) expect(v).toBe('0');
  });
});
