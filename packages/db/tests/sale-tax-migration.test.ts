import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const isolatedUrl = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const enabled = process.env.DATABASE_URL === isolatedUrl;
const sql = postgres(isolatedUrl, { max: 1 });
afterAll(async () => {
  await sql.end();
});

describe.skipIf(!enabled)('0021 compatibility on disposable pre-migration rows', () => {
  it('backfills only known facts, preserves unknowns and enforces balanced tax', async () => {
    const migration = await readFile(
      new URL('../migrations/0021_sale_tax_snapshot.sql', import.meta.url),
      'utf8',
    );
    await sql.begin(async (tx) => {
      // Session-local tables shadow public tables: no existing schema/data is altered.
      await tx`CREATE TEMP TABLE sales (id int, business_id int, bill_type text, tax_total numeric(12,2)) ON COMMIT DROP`;
      await tx`CREATE TEMP TABLE invoices (sale_id int, business_id int, business_gstin text, is_interstate boolean, cgst numeric(12,2), sgst numeric(12,2), igst numeric(12,2)) ON COMMIT DROP`;
      await tx`INSERT INTO sales VALUES (1,1,'gst_bill',18), (2,1,'gst_bill',18), (3,1,'non_gst_bill',0), (4,1,'estimate',0), (5,1,'gst_bill',18), (6,1,'gst_bill',0), (7,1,'gst_bill',18)`;
      await tx`INSERT INTO invoices VALUES (1,1,'27AAAAA0000A1Z5',true,0,0,18), (5,1,'27AAAAA0000A1Z5',false,8,8,0), (7,2,'27AAAAA0000A1Z5',true,0,0,18)`;
      await tx.unsafe(migration);
      const rows = await tx`SELECT * FROM sales ORDER BY id`;
      expect(rows[0]).toMatchObject({
        gst_enabled_at_sale: true,
        business_gstin_at_sale: '27AAAAA0000A1Z5',
        is_interstate: true,
        igst: '18.00',
        cgst: '0.00',
      });
      for (const index of [1, 4, 5, 6])
        expect(rows[index]).toMatchObject({
          gst_enabled_at_sale: null,
          is_interstate: null,
          cgst: null,
          sgst: null,
          igst: null,
        });
      for (const index of [2, 3])
        expect(rows[index]).toMatchObject({
          gst_enabled_at_sale: false,
          is_interstate: false,
          cgst: '0.00',
          sgst: '0.00',
          igst: '0.00',
        });
      await expect(
        tx.savepoint(async (sp) => {
          await sp`UPDATE sales SET igst = 17 WHERE id = 1`;
        }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        tx.savepoint(async (sp) => {
          await sp`UPDATE sales SET cgst = 0 WHERE id = 2`;
        }),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});
