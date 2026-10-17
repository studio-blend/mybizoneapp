// Financial writes run only on the guarded disposable local cluster.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const { chromium } = createRequire(new URL('apps/web/package.json', root))('@playwright/test');
const postgres = createRequire(new URL('packages/db/package.json', root))('postgres');
const url = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
assert.equal(process.env.DATABASE_URL, url);
const db = postgres(url, { max: 1 });
const owner = JSON.parse(
  readFileSync(new URL('.local/test-accounts/pro-owner.json', root), 'utf8'),
);
const seed = JSON.parse(
  readFileSync(new URL('.local/test-accounts/four-store-seed.json', root), 'utf8'),
);
const origin = 'http://localhost:3015';
const customerId = randomUUID();
const supplierId = randomUUID();
const productId = randomUUID();
const saleId = randomUUID();
const cashSaleId = randomUUID();
const purchaseId = randomUUID();
const suffix = customerId.slice(0, 8);
const billNo = `FUNDS-${suffix}`;
const cashNo = `REFUND-${suffix}`;
const purchaseNo = `PREPAY-${suffix}`;
const shots = new URL('.cache/funds-screenshots/', root);
mkdirSync(shots, { recursive: true });
const result = { checks: [], passed: false };
let browser;
let page;
let businessId;
let baseline;
const tables = [
  'customers',
  'suppliers',
  'products',
  'sales',
  'sale_items',
  'purchases',
  'purchase_items',
  'sales_returns',
  'return_items',
  'purchase_returns',
  'purchase_return_items',
  'sales_settlements',
  'purchase_settlements',
  'sales_settlement_allocations',
  'purchase_settlement_allocations',
  'accounting_events',
];
const snapshot = () =>
  db.unsafe(
    tables
      .map(
        (t) =>
          `SELECT '${t}' AS name,count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) AS hash FROM ${t} t`,
      )
      .join(' UNION ALL '),
  );
const debt = async (side = 'sales') => {
  const [p] =
    side === 'sales'
      ? await db`SELECT outstanding_balance AS amount FROM customers WHERE id=${customerId}`
      : await db`SELECT outstanding_balance AS amount FROM suppliers WHERE id=${supplierId}`;
  return p.amount;
};
async function mobile(name) {
  await page.setViewportSize({ width: 360, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  for (const label of ['Action', 'Evidence / reason']) {
    const box = await page.getByLabel(label, { exact: true }).boundingBox();
    assert(box && box.width >= 220);
  }
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, shots)), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
const labels = {
  advance: 'Record advance',
  advance_apply: 'Apply advance to bill',
  advance_refund: 'Refund unused advance',
  return_refund: 'Record return refund',
  settlement_reverse: 'Reverse settlement',
  allocation_reverse: 'Reverse bill allocation',
  money_reverse: 'Reverse advance / refund',
};
async function command(kind, { side = 'sales', sourceId, amount = '40', billId, reference } = {}) {
  await page.goto(`${origin}/settlements/funds?tab=${side}`);
  await page.getByLabel('Action', { exact: true }).selectOption(kind);
  if (kind === 'advance')
    await page
      .getByLabel(side === 'sales' ? 'Customer' : 'Supplier', { exact: true })
      .selectOption(side === 'sales' ? customerId : supplierId);
  else await page.getByLabel('Source record', { exact: true }).selectOption(sourceId);
  if (kind === 'advance_apply')
    await page.getByLabel('Credit bill', { exact: true }).selectOption(billId);
  const correction = kind.endsWith('_reverse');
  if (!correction) await page.getByLabel('Amount ₹', { exact: true }).fill(amount);
  if (['advance', 'advance_refund', 'return_refund'].includes(kind)) {
    await page.getByLabel('Payment method', { exact: true }).selectOption('cash');
    await page
      .getByLabel('Reference (optional)', { exact: true })
      .fill(reference ?? `${kind}-${suffix}`);
  }
  await page
    .getByLabel('Evidence / reason', { exact: true })
    .fill(`Funds acceptance ${suffix}: confirmed original record`);
  if (correction) await page.getByRole('checkbox').check();
  const button = page.getByRole('button', { name: labels[kind], exact: true });
  await button.waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled);
  await Promise.all([
    page.waitForURL((u) => u.pathname === '/settlements/funds' && !!u.searchParams.get('saved')),
    button.click(),
  ]);
  await page.locator('output').filter({ hasText: 'Saved:' }).waitFor();
  return new URL(page.url()).searchParams.get('saved');
}
async function advanceAvailable(id) {
  const [r] = await db`SELECT amount FROM accounting_events WHERE id=${id}`;
  const events =
    await db`SELECT e.* FROM accounting_events e WHERE source_event_id=${id} AND ((kind='advance_refund' AND NOT EXISTS(SELECT 1 FROM accounting_events x WHERE x.kind='money_reverse' AND x.source_event_id=e.id)) OR (kind='advance_apply' AND NOT EXISTS(SELECT 1 FROM accounting_events x WHERE x.kind='settlement_reverse' AND (x.sales_settlement_id=e.sales_settlement_id OR x.purchase_settlement_id=e.purchase_settlement_id))))`;
  return Number(r.amount) - events.reduce((n, e) => n + Number(e.amount), 0);
}
try {
  const [d] = await db`SHOW data_directory`;
  assert(d.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'));
  baseline = await snapshot();
  const [u] = await db`SELECT business_id FROM "user" WHERE email=${owner.email}`;
  businessId = u.business_id;
  await db`INSERT INTO customers(id,business_id,name,outstanding_balance) VALUES(${customerId},${businessId},${`Funds customer ${suffix}`},100)`;
  await db`INSERT INTO suppliers(id,business_id,name,outstanding_balance) VALUES(${supplierId},${businessId},${`Funds supplier ${suffix}`},100)`;
  await db`INSERT INTO products(id,business_id,store_id,name,unit_type,unit_symbol,price,cost_price,inventory) VALUES(${productId},${businessId},${seed.stores[0].id},${`Funds item ${suffix}`},'piece','pc',10,5,50)`;
  await db`INSERT INTO sales(id,business_id,store_id,customer_id,customer_name,bill_no,subtotal,total,payment_method,payment_status,bill_type) VALUES(${saleId},${businessId},${seed.stores[0].id},${customerId},${`Funds customer ${suffix}`},${billNo},100,100,'credit','due','non_gst_bill'),(${cashSaleId},${businessId},${seed.stores[0].id},${customerId},${`Funds customer ${suffix}`},${cashNo},100,100,'cash','paid','non_gst_bill')`;
  await db`INSERT INTO sale_items(business_id,sale_id,product_id,product_name,qty,unit_symbol,unit_price,line_total,cost_price_at_sale) VALUES(${businessId},${cashSaleId},${productId},${`Funds item ${suffix}`},10,'pc',10,100,5)`;
  await db`INSERT INTO purchases(id,business_id,supplier_id,supplier_name,bill_no,subtotal,total,payment_method) VALUES(${purchaseId},${businessId},${supplierId},${`Funds supplier ${suffix}`},${purchaseNo},100,100,'credit')`;
  await db`INSERT INTO purchase_items(purchase_id,product_id,product_name,qty,unit_symbol,unit_price,line_total) VALUES(${purchaseId},${productId},${`Funds item ${suffix}`},10,'pc',10,100)`;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultNavigationTimeout(60000);
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  const a = await command('advance', { amount: '100' });
  assert.equal(await debt(), '100.00');
  assert.equal(await advanceAvailable(a), 100);
  await mobile('customer-advance');
  result.checks.push('Customer advance records prepaid money separately from unchanged debt');
  const applied = await command('advance_apply', { sourceId: a, billId: saleId });
  assert.equal(await debt(), '60.00');
  assert.equal(await advanceAvailable(a), 60);
  const [count] =
    await db`SELECT count(*)::int AS n FROM accounting_events WHERE id=${applied} AND kind='advance_apply'`;
  assert.equal(count.n, 1);
  result.checks.push('Partial advance application creates a bill allocation and reduces debt once');
  const refund = await command('advance_refund', { sourceId: a, amount: '20' });
  assert.equal(await advanceAvailable(a), 40);
  assert.equal(await debt(), '60.00');
  result.checks.push('Partial advance refund consumes only unused prepaid money');
  await command('money_reverse', { sourceId: refund });
  assert.equal(await advanceAvailable(a), 60);
  result.checks.push('Linked advance-refund correction restores prepaid availability');
  await command('allocation_reverse', { sourceId: applied });
  assert.equal(await debt(), '60.00');
  result.checks.push('Allocation correction preserves money and party debt');
  await command('settlement_reverse', { sourceId: applied });
  assert.equal(await debt(), '100.00');
  assert.equal(await advanceAvailable(a), 100);
  result.checks.push(
    'Reversing an advance-funded settlement restores debt and advance availability',
  );
  await command('money_reverse', { sourceId: a });
  await page.getByRole('heading', { name: 'Funds and correction history', exact: true }).waitFor();
  await mobile('corrections');
  result.checks.push('Original funds and corrections remain visible at 360px');
  await page.goto(`${origin}/returns/new`);
  await page.getByLabel('Original bill number', { exact: true }).fill(cashNo);
  await page.getByLabel('Product', { exact: true }).selectOption(productId);
  await page.getByLabel('Qty', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Create return', exact: true }).click();
  await page.waitForURL(`${origin}/returns`);
  const [returned] = await db`SELECT * FROM sales_returns WHERE original_sale_id=${cashSaleId}`;
  assert(returned);
  assert.equal(returned.refund_due_amount, '20.00');
  assert.equal(await debt(), '100.00');
  result.checks.push(
    'Paid sale return records stock and refund entitlement without erasing unrelated debt',
  );
  const cashRefund = await command('return_refund', { sourceId: returned.id, amount: '5' });
  const [stock] = await db`SELECT inventory FROM products WHERE id=${productId}`;
  assert.equal(stock.inventory, '52.000');
  result.checks.push('Partial customer refund records money without repeating stock movement');
  await command('money_reverse', { sourceId: cashRefund });
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Return refunds to resolve', exact: true }) })
    .getByText('₹20.00 due', { exact: true })
    .waitFor();
  result.checks.push('Refund correction restores the amount due and keeps the goods return');
  const supplierAdvance = await command('advance', { side: 'purchases', amount: '30' });
  await command('advance_apply', {
    side: 'purchases',
    sourceId: supplierAdvance,
    billId: purchaseId,
    amount: '20',
  });
  assert.equal(await debt('purchases'), '80.00');
  await command('advance_refund', { side: 'purchases', sourceId: supplierAdvance, amount: '10' });
  await mobile('supplier-funds');
  result.checks.push(
    'Supplier prepayment, bill use and unused-money return use the supplier ledger',
  );
  await page.goto(`${origin}/purchase-returns/new`);
  await page.getByLabel('Original purchase bill number', { exact: true }).fill(purchaseNo);
  await page.getByLabel('Product', { exact: true }).selectOption(productId);
  await page.getByLabel('Qty', { exact: true }).fill('9');
  await page.getByRole('button', { name: 'Create purchase return', exact: true }).click();
  await page.waitForURL(`${origin}/purchase-returns`);
  const [supplierReturn] =
    await db`SELECT * FROM purchase_returns WHERE original_purchase_id=${purchaseId}`;
  assert.equal(supplierReturn.debt_reduction_amount, '80.00');
  assert.equal(supplierReturn.refund_due_amount, '10.00');
  assert.equal(await debt('purchases'), '0.00');
  result.checks.push('Supplier credit return splits unpaid debt from paid refund entitlement');
  await command('return_refund', { side: 'purchases', sourceId: supplierReturn.id, amount: '10' });
  const [afterStock] = await db`SELECT inventory FROM products WHERE id=${productId}`;
  assert.equal(afterStock.inventory, '43.000');
  result.checks.push('Supplier refund collection adds money without moving returned stock again');
  await page.goto(`${origin}/cashbook`);
  await page.getByRole('heading', { name: 'Cashbook', exact: true }).waitFor();
  assert.equal(
    await page
      .locator('tr')
      .filter({ hasText: `advance-${suffix}` })
      .count(),
    2,
  );
  await page
    .getByText('Applying an advance or assigning a bill never adds money again.', { exact: false })
    .waitFor();
  result.checks.push(
    'Cashbook exposes actual advances, refunds and corrections without duplicate applications',
  );
  await page.goto(`${origin}/dashboard?view=accounts`);
  await page.getByText('Customer refunds payable', { exact: true }).waitFor();
  await page.getByText('Supplier advances prepaid', { exact: true }).waitFor();
  result.checks.push('Accounts dashboard shows advance and refund positions separately from debt');
  await page.goto(`${origin}/reports/balance-sheet`);
  await page.getByText('Unused general customer advances', { exact: true }).waitFor();
  await page.getByText('Supplier return refunds receivable', { exact: true }).waitFor();
  result.checks.push('Management balance-sheet includes separate advance and refund positions');
  result.passed = true;
} catch (error) {
  result.error = String(error.stack ?? error).replaceAll(owner.password, '[redacted]');
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (businessId) {
    const events =
      await db`SELECT id FROM accounting_events WHERE customer_id=${customerId} OR supplier_id=${supplierId}`;
    const returns = await db`SELECT id FROM sales_returns WHERE original_sale_id=${cashSaleId}`;
    const purchaseReturns =
      await db`SELECT id FROM purchase_returns WHERE original_purchase_id=${purchaseId}`;
    const ids = [...events, ...returns, ...purchaseReturns].map((e) => e.id);
    if (ids.length)
      await db`DELETE FROM audit_logs WHERE business_id=${businessId} AND entity_id IN ${db(ids)}`;
    await db`DELETE FROM accounting_events WHERE customer_id=${customerId} OR supplier_id=${supplierId}`;
    await db`DELETE FROM sales_settlement_allocations WHERE customer_id=${customerId}`;
    await db`DELETE FROM purchase_settlement_allocations WHERE supplier_id=${supplierId}`;
    await db`DELETE FROM sales_returns WHERE original_sale_id=${cashSaleId}`;
    await db`DELETE FROM purchase_returns WHERE original_purchase_id=${purchaseId}`;
    await db`DELETE FROM sales_settlements WHERE customer_id=${customerId}`;
    await db`DELETE FROM purchase_settlements WHERE supplier_id=${supplierId}`;
    await db`DELETE FROM sales WHERE id IN (${saleId},${cashSaleId})`;
    await db`DELETE FROM purchases WHERE id=${purchaseId}`;
    await db`DELETE FROM products WHERE id=${productId}`;
    await db`DELETE FROM customers WHERE id=${customerId}`;
    await db`DELETE FROM suppliers WHERE id=${supplierId}`;
    if (baseline) assert.deepEqual(await snapshot(), baseline);
    result.checks.push('Cleanup preserves all 16 checked stock and financial tables byte for byte');
  }
  await db.end();
  writeFileSync(new URL('.cache/funds-browser.json', root), JSON.stringify(result, null, 2));
  // biome-ignore lint/suspicious/noConsole: No credentials or sessions are printed.
  console.log(JSON.stringify(result));
}
