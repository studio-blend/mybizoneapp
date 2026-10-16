// Writes disposable fixtures ONLY on the guarded local acceptance database.
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
const origin = 'http://localhost:3015';
const owner = JSON.parse(
  readFileSync(new URL('.local/test-accounts/pro-owner.json', root), 'utf8'),
);
const seed = JSON.parse(
  readFileSync(new URL('.local/test-accounts/four-store-seed.json', root), 'utf8'),
);
const db = postgres(url, { max: 1 });
const id = randomUUID();
const name = `Batch browser ${id.slice(0, 8)}`;
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const date = (days) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const shots = new URL('.cache/stock-batches-screenshots/', root);
mkdirSync(shots, { recursive: true });
const result = { checks: [], passed: false };
let browser;
let page;
let businessId;
try {
  const [directory] = await db`SHOW data_directory`;
  assert(directory.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'));
  const [tenant] =
    await db`SELECT u.business_id FROM "user" u JOIN stores s ON s.business_id=u.business_id::uuid WHERE u.email=${owner.email} AND s.id=${seed.stores[0].id}`;
  assert(tenant);
  businessId = tenant.business_id;
  await db`INSERT INTO products(id,business_id,store_id,name,unit_type,unit_symbol,price,cost_price,inventory) VALUES (${id},${businessId},${seed.stores[0].id},${name},'weight','kg',10,5,3)`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.goto(`${origin}/inventory/batches`);
  await page.getByText('Enable batch tracking for a product', { exact: true }).click();
  await page.getByLabel('Product to reconcile', { exact: true }).selectOption(id);
  let lot = page.getByRole('group', { name: 'Opening lot', exact: true }).first();
  await lot.getByLabel('Batch code', { exact: true }).fill('EXPIRED');
  await lot.getByLabel('Quantity (kg)', { exact: true }).fill('1');
  await lot.getByLabel('Expiry date', { exact: true }).fill(date(-1));
  await page.getByRole('button', { name: 'Add opening lot', exact: true }).click();
  lot = page.getByRole('group', { name: 'Opening lot', exact: true }).last();
  await lot.getByLabel('Batch code', { exact: true }).fill('FRESH');
  await lot.getByLabel('Quantity (kg)', { exact: true }).fill('2');
  await lot.getByLabel('Expiry date', { exact: true }).fill(date(5));
  await page.getByRole('button', { name: 'Reconcile and enable tracking', exact: true }).click();
  await page.waitForURL(`${origin}/inventory/batches?productId=${id}`);
  const [activation] =
    await db`SELECT batch_tracking,(SELECT count(*) FROM stock_batches WHERE product_id=${id}) AS lots FROM products WHERE id=${id}`;
  assert.equal(activation.batch_tracking, true);
  assert.equal(Number(activation.lots), 2);
  await page.locator('article').filter({ hasText: name }).first().waitFor();
  result.checks.push('Opening-lot reconciliation enables tracking without changing physical stock');
  await page.goto(`${origin}/dashboard`);
  await page.getByRole('heading', { name: 'Expiry & quarantine', exact: true }).waitFor();
  assert((await page.locator('[data-dashboard-insights]').innerText()).includes(name));
  result.checks.push('Master dashboard shows expiry attention for tracked stock');
  await page.goto(`${origin}/sales/new`);
  await page.getByLabel('Store', { exact: true }).selectOption(seed.stores[0].id);
  await page.getByLabel('Bill type', { exact: true }).selectOption('non_gst_bill');
  await page.locator('#search').fill(name);
  const match = page.getByRole('button').filter({ hasText: name }).first();
  assert.match(await match.innerText(), /stock 2(?:\.0+)?/);
  await match.click();
  await page.locator('tbody tr').filter({ hasText: name }).locator('input').first().fill('1.5');
  await page.getByRole('button', { name: 'Save bill (F2)', exact: true }).click();
  await page.waitForURL(`${origin}/sales`);
  const [bill] =
    await db`SELECT s.id,s.bill_no FROM sales s JOIN sale_items i ON i.sale_id=s.id WHERE i.product_id=${id}`;
  assert(bill);
  await page.goto(`${origin}/sales/${bill.id}`);
  await page.getByText('Allocated batches', { exact: true }).click();
  assert((await page.locator('details').innerText()).includes('FRESH'));
  result.checks.push(
    'Checkout displays sellable stock, allocates FEFO and exposes lot trace on the bill',
  );
  await page.goto(`${origin}/returns/new`);
  await page.getByLabel('Original bill number', { exact: true }).fill(bill.bill_no);
  await page.getByLabel('Product', { exact: true }).selectOption(id);
  await page.getByLabel('Qty', { exact: true }).fill('0.5');
  await page.getByRole('button', { name: 'Create return', exact: true }).click();
  await page.waitForURL(`${origin}/returns`);
  await page.goto(`${origin}/inventory/batches?productId=${id}`);
  const returned = page.locator('article').filter({ hasText: 'RETURN-' });
  await returned.getByText('Inspect and release', { exact: true }).click();
  await returned.getByLabel('Verified lot code', { exact: true }).fill('INSPECTED');
  await returned.getByLabel('Verified expiry', { exact: true }).fill(date(10));
  await returned
    .getByLabel('Inspection note', { exact: true })
    .fill('Packaging and expiry verified during acceptance');
  await returned.getByRole('button', { name: 'Release inspected stock', exact: true }).click();
  await page.locator('article').filter({ hasText: 'INSPECTED' }).waitFor();
  result.checks.push('Customer return enters quarantine and can be released after inspection');
  await page.goto(`${origin}/purchases/new`);
  await page.getByLabel('Supplier name', { exact: true }).fill('Batch acceptance supplier');
  await page
    .locator('select')
    .filter({ has: page.locator(`option[value="${id}"]`) })
    .selectOption(id);
  await page.getByPlaceholder('Qty (kg)', { exact: true }).fill('1');
  await page.getByPlaceholder('Unit price', { exact: true }).fill('5');
  await page.getByLabel('Batch code', { exact: true }).fill('RECEIVED');
  await page.getByLabel('Expiry date', { exact: true }).fill(date(15));
  await page.getByRole('button', { name: 'Create purchase bill', exact: true }).click();
  await page.waitForURL(`${origin}/purchases`);
  const [receipt] =
    await db`SELECT p.bill_no FROM purchases p JOIN purchase_items i ON i.purchase_id=p.id WHERE i.product_id=${id}`;
  assert(receipt);
  result.checks.push('Purchase form captures the received batch and expiry');
  await page.goto(`${origin}/purchase-returns/new`);
  await page.getByLabel('Original purchase bill number', { exact: true }).fill(receipt.bill_no);
  await page.getByLabel('Product', { exact: true }).selectOption(id);
  await page.getByLabel('Qty', { exact: true }).fill('0.25');
  const [receivedLot] =
    await db`SELECT id FROM stock_batches WHERE product_id=${id} AND code='RECEIVED'`;
  await page.getByLabel('Physical batch', { exact: true }).selectOption(receivedLot.id);
  await mobile(page, 'supplier-return');
  await page.getByRole('button', { name: 'Create purchase return', exact: true }).click();
  await page.waitForURL(`${origin}/purchase-returns`);
  result.checks.push('Supplier return form removes stock from the original receipt lot');
  await page.goto(`${origin}/damage-logs/new`);
  await page.getByLabel('Product', { exact: true }).selectOption(id);
  const [expired] =
    await db`SELECT id FROM stock_batches WHERE product_id=${id} AND code='EXPIRED'`;
  await page.getByLabel('Physical batch', { exact: true }).selectOption(expired.id);
  await page.getByLabel('Quantity', { exact: true }).fill('1');
  await page.getByLabel('Reason', { exact: true }).selectOption('expired');
  await page.getByRole('button', { name: 'Log damage', exact: true }).click();
  await page.waitForURL(`${origin}/damage-logs`);
  result.checks.push('Expired stock is written off from its exact physical batch');
  await page.goto(`${origin}/inventory/batches?productId=${id}`);
  await page.getByRole('heading', { name: 'Latest lot movements', exact: true }).waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL('owner-desktop.png', shots)),
    fullPage: true,
  });
  await mobile(page, 'owner');
  const [balance] =
    await db`SELECT p.inventory,(SELECT sum(quantity) FROM stock_batches WHERE product_id=p.id) AS batches,(SELECT sum(m.quantity) FROM stock_batch_movements m JOIN stock_batches b ON b.id=m.batch_id WHERE b.product_id=p.id) AS movements FROM products p WHERE p.id=${id}`;
  assert.equal(Number(balance.inventory), 1.75);
  assert.equal(balance.inventory, balance.batches);
  assert.equal(balance.inventory, balance.movements);
  result.checks.push('End-to-end stock, batch totals and movement ledger reconcile at 1.750 kg');
  for (const role of ['admin', 'inventory', 'sales', 'floor_manager']) {
    const person = seed.users.find((item) => item.role === role);
    assert(person);
    const staff = await browser.newContext();
    const signed = await staff.request.post(`${origin}/api/emp-signin`, {
      data: { empId: person.empId, password: person.password },
    });
    assert.equal(signed.status(), 200);
    const tab = await staff.newPage();
    await tab.goto(`${origin}/dashboard`);
    await tab.locator('[data-dashboard-view]').waitFor();
    const canManage = role === 'admin';
    assert.equal(await tab.locator('a[href="/inventory/batches"]').count(), canManage ? 1 : 0);
    if (canManage) {
      await tab.goto(`${origin}/inventory/batches`);
      await tab.getByRole('heading', { name: 'Batches & expiry', exact: true }).waitFor();
      await mobile(tab, 'admin');
    }
    if (role === 'inventory') {
      assert(person.storeId && !person.departmentId);
      await tab.getByRole('heading', { name: 'Expiry & quarantine', exact: true }).waitFor();
      assert((await tab.locator('[data-dashboard-insights]').innerText()).includes(name));
      await mobile(tab, 'inventory');
    }
    result.checks.push(`${role}: batch navigation respects existing inventory permissions`);
    await staff.close();
  }
  result.passed = true;
} catch (error) {
  if (page) {
    await page.screenshot({ path: fileURLToPath(new URL('failure.png', shots)), fullPage: true });
    result.diagnostics = await page.evaluate(() => ({
      path: location.pathname,
      alerts: [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent),
      invalid: [...document.querySelectorAll(':invalid')].map((el) => ({
        id: el.id,
        message: el.validationMessage,
      })),
    }));
  }
  let message = String(error.message);
  for (const person of [owner, ...seed.users])
    message = message.replaceAll(person.password, '[redacted]');
  result.error = message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (businessId)
    await db.begin(async (tx) => {
      await tx`DELETE FROM audit_logs WHERE business_id=${businessId} AND entity_id IN (
        SELECT ${id}::text UNION ALL SELECT id::text FROM stock_batches WHERE product_id=${id}
        UNION ALL SELECT sale_id::text FROM sale_items WHERE product_id=${id}
        UNION ALL SELECT purchase_id::text FROM purchase_items WHERE product_id=${id}
        UNION ALL SELECT return_id::text FROM return_items WHERE product_id=${id}
        UNION ALL SELECT return_id::text FROM purchase_return_items WHERE product_id=${id}
        UNION ALL SELECT id::text FROM damage_logs WHERE product_id=${id})`;
      await tx`DELETE FROM sales_returns WHERE id IN (SELECT return_id FROM return_items WHERE product_id=${id}) AND business_id=${businessId}`;
      await tx`DELETE FROM purchase_returns WHERE id IN (SELECT return_id FROM purchase_return_items WHERE product_id=${id}) AND business_id=${businessId}`;
      await tx`DELETE FROM sales WHERE id IN (SELECT sale_id FROM sale_items WHERE product_id=${id}) AND business_id=${businessId}`;
      await tx`DELETE FROM purchases WHERE id IN (SELECT purchase_id FROM purchase_items WHERE product_id=${id}) AND business_id=${businessId}`;
      await tx`DELETE FROM damage_logs WHERE product_id=${id} AND business_id=${businessId}`;
      await tx`DELETE FROM products WHERE id=${id} AND business_id=${businessId}`;
    });
  await db.end();
  writeFileSync(
    new URL('.cache/stock-batches-browser-local.json', root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: No credentials or sessions are included.
  console.log(JSON.stringify(result));
}
async function mobile(page, name) {
  await page.setViewportSize({ width: 360, height: 800 });
  if (new URL(page.url()).pathname === '/inventory/batches') {
    const productFilter = await page.locator('select[name="productId"]').boundingBox();
    assert(
      productFilter && productFilter.width >= 240,
      'Mobile product filter must remain readable',
    );
  }
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}-mobile.png`, shots)),
    fullPage: true,
  });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${name} mobile overflow`,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
}
