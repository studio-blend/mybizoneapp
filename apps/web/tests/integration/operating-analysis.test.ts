import { randomUUID } from 'node:crypto';
import { loadOperatingAnalysis } from '@/lib/operating-analysis';
import { getProfitLoss } from '@/lib/reports/profit-loss';
import { loadWorkspaceDashboard } from '@/lib/workspace-dashboard';
import { createDb } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const url = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const db = createDb(url);
const now = new Date('2026-10-16T10:00:00+05:30');
const keys = [
  'business',
  'bait',
  'a',
  'b',
  'baitStore',
  'a1',
  'a2',
  'b1',
  'p1',
  'p2',
  'p3',
  'baitProduct',
  'sale',
  'saleB',
  'oldSale',
  'voidSale',
  'estimate',
  'baitSale',
  'ret',
  'oldRet',
  'voidRet',
  'customer',
  'customerB',
  'zeroCustomer',
  'baitCustomer',
] as const;
const ids = Object.fromEntries(keys.map((key) => [key, randomUUID()])) as Record<
  (typeof keys)[number],
  string
>;
describe.skipIf(process.env.DATABASE_URL !== url)(
  'operating analysis on isolated PostgreSQL',
  () => {
    beforeAll(async () => {
      const [directory] = await db.$client`SHOW data_directory`;
      if (!directory?.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'))
        throw new Error('Unexpected test cluster');
      await db.$client.begin(async (tx) => {
        await tx`INSERT INTO businesses(id,name,plan) VALUES (${ids.business},'Operating analysis fixture','pro'),(${ids.bait},'Unrelated operating tenant','pro')`;
        await tx`INSERT INTO stores(id,business_id,name) VALUES (${ids.a},${ids.business},'Operating Central'),(${ids.b},${ids.business},'Operating North'),(${ids.baitStore},${ids.bait},'Unrelated operating store')`;
        await tx`INSERT INTO departments(id,business_id,store_id,name) VALUES (${ids.a1},${ids.business},${ids.a},'Living'),(${ids.a2},${ids.business},${ids.a},'Bedroom'),(${ids.b1},${ids.business},${ids.b},'Office')`;
        await tx`INSERT INTO products(id,business_id,store_id,department_id,name,unit_type,unit_symbol,price,cost_price,inventory) VALUES
        (${ids.p1},${ids.business},${ids.a},${ids.a1},'Operating chair','piece','pc',100,999,10),
        (${ids.p2},${ids.business},${ids.a},${ids.a2},'Hidden operating bed','piece','pc',200,999,20),
        (${ids.p3},${ids.business},${ids.b},${ids.b1},'Other operating store product','piece','pc',100,999,30),
        (${ids.baitProduct},${ids.bait},${ids.baitStore},NULL,'Unrelated operating product','piece','pc',9999,1,100)`;
        await tx`INSERT INTO customers(id,business_id,name,outstanding_balance,credit_limit) VALUES
        (${ids.customer},${ids.business},'Private operating customer',300,200),
        (${ids.customerB},${ids.business},'Largest operating balance',600,0),
        (${ids.zeroCustomer},${ids.business},'No operating debt',0,0),
        (${ids.baitCustomer},${ids.bait},'Unrelated operating customer',99999,0)`;
        await tx`INSERT INTO sales(id,business_id,store_id,customer_id,bill_no,subtotal,discount,tax_total,total,payment_method,bill_type,status,created_at) VALUES
        (${ids.sale},${ids.business},${ids.a},${ids.customer},'PRIVATE-OPERATING-BILL',500,120,68.40,448.40,'cash','gst_bill','completed','2026-10-12T10:00:00+05:30'),
        (${ids.saleB},${ids.business},${ids.b},NULL,'OTHER-OPERATING-BILL',100,0,18,118,'cash','gst_bill','completed','2026-10-11T20:15:00Z'),
        (${ids.oldSale},${ids.business},${ids.a},${ids.customer},'OLD-OPERATING-BILL',100,0,18,118,'cash','gst_bill','completed','2026-09-30T10:00:00+05:30'),
        (${ids.voidSale},${ids.business},${ids.a},NULL,'VOID-OPERATING-BILL',9999,0,0,9999,'cash','non_gst_bill','voided','2026-10-12T10:00:00+05:30'),
        (${ids.estimate},${ids.business},${ids.a},NULL,'EST-OPERATING-BILL',9999,0,0,9999,'cash','estimate','completed','2026-10-12T10:00:00+05:30'),
        (${ids.baitSale},${ids.bait},${ids.baitStore},${ids.baitCustomer},'BAIT-OPERATING-BILL',9999,0,0,9999,'cash','non_gst_bill','completed','2026-10-12T10:00:00+05:30')`;
        await tx`INSERT INTO sale_items(business_id,sale_id,product_id,product_name,qty,unit_symbol,unit_price,line_total,gst_amount,cost_price_at_sale,is_free_item) VALUES
        (${ids.business},${ids.sale},${ids.p1},'Operating chair',2,'pc',100,212.40,32.40,60,false),
        (${ids.business},${ids.sale},${ids.p1},'Operating chair',1,'pc',100,0,0,60,true),
        (${ids.business},${ids.sale},${ids.p2},'Hidden operating bed',1,'pc',200,236,36,100,false),
        (${ids.business},${ids.saleB},${ids.p3},'Other operating store product',1,'pc',100,118,18,20,false),
        (${ids.business},${ids.oldSale},${ids.p1},'Operating chair',1,'pc',100,118,18,60,false),
        (${ids.business},${ids.voidSale},${ids.p1},'Void should be excluded',1,'pc',9999,9999,0,NULL,false),
        (${ids.business},${ids.estimate},${ids.p1},'Estimate should be excluded',1,'pc',9999,9999,0,NULL,false),
        (${ids.bait},${ids.baitSale},${ids.baitProduct},'Unrelated operating product',1,'pc',9999,9999,0,1,false)`;
        await tx`INSERT INTO sales_returns(id,business_id,original_sale_id,return_no,subtotal,tax_total,total,status,created_at) VALUES
        (${ids.ret},${ids.business},${ids.sale},'OPERATING-RETURN',60,10.80,70.80,'completed','2026-10-13T10:00:00+05:30'),
        (${ids.oldRet},${ids.business},${ids.oldSale},'OPERATING-OLD-RETURN',100,18,118,'completed','2026-10-14T10:00:00+05:30'),
        (${ids.voidRet},${ids.business},${ids.sale},'OPERATING-VOID-RETURN',999,0,999,'voided','2026-10-14T10:00:00+05:30')`;
        await tx`INSERT INTO return_items(return_id,product_id,product_name,qty,unit_symbol,unit_price,line_total,gst_amount,cost_price_at_sale) VALUES
        (${ids.ret},${ids.p1},'Operating chair',1,'pc',100,70.80,10.80,60),
        (${ids.oldRet},${ids.p1},'Operating chair',1,'pc',100,118,18,60),
        (${ids.voidRet},${ids.p1},'Voided return should be excluded',1,'pc',999,999,0,NULL)`;
        await tx`INSERT INTO damage_logs(business_id,product_id,product_name,qty,unit_symbol,cost_per_unit,total_value,reason,logged_at) VALUES
        (${ids.business},${ids.p1},'Operating chair',2,'pc',60,120,'damaged','2026-10-13T10:00:00+05:30'),
        (${ids.business},${ids.p1},'Operating chair',1,'pc',60,NULL,'spillage','2026-10-13T11:00:00+05:30'),
        (${ids.business},${ids.p2},'Hidden operating bed',1,'pc',NULL,NULL,'theft','2026-10-13T12:00:00+05:30'),
        (${ids.business},${ids.p3},'Other operating store product',1,'pc',20,20,'damaged','2026-10-13T13:00:00+05:30'),
        (${ids.business},NULL,'Archived operating product',1,'pc',10,10,'other','2026-10-13T14:00:00+05:30'),
        (${ids.bait},${ids.baitProduct},'Unrelated operating damage',1,'pc',1,1,'other','2026-10-13T14:00:00+05:30')`;
        await tx`INSERT INTO sales_settlements(business_id,customer_id,amount,payment_method,settled_at) VALUES
        (${ids.business},${ids.customer},10,'cash','2026-08-01T10:00:00+05:30'),
        (${ids.business},${ids.customer},20,'cash','2026-10-05T10:00:00+05:30'),
        (${ids.business},${ids.customer},99,'cash','2026-10-31T10:00:00+05:30')`;
      });
    });
    afterAll(async () => {
      try {
        await db.$client.begin(async (tx) => {
          await tx`DELETE FROM sales_settlements WHERE business_id IN (${ids.business},${ids.bait})`;
          await tx`DELETE FROM sales_returns WHERE business_id IN (${ids.business},${ids.bait})`;
          await tx`DELETE FROM sales WHERE business_id IN (${ids.business},${ids.bait})`;
          await tx`DELETE FROM damage_logs WHERE business_id IN (${ids.business},${ids.bait})`;
          await tx`DELETE FROM products WHERE business_id IN (${ids.business},${ids.bait})`;
          await tx`DELETE FROM departments WHERE business_id IN (${ids.business},${ids.bait})`;
          await tx`DELETE FROM businesses WHERE id IN (${ids.business},${ids.bait})`;
        });
      } finally {
        await db.$client.end({ timeout: 5 });
      }
    });
    it('excludes GST, includes free costs and nets returns of older invoices consistently with the master dashboard', async () => {
      const result = await loadOperatingAnalysis(
        db,
        ids.business,
        [{ role: 'super_admin' }],
        {},
        now,
      );
      expect(result.summary.revenue).toBeCloseTo(377.6);
      expect(result.summary.profit).toBeCloseTo(140);
      expect(result.summary.returns).toBeCloseTo(188.8);
      expect(result.summary.bills).toBe(2);
      expect(result.previous.profit).toBe(40);
      expect(result.trend).toHaveLength(16);
      expect(result.trend.find((row) => row.date === '2026-10-14')).toMatchObject({
        revenue: -118,
        profit: -40,
      });
      expect(result.trend.find((row) => row.date === '2026-10-01')).toMatchObject({
        revenue: 0,
        profit: 0,
      });
      const master = await loadWorkspaceDashboard(
        db,
        ids.business,
        [{ role: 'super_admin' }],
        {},
        now,
      );
      expect(master.sales.revenue - master.sales.tax - master.sales.cogs).toBeCloseTo(140);
      expect(master.performance.reduce((sum, row) => sum + (row.profit ?? 0), 0)).toBeCloseTo(140);
      expect(master.insights.profit.reduce((sum, row) => sum + (row.profit ?? 0), 0)).toBeCloseTo(
        140,
      );
      expect(master.trend.find((row) => row.date === '2026-10-14')?.profit).toBe(-40);
      const report = await withTenant(db, ids.business, (tx) =>
        getProfitLoss(tx, ids.business, result.period.start, result.period.end),
      );
      expect(report.revenue - report.returns - report.cogs).toBeCloseTo(result.summary.profit ?? 0);
      const serialized = JSON.stringify(result);
      for (const forbidden of [
        'Unrelated operating',
        'Void should',
        'Estimate should',
        'Voided return',
      ])
        expect(serialized).not.toContain(forbidden);
    });
    it('counts scoped bills once and uses India weekdays/hours at UTC boundaries', async () => {
      const result = await loadOperatingAnalysis(
        db,
        ids.business,
        [{ role: 'super_admin' }],
        { weekday: '1', hour: '10' },
        now,
      );
      expect(result.busy).toEqual([
        { weekday: 1, hour: 1, bills: 1, revenue: 118 },
        { weekday: 1, hour: 10, bills: 1, revenue: 448.4 },
      ]);
      expect(result.occurrences[0]).toBe(2);
      expect(result.occurrences[4]).toBe(3);
      expect(result.bills).toHaveLength(1);
      expect(result.bills[0]).toMatchObject({
        id: ids.sale,
        number: 'PRIVATE-OPERATING-BILL',
        revenue: 448.4,
      });
      expect(result.summary.bills).toBe(2);
    });
    it('separates discounts, free items, refunds and partially valued damage without double-counting', async () => {
      const result = await loadOperatingAnalysis(
        db,
        ids.business,
        [{ role: 'super_admin' }],
        {},
        now,
      );
      expect(result.adjustments.summary.find((row) => row.kind === 'discount')).toMatchObject({
        amount: 20,
        records: 1,
      });
      expect(result.adjustments.summary.find((row) => row.kind === 'free')).toMatchObject({
        amount: 100,
        records: 1,
      });
      expect(result.adjustments.summary.find((row) => row.kind === 'return')?.amount).toBeCloseTo(
        188.8,
      );
      expect(result.adjustments.summary.find((row) => row.kind === 'damage')).toMatchObject({
        amount: 210,
        missingValues: 1,
        records: 5,
      });
      expect(
        result.adjustments.products.find((row) => row.kind === 'damage' && row.id === ids.p1),
      ).toMatchObject({ amount: 180, quantity: 3, missingValues: 0 });
    });
    it('prioritizes current balances independent of activity dates and does not invent invoice ageing', async () => {
      const result = await loadOperatingAnalysis(
        db,
        ids.business,
        [{ role: 'super_admin' }],
        { range: 'today' },
        now,
      );
      expect(result.summary.bills).toBe(0);
      expect(result.collections.map((row) => row.id)).toEqual([ids.customerB, ids.customer]);
      expect(result.collections[1]).toMatchObject({ balance: 300, creditLimit: 200 });
      expect(result.collections[1]?.lastCollection).toContain('2026-10-05');
      expect(result.collections[0]?.lastCollection).toBeNull();
    });
    it('limits department payloads to assigned lines and never returns costs, customer balances or full bill IDs', async () => {
      const result = await loadOperatingAnalysis(
        db,
        ids.business,
        [{ role: 'floor_manager', storeId: ids.a, departmentId: ids.a1 }],
        {},
        now,
      );
      expect(result.summary.revenue).toBeCloseTo(23.6);
      expect(result.summary.profit).toBeNull();
      expect(result.trend.every((row) => !('profit' in row))).toBe(true);
      expect(result.bills[0]).toMatchObject({ id: null, number: null, revenue: 212.4 });
      expect(result.collections).toEqual([]);
      expect(result.adjustments.summary.find((row) => row.kind === 'damage')).toMatchObject({
        amount: null,
        records: 2,
      });
      for (const name of [
        'Hidden operating',
        'Other operating store',
        'Private operating customer',
        'PRIVATE-OPERATING-BILL',
        'Archived operating',
      ])
        expect(JSON.stringify(result)).not.toContain(name);
    });
    it('restricts branch financial data and inventory-only users to their own scope', async () => {
      const branch = await loadOperatingAnalysis(
        db,
        ids.business,
        [{ role: 'branch_manager', storeId: ids.a }],
        {},
        now,
      );
      expect(branch.summary.profit).toBeCloseTo(60);
      expect(branch.collections).toEqual([]);
      expect(JSON.stringify(branch)).not.toContain('Other operating store');
      const inventory = await loadOperatingAnalysis(
        db,
        ids.business,
        [{ role: 'inventory', storeId: ids.b }],
        {},
        now,
      );
      expect(inventory.hasSales).toBe(false);
      expect(inventory.busy).toEqual([]);
      expect(inventory.bills).toEqual([]);
      expect(inventory.trend).toEqual([]);
      expect(inventory.adjustments.products).toMatchObject([
        { name: 'Other operating store product', kind: 'damage', amount: null, quantity: 1 },
      ]);
      expect(inventory.summary.profit).toBeNull();
      expect(inventory.adjustments.summary.map((row) => row.kind)).toEqual(['damage']);
    });
    it('uses workspace-specific grants for multi-role staff and rejects tampered scopes and slots', async () => {
      const roles = [
        { role: 'sales' as const, storeId: ids.a },
        { role: 'inventory' as const, storeId: ids.b },
      ];
      await expect(
        loadOperatingAnalysis(db, ids.business, roles, { view: 'sales', storeId: ids.b }, now),
      ).rejects.toThrow(/outside your access/);
      const result = await loadOperatingAnalysis(
        db,
        ids.business,
        roles,
        { view: 'inventory' },
        now,
      );
      expect(result.adjustments.products.map((row) => row.id)).toEqual([ids.p3]);
      await expect(
        loadOperatingAnalysis(
          db,
          ids.business,
          [{ role: 'sales', storeId: ids.a }],
          { view: 'accounts' },
          now,
        ),
      ).rejects.toThrow(/outside your access/);
      await expect(
        loadOperatingAnalysis(db, ids.business, [{ role: 'super_admin' }], { hour: '24' }, now),
      ).rejects.toThrow(/valid weekday and hour/);
      await expect(
        loadOperatingAnalysis(db, ids.business, [{ role: 'marketing' }], {}, now),
      ).rejects.toThrow(/customer workspace/);
    });
    it('leaves profit gaps for missing return costs instead of treating them as zero', async () => {
      await db.$client`UPDATE return_items SET cost_price_at_sale=NULL WHERE return_id=${ids.oldRet}`;
      try {
        const result = await loadOperatingAnalysis(
          db,
          ids.business,
          [{ role: 'super_admin' }],
          {},
          now,
        );
        expect(result.summary.profit).toBeNull();
        expect(result.summary.missingCosts).toBe(1);
        expect(result.trend.find((row) => row.date === '2026-10-14')?.profit).toBeNull();
        const master = await loadWorkspaceDashboard(
          db,
          ids.business,
          [{ role: 'super_admin' }],
          {},
          now,
        );
        expect(master.trend.find((row) => row.date === '2026-10-14')?.profit).toBeNull();
      } finally {
        await db.$client`UPDATE return_items SET cost_price_at_sale=60 WHERE return_id=${ids.oldRet}`;
      }
    });
  },
);
