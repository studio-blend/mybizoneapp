// Mutating browser acceptance is restricted to the exact disposable local cluster.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const require = createRequire(new URL('apps/web/package.json', root));
const { chromium } = require('@playwright/test');
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
const saleId = randomUUID();
const purchaseId = randomUUID();
const suffix = customerId.slice(0, 8);
const billNo = `ACCOUNT-${suffix}`;
const purchaseNo = `SUPPLIER-${suffix}`;
const shots = new URL('.cache/accounting-screenshots/', root);
mkdirSync(shots, { recursive: true });
const result = { checks: [], passed: false };
let browser;
let page;
let businessId;
let baseline;
async function snapshot() {
  return db`SELECT 'customers' AS name,count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) AS hash FROM customers t UNION ALL SELECT 'suppliers',count(*)::int,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM suppliers t UNION ALL SELECT 'sales',count(*)::int,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM sales t UNION ALL SELECT 'purchases',count(*)::int,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM purchases t UNION ALL SELECT 'receipts',count(*)::int,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM sales_settlements t UNION ALL SELECT 'payments',count(*)::int,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM purchase_settlements t`;
}
async function mobile(name) {
  await page.setViewportSize({ width: 360, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, shots)), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function submit() {
  const previous = new URL(page.url()).searchParams.get('recorded');
  await Promise.all([
    page.waitForURL(
      (url) => !!url.searchParams.get('recorded') && url.searchParams.get('recorded') !== previous,
    ),
    page.getByRole('button', { name: 'Record settlement', exact: true }).click(),
  ]);
  await page.getByText('Settlement recorded.', { exact: true }).waitFor();
  await page.waitForTimeout(250);
}
async function debt() {
  const [c] = await db`SELECT outstanding_balance AS debt FROM customers WHERE id=${customerId}`;
  return c.debt;
}
try {
  const [d] = await db`SHOW data_directory`;
  assert(d.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'));
  baseline = await snapshot();
  const [u] = await db`SELECT business_id FROM "user" WHERE email=${owner.email}`;
  businessId = u.business_id;
  await db`INSERT INTO customers(id,business_id,name,outstanding_balance) VALUES(${customerId},${businessId},${`Accounting customer ${suffix}`},100)`;
  await db`INSERT INTO suppliers(id,business_id,name,outstanding_balance) VALUES(${supplierId},${businessId},${`Accounting supplier ${suffix}`},100)`;
  await db`INSERT INTO sales(id,business_id,store_id,customer_id,bill_no,customer_name,subtotal,total,payment_method,payment_status,bill_type) VALUES(${saleId},${businessId},${seed.stores[0].id},${customerId},${billNo},${`Accounting customer ${suffix}`},100,100,'credit','due','non_gst_bill')`;
  await db`INSERT INTO purchases(id,business_id,supplier_id,supplier_name,bill_no,subtotal,total,payment_method) VALUES(${purchaseId},${businessId},${supplierId},${`Accounting supplier ${suffix}`},${purchaseNo},100,100,'credit')`;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultNavigationTimeout(60000);
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.goto(`${origin}/settlements?customerId=${customerId}`);
  assert.equal(await page.getByLabel('Customer', { exact: true }).inputValue(), customerId);
  await page.getByLabel('Apply to bill', { exact: true }).selectOption(saleId);
  await page.getByLabel('Amount ₹', { exact: true }).fill('40');
  await page.getByLabel('Notes (optional)', { exact: true }).fill('X');
  await page.getByLabel('Reference no. (optional)', { exact: true }).fill(`RECEIPT-${suffix}`);
  await mobile('sales-payment');
  await submit();
  assert.equal(await debt(), '60.00');
  result.checks.push('Customer deep link and partial credit-bill receipt update debt once');
  await page.getByLabel('Apply to bill', { exact: true }).selectOption('');
  await page.getByLabel('Amount ₹', { exact: true }).fill('10');
  await page.getByLabel('Reference no. (optional)', { exact: true }).fill(`EARLIER-${suffix}`);
  await submit();
  assert.equal(await debt(), '50.00');
  const [r] =
    await db`SELECT id FROM sales_settlements WHERE customer_id=${customerId} AND reference_no=${`EARLIER-${suffix}`}`;
  await page.getByLabel('Unallocated payment', { exact: true }).selectOption(r.id);
  await page.getByLabel('Bill receiving allocation', { exact: true }).selectOption(saleId);
  await page.getByLabel('Allocation amount ₹', { exact: true }).fill('10');
  await page
    .getByLabel('Allocation evidence / note', { exact: true })
    .fill('Confirmed against original customer bill');
  await mobile('assign-receipt');
  const [countBefore] = await db`SELECT count(*)::int AS n FROM sales_settlements`;
  await page.getByRole('button', { name: 'Assign payment to bill', exact: true }).click();
  await page.getByText('Allocation saved. No new money was recorded.', { exact: true }).waitFor();
  assert.equal(await debt(), '50.00');
  const [countAfter] = await db`SELECT count(*)::int AS n FROM sales_settlements`;
  assert.equal(countAfter.n, countBefore.n);
  await page.getByText('Confirmed against original customer bill', { exact: true }).waitFor();
  result.checks.push('Earlier receipt allocation preserves money, debt and visible evidence');
  await page.getByLabel('Apply to bill', { exact: true }).selectOption(saleId);
  await page.getByLabel('Amount ₹', { exact: true }).fill('60');
  await page.getByRole('button', { name: 'Record settlement', exact: true }).click();
  await page.getByText('Amount exceeds remaining bill value', { exact: true }).waitFor();
  assert.equal(await debt(), '50.00');
  result.checks.push('Excess receipt fails without a second collection');
  await page.goto(`${origin}/settlements?tab=purchases`);
  await page.getByLabel('Supplier', { exact: true }).selectOption(supplierId);
  await page.getByLabel('Apply to bill', { exact: true }).selectOption(purchaseId);
  await page.getByLabel('Amount ₹', { exact: true }).fill('30');
  await page.getByLabel('Reference no. (optional)', { exact: true }).fill(`PAYMENT-${suffix}`);
  await page.getByLabel('Payment method', { exact: true }).selectOption('upi');
  await submit();
  const [v] = await db`SELECT outstanding_balance AS debt FROM suppliers WHERE id=${supplierId}`;
  assert.equal(v.debt, '70.00');
  await mobile('supplier-payment');
  result.checks.push(
    'Supplier payment allocates to its bill and reduces the correct supplier debt',
  );
  await page.goto(`${origin}/reports/due-bills`);
  const billRow = page.locator('tr').filter({ hasText: billNo });
  await billRow.waitFor();
  assert((await billRow.innerText()).includes('50.00'));
  result.checks.push('Due-bills report uses remaining allocated credit value');
  await page.goto(`${origin}/cashbook`);
  await page.getByRole('heading', { name: 'Cashbook', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Daily money movement', exact: true }).waitFor();
  assert.equal(
    await page
      .locator('tr')
      .filter({ hasText: `RECEIPT-${suffix}` })
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator('tr')
      .filter({ hasText: `EARLIER-${suffix}` })
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator('tr')
      .filter({ hasText: `PAYMENT-${suffix}` })
      .count(),
    1,
  );
  await mobile('cashbook');
  result.checks.push('Cashbook includes each real receipt/payment once and renders at 360px');
  await page.getByLabel('Payment method', { exact: true }).selectOption('upi');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.waitForURL(/method=upi/);
  assert.equal(
    await page
      .locator('tr')
      .filter({ hasText: `RECEIPT-${suffix}` })
      .count(),
    0,
  );
  assert.equal(
    await page
      .locator('tr')
      .filter({ hasText: `PAYMENT-${suffix}` })
      .count(),
    1,
  );
  result.checks.push('Native payment-method filter excludes other channels');
  await page.goto(`${origin}/cashbook?from=2026-02-30&to=2026-03-01`);
  await page.getByRole('alert').filter({ hasText: 'Choose valid dates' }).waitFor();
  result.checks.push('Impossible dates show a recoverable filter error');
  result.passed = true;
} catch (error) {
  result.error = String(error.stack ?? error).replaceAll(owner.password, '[redacted]');
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (businessId) {
    const receipts = await db`SELECT id FROM sales_settlements WHERE customer_id=${customerId}`;
    const payments = await db`SELECT id FROM purchase_settlements WHERE supplier_id=${supplierId}`;
    const ids = [...receipts, ...payments].map((r) => r.id);
    if (ids.length)
      await db`DELETE FROM audit_logs WHERE business_id=${businessId} AND entity_id IN ${db(ids)}`;
    await db`DELETE FROM sales_settlement_allocations WHERE customer_id=${customerId}`;
    await db`DELETE FROM purchase_settlement_allocations WHERE supplier_id=${supplierId}`;
    await db`DELETE FROM sales_settlements WHERE customer_id=${customerId}`;
    await db`DELETE FROM purchase_settlements WHERE supplier_id=${supplierId}`;
    await db`DELETE FROM sales WHERE id=${saleId}`;
    await db`DELETE FROM purchases WHERE id=${purchaseId}`;
    await db`DELETE FROM customers WHERE id=${customerId}`;
    await db`DELETE FROM suppliers WHERE id=${supplierId}`;
    if (baseline) assert.deepEqual(await snapshot(), baseline);
    result.checks.push('Fixture cleanup preserves all six checked financial tables byte for byte');
  }
  await db.end();
  writeFileSync(new URL('.cache/accounting-browser.json', root), JSON.stringify(result, null, 2));
  // biome-ignore lint/suspicious/noConsole: Credentials and sessions are excluded.
  console.log(JSON.stringify(result));
}
