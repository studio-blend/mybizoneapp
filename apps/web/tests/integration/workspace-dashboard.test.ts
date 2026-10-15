import { randomUUID } from 'node:crypto';
import { loadWorkspaceDashboard } from '@/lib/workspace-dashboard';
import { createDb } from '@mybizone/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const enabled = process.env.DATABASE_URL === url;
const db = createDb(url);
const ids = {
  business: randomUUID(),
  bait: randomUUID(),
  a: randomUUID(),
  b: randomUUID(),
  baitStore: randomUUID(),
  a1: randomUUID(),
  a2: randomUUID(),
  b1: randomUUID(),
  p1: randomUUID(),
  p2: randomUUID(),
  p3: randomUUID(),
  baitProduct: randomUUID(),
  s1: randomUUID(),
  s2: randomUUID(),
  baitSale: randomUUID(),
  customer: randomUUID(),
  ret: randomUUID(),
};
const now = new Date('2026-10-15T02:00:00Z');
describe.skipIf(!enabled)('workspace dashboard on isolated PostgreSQL', () => {
  beforeAll(async () => {
    const [directory] = await db.$client`SHOW data_directory`;
    if (!directory?.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'))
      throw new Error('Unexpected test cluster');
    await db.$client.begin(async (tx) => {
      await tx`INSERT INTO businesses(id,name,plan) VALUES (${ids.business},'Dashboard scope regression','pro'),(${ids.bait},'Dashboard unrelated business','pro')`;
      await tx`INSERT INTO stores(id,business_id,name) VALUES (${ids.a},${ids.business},'Central'),(${ids.b},${ids.business},'North'),(${ids.baitStore},${ids.bait},'Unrelated')`;
      await tx`UPDATE businesses SET business_profile='electronics',selling_model='both' WHERE id=${ids.business}`;
      await tx`UPDATE stores SET business_profile='furniture' WHERE id=${ids.a}`;
      await tx`INSERT INTO departments(id,business_id,store_id,name) VALUES (${ids.a1},${ids.business},${ids.a},'Living'),(${ids.a2},${ids.business},${ids.a},'Bedroom'),(${ids.b1},${ids.business},${ids.b},'Office')`;
      await tx`INSERT INTO products(id,business_id,store_id,department_id,name,unit_type,unit_symbol,price,cost_price,inventory,min_stock) VALUES
        (${ids.p1},${ids.business},${ids.a},${ids.a1},'Department A product','piece','pc',100,50,10,12),
        (${ids.p2},${ids.business},${ids.a},${ids.a2},'Hidden department product','piece','pc',900,600,20,2),
        (${ids.p3},${ids.business},${ids.b},${ids.b1},'Other store product','piece','pc',200,80,30,2),
        (${ids.baitProduct},${ids.bait},${ids.baitStore},NULL,'Other tenant product','piece','pc',9999,1,500,2)`;
      await tx`INSERT INTO customers(id,business_id,name,outstanding_balance) VALUES (${ids.customer},${ids.business},'Private customer',777)`;
      await tx`INSERT INTO sales(id,business_id,store_id,customer_id,customer_name,bill_no,subtotal,discount,total,payment_method,bill_type,created_at) VALUES
        (${ids.s1},${ids.business},${ids.a},${ids.customer},'Private customer','SCOPE-A',1100,100,1000,'cash','non_gst_bill','2026-10-12T10:00:00+05:30'),
        (${ids.s2},${ids.business},${ids.b},NULL,NULL,'SCOPE-B',200,0,200,'cash','non_gst_bill','2026-10-12T10:00:00+05:30'),
        (${ids.baitSale},${ids.bait},${ids.baitStore},NULL,NULL,'BAIT',9999,0,9999,'cash','non_gst_bill','2026-10-12T10:00:00+05:30')`;
      await tx`INSERT INTO sale_items(business_id,sale_id,product_id,product_name,qty,unit_symbol,unit_price,line_total,cost_price_at_sale,is_free_item) VALUES
        (${ids.business},${ids.s1},${ids.p1},'Department A product',1,'pc',100,100,50,false),
        (${ids.business},${ids.s1},${ids.p1},'Department A product',1,'pc',100,0,50,true),
        (${ids.business},${ids.s1},${ids.p2},'Hidden department product',1,'pc',900,900,600,false),
        (${ids.business},${ids.s2},${ids.p3},'Other store product',1,'pc',200,200,80,false),
        (${ids.bait},${ids.baitSale},${ids.baitProduct},'Other tenant product',1,'pc',9999,9999,1,false)`;
      await tx`INSERT INTO sales_returns(id,business_id,original_sale_id,return_no,subtotal,total,created_at) VALUES (${ids.ret},${ids.business},${ids.s1},'SCOPE-RET',100,100,'2026-10-13T10:00:00+05:30')`;
      await tx`INSERT INTO return_items(return_id,product_id,product_name,qty,unit_symbol,unit_price,line_total,cost_price_at_sale) VALUES (${ids.ret},${ids.p1},'Department A product',1,'pc',100,100,50)`;
      await tx`UPDATE sales SET payment_status='due',due_date='2026-10-01' WHERE id=${ids.s1}`;
      const purchaseId = randomUUID();
      await tx`INSERT INTO purchases(id,business_id,supplier_name,bill_no,subtotal,total,payment_method,purchase_date) VALUES (${purchaseId},${ids.business},'Dashboard fixture supplier','SCOPE-PUR',50,50,'cash','2026-10-01T10:00:00+05:30')`;
      await tx`INSERT INTO purchase_items(purchase_id,product_id,product_name,qty,unit_symbol,unit_price,line_total) VALUES (${purchaseId},${ids.p1},'Department A product',1,'pc',50,50)`;
    });
  });
  afterAll(async () => {
    try {
      await db.$client.begin(async (tx) => {
        await tx`DELETE FROM sales_returns WHERE business_id IN (${ids.business},${ids.bait})`;
        await tx`DELETE FROM sales WHERE business_id IN (${ids.business},${ids.bait})`;
        await tx`DELETE FROM products WHERE business_id IN (${ids.business},${ids.bait})`;
        await tx`DELETE FROM departments WHERE business_id IN (${ids.business},${ids.bait})`;
        await tx`DELETE FROM businesses WHERE id IN (${ids.business},${ids.bait})`;
      });
    } finally {
      await db.$client.end({ timeout: 5 });
    }
  });
  it('nets returns, includes free-item costs and isolates other tenants', async () => {
    const result = await loadWorkspaceDashboard(
      db,
      ids.business,
      [{ role: 'super_admin' }],
      {},
      now,
    );
    expect(result.sales).toMatchObject({ revenue: 1100, orders: 2, cogs: 730, returns: 100 });
    expect(result.insights.profit.find((row) => row.id === ids.p1)).toMatchObject({
      revenue: 0,
      profit: -50,
    });
    expect(result.insights.profit.find((row) => row.id === ids.p2)).toMatchObject({
      revenue: 900,
      profit: 300,
    });
    expect(result.insights.profit.reduce((sum, row) => sum + (row.profit ?? 0), 0)).toBe(370);
    expect(result.performance.find((row) => row.id === ids.a)).toMatchObject({
      revenue: 900,
      profit: 250,
      previousRevenue: 0,
    });
    expect(result.profile.mixed).toBe(true);
    expect(result.inventory.products).toBe(3);
    expect(result.ledger?.receivables).toBe(777);
    expect(result.performance.reduce((sum, store) => sum + store.revenue, 0)).toBe(1100);
    expect(result.trend).toHaveLength(15);
    expect(result.trend.find((day) => day.date === '2026-10-01')?.revenue).toBe(0);
    expect(result.trend.find((day) => day.date === '2026-10-12')?.revenue).toBe(1200);
    expect(result.trend.find((day) => day.date === '2026-10-13')?.revenue).toBe(-100);
    expect(JSON.stringify(result)).not.toContain('Other tenant');
  });
  it('restricts branch data and withholds shared ledger balances', async () => {
    const result = await loadWorkspaceDashboard(
      db,
      ids.business,
      [{ role: 'branch_manager', storeId: ids.a }],
      {},
      now,
    );
    expect(result.sales).toMatchObject({ revenue: 900, orders: 1, cogs: 650 });
    expect(result.inventory.products).toBe(2);
    expect(result.ledger).toBeNull();
    expect(result.access.stores.map((store) => store.id)).toEqual([ids.a]);
    expect(result.profile).toMatchObject({
      businessProfile: 'furniture',
      sellingModel: 'both',
      mixed: false,
    });
    expect(JSON.stringify(result)).not.toContain('Other store product');
  });
  it('limits mixed bills to department lines without exposing costs, customer names or full-bill links', async () => {
    const result = await loadWorkspaceDashboard(
      db,
      ids.business,
      [{ role: 'floor_manager', storeId: ids.a, departmentId: ids.a1 }],
      {},
      now,
    );
    expect(result.sales).toMatchObject({ revenue: 0, orders: 1, cogs: 0 });
    expect(result.inventory).toMatchObject({ products: 1, value: 0 });
    expect(result.recent[0]).toMatchObject({ total: 100, id: null, number: null, customer: null });
    expect(result.stock.map((p) => p.id)).toEqual([ids.p1]);
    expect(result.movements).toMatchObject([
      { name: 'Department A product', kind: 'Received', quantity: 1 },
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Hidden department product');
    expect(serialized).not.toContain('Private customer');
    expect(result.ledger).toBeNull();
    expect(result.insights.profit).toEqual([]);
    expect(result.insights.slow.every((row) => row.value === null)).toBe(true);
  });
  it('does not fetch financial or sales payloads for an inventory-only user', async () => {
    const result = await loadWorkspaceDashboard(
      db,
      ids.business,
      [{ role: 'inventory', storeId: ids.b }],
      {},
      now,
    );
    expect(result.access.view).toBe('inventory');
    expect(result.stock.map((p) => p.id)).toEqual([ids.p3]);
    expect(result.sales.revenue).toBe(0);
    expect(result.inventory.value).toBe(0);
    expect(result.recent).toEqual([]);
    expect(result.ledger).toBeNull();
  });
  it('rejects cross-store and unauthorized-workspace selections before aggregation', async () => {
    await expect(
      loadWorkspaceDashboard(
        db,
        ids.business,
        [{ role: 'branch_manager', storeId: ids.a }],
        { storeId: ids.b },
        now,
      ),
    ).rejects.toThrow(/outside your access/);
    await expect(
      loadWorkspaceDashboard(
        db,
        ids.business,
        [{ role: 'inventory', storeId: ids.a }],
        { view: 'accounts' },
        now,
      ),
    ).rejects.toThrow(/outside your access/);
  });
  it('keeps old unpaid bills in the attention queue when the activity period is today', async () => {
    const result = await loadWorkspaceDashboard(
      db,
      ids.business,
      [{ role: 'branch_manager', storeId: ids.a }],
      { range: 'today' },
      now,
    );
    expect(result.sales.orders).toBe(0);
    expect(result.sales.unsettled).toBe(1);
    expect(result.sales.overdue).toBe(1);
  });
  it('uses per-store slow-stock thresholds and excludes newly created products', async () => {
    const durable = randomUUID();
    const electronics = randomUUID();
    const fresh = randomUUID();
    await db.$client`INSERT INTO products(id,business_id,store_id,name,unit_type,unit_symbol,price,cost_price,inventory,created_at) VALUES
      (${durable},${ids.business},${ids.a},'Durable no sales','piece','pc',100,50,5,'2026-08-01T00:00:00+05:30'),
      (${electronics},${ids.business},${ids.b},'Older electronics no sales','piece','pc',100,50,5,'2026-08-01T00:00:00+05:30'),
      (${fresh},${ids.business},${ids.b},'New electronics','piece','pc',100,50,5,'2026-10-14T00:00:00+05:30')`;
    const result = await loadWorkspaceDashboard(
      db,
      ids.business,
      [{ role: 'super_admin' }],
      { range: 'today' },
      now,
    );
    expect(result.insights.slow.map((row) => row.id)).toEqual([electronics]);
    expect(result.insights.slow[0]).toMatchObject({ value: 250, slowDays: 60, lastSale: null });
    const restricted = await loadWorkspaceDashboard(
      db,
      ids.business,
      [{ role: 'inventory', storeId: ids.b }],
      {},
      now,
    );
    expect(restricted.insights.slow[0]).toMatchObject({ id: electronics, value: null });
    expect(JSON.stringify(restricted)).not.toContain('Durable no sales');
  });
  it('requires sufficient history for stock cover and includes free quantities', async () => {
    await db.$client`UPDATE products SET created_at='2026-09-01T00:00:00+05:30' WHERE id IN (${ids.p1},${ids.p2},${ids.p3})`;
    const result = await loadWorkspaceDashboard(
      db,
      ids.business,
      [{ role: 'super_admin' }],
      {},
      now,
    );
    expect(result.insights.cover.find((row) => row.id === ids.p1)?.daysRemaining).toBe(150);
    expect(result.insights.cover.find((row) => row.id === ids.p3)?.daysRemaining).toBe(900);
  });
  it('withholds profit when a return cost snapshot is missing', async () => {
    await db.$client`UPDATE return_items SET cost_price_at_sale=NULL WHERE return_id=${ids.ret}`;
    try {
      const result = await loadWorkspaceDashboard(
        db,
        ids.business,
        [{ role: 'super_admin' }],
        {},
        now,
      );
      expect(result.insights.profit.find((row) => row.id === ids.p1)).toMatchObject({
        profit: null,
        missingCosts: 1,
      });
      expect(result.performance.find((row) => row.id === ids.a)?.profit).toBeNull();
      expect(result.sales.missingCosts).toBe(1);
    } finally {
      await db.$client`UPDATE return_items SET cost_price_at_sale=50 WHERE return_id=${ids.ret}`;
    }
  });
});
