// Mutating acceptance is restricted to the exact disposable local cluster.
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
const origin = 'http://localhost:3015';
const owner = JSON.parse(
  readFileSync(new URL('.local/test-accounts/pro-owner.json', root), 'utf8'),
);
const seed = JSON.parse(
  readFileSync(new URL('.local/test-accounts/four-store-seed.json', root), 'utf8'),
);
const productId = randomUUID();
const customerId = randomUUID();
const supplierId = randomUUID();
const suffix = productId.slice(0, 8);
const product = `Wholesale cups ${suffix}`;
const customer = `Trade customer ${suffix}`;
const supplier = `Trade supplier ${suffix}`;
const shots = new URL('.cache/wholesale-screenshots/', root);
mkdirSync(shots, { recursive: true });
const result = { checks: [], passed: false };
let browser;
let page;
let businessId;
let orderId;
let orderNo;
let packId;
const date = (days) =>
  new Date(Date.now() + 330 * 60000 + days * 86400000).toISOString().slice(0, 10);
async function mobile(name) {
  await page.setViewportSize({ width: 360, height: 800 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${name}: overflow`,
  );
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}-mobile.png`, shots)),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function balance() {
  const [r] =
    await db`SELECT (SELECT inventory FROM products WHERE id=${productId}) stock,(SELECT outstanding_balance FROM customers WHERE id=${customerId}) debt`;
  return r;
}
async function reloadClick(button) {
  try {
    await Promise.all([
      page.waitForEvent('framenavigated', {
        predicate: (f) => f === page.mainFrame(),
        timeout: 30000,
      }),
      button.click(),
    ]);
    await page.getByRole('heading', { name: orderNo, exact: true }).waitFor();
  } catch (error) {
    throw new Error(`${error.message}; alerts: ${await page.getByRole('alert').allTextContents()}`);
  }
}
function section(title) {
  return page
    .locator('details')
    .filter({ has: page.locator('summary').getByText(title, { exact: true }) });
}
async function money(amount) {
  await page.getByText('Record customer payment', { exact: true }).click();
  const form = section('Record customer payment');
  await form.getByLabel('Amount (₹)', { exact: true }).fill(amount);
  await form.getByLabel('Payment note', { exact: true }).fill('Actual customer payment verified');
  await reloadClick(form.getByRole('button', { name: 'Record payment received', exact: true }));
}
async function handover(qty, fail = false) {
  await page.getByText('Record physical handover', { exact: true }).click();
  const form = section('Record physical handover');
  await form.getByLabel('Handover quantity (pc)', { exact: true }).fill(qty);
  await form
    .getByLabel('Recipient / handover reference', { exact: true })
    .fill('Warehouse customer collection');
  if (fail) {
    await form.getByRole('button', { name: 'Create delivery bill', exact: true }).click();
    await form.getByRole('alert').filter({ hasText: 'credit limit' }).waitFor();
  } else await reloadClick(form.getByRole('button', { name: 'Create delivery bill', exact: true }));
}
try {
  const [d] = await db`SHOW data_directory`;
  assert(d.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'));
  const [u] = await db`SELECT business_id FROM "user" WHERE email=${owner.email}`;
  assert(u);
  businessId = u.business_id;
  await db`INSERT INTO products(id,business_id,store_id,name,unit_type,unit_symbol,price,wholesale_price,cost_price,inventory) VALUES(${productId},${businessId},${seed.stores[0].id},${product},'piece','pc',10,8,4,24)`;
  await db`INSERT INTO customers(id,business_id,name,rate_category,credit_days,credit_limit,outstanding_balance) VALUES(${customerId},${businessId},${customer},'wholesale',14,120,20)`;
  await db`INSERT INTO suppliers(id,business_id,name) VALUES(${supplierId},${businessId},${supplier})`;
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await ctx.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.goto(`${origin}/inventory/packs`);
  await page.getByRole('heading', { name: 'Pack definitions', exact: true }).waitFor();
  await page.getByLabel('Product to pack', { exact: true }).selectOption(productId);
  await page.getByLabel('Pack name', { exact: true }).fill('Carton');
  await page.getByLabel('Stock units per pack (pc)', { exact: true }).fill('12');
  await mobile('define-pack');
  await Promise.all([
    page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() }),
    page.getByRole('button', { name: 'Create pack definition', exact: true }).click(),
  ]);
  await page.getByRole('heading', { name: 'Carton', exact: true }).waitFor();
  const [pack] = await db`SELECT id FROM product_packs WHERE product_id=${productId}`;
  assert(pack);
  packId = pack.id;
  assert.deepEqual(await balance(), { stock: '24.000', debt: '20.00' });
  result.checks.push(
    'Pack definition records the real 12-piece conversion without adjusting stock or debt',
  );
  await page.goto(`${origin}/customers/${customerId}/edit`);
  await page.getByLabel('Credit days', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Credit days', { exact: true }).inputValue(), '14');
  assert.equal(await page.getByLabel('Credit Limit ₹', { exact: true }).inputValue(), '120.00');
  await mobile('customer-credit');
  result.checks.push(
    'Customer editor displays credit days, ceiling and rate-category guidance at phone width',
  );
  await page.goto(`${origin}/purchases/new`);
  await page.getByRole('heading', { name: 'New Purchase Bill', exact: true }).waitFor();
  await page.locator('#supplierId').selectOption(supplierId);
  await page
    .locator('select')
    .filter({ has: page.locator(`option[value="${productId}"]`) })
    .first()
    .selectOption(productId);
  await page.getByLabel('Pack (optional)', { exact: true }).selectOption(packId);
  await page.getByLabel('Number of packs', { exact: true }).fill('2');
  await page.getByLabel('Loose quantity (pc)', { exact: true }).fill('3');
  await page.getByPlaceholder('Unit price', { exact: true }).fill('4');
  await page.getByLabel('Payment method', { exact: true }).selectOption('credit');
  await mobile('receive-packs');
  await page.getByRole('button', { name: 'Create purchase bill', exact: true }).click();
  await page.waitForURL(`${origin}/purchases`);
  const [receipt] =
    await db`SELECT p.id,p.bill_no FROM purchases p JOIN purchase_items i ON i.purchase_id=p.id WHERE i.product_id=${productId}`;
  assert(receipt);
  assert.deepEqual(await balance(), { stock: '51.000', debt: '20.00' });
  await page.goto(`${origin}/purchases/${receipt.id}`);
  await page.getByText('2 × Carton (12.000 pc each) + 3.000 pc loose', { exact: true }).waitFor();
  result.checks.push(
    'Purchase receives two cartons plus loose pieces and preserves the conversion on its receipt',
  );
  await page.goto(`${origin}/sales/new`);
  await page.getByLabel('Store', { exact: true }).selectOption(seed.stores[0].id);
  await page.getByPlaceholder('Name, SKU, or barcode').fill(product);
  await page.getByRole('button').filter({ hasText: product }).first().click();
  await page.getByLabel('Pack (optional)', { exact: true }).selectOption(packId);
  await page.getByLabel('Number of packs', { exact: true }).fill('1');
  await page.getByLabel('Loose quantity (pc)', { exact: true }).fill('2');
  await page.locator('#creditCustomer').selectOption(customerId);
  await page.locator('#billType').selectOption('non_gst_bill');
  await mobile('checkout-packs');
  await page.getByRole('button', { name: 'Save bill (F2)', exact: true }).click();
  await page.waitForURL(`${origin}/sales`);
  const [createdSale] =
    await db`SELECT id FROM sales WHERE customer_id=${customerId} AND business_id=${businessId} ORDER BY created_at DESC LIMIT 1`;
  assert(createdSale);
  const saleId = createdSale.id;
  await page.goto(`${origin}/sales/${saleId}`);
  await page.getByText('1 × Carton (12.000 pc each) + 2.000 pc loose', { exact: true }).waitFor();
  const [bill] = await db`SELECT total FROM sales WHERE id=${saleId}`;
  assert.equal(bill.total, '112.00');
  assert.deepEqual(await balance(), { stock: '37.000', debt: '20.00' });
  result.checks.push(
    'Paid wholesale checkout uses 14 base pieces at the customer rate and leaves unrelated debt intact',
  );
  await page.goto(`${origin}/orders/new?trade=wholesale`);
  await page.getByLabel('Store', { exact: true }).selectOption(seed.stores[0].id);
  await page.getByLabel('Registered customer', { exact: true }).selectOption(customerId);
  assert.equal(await page.getByLabel('Order type', { exact: true }).inputValue(), 'wholesale');
  await page.getByLabel('Promised handover date', { exact: true }).fill(date(-1));
  await page.getByLabel('Delivery address', { exact: true }).fill('Trade loading bay');
  await page.getByLabel('Delivery bill type', { exact: true }).selectOption('non_gst_bill');
  await page.getByLabel('Product', { exact: true }).selectOption(productId);
  assert.equal(
    await page.getByLabel('Agreed unit price (₹)', { exact: true }).inputValue(),
    '8.00',
  );
  await page.getByLabel('Pack (optional)', { exact: true }).selectOption(packId);
  await page.getByLabel('Number of packs', { exact: true }).fill('2');
  await page.getByLabel('Loose quantity (pc)', { exact: true }).fill('3');
  await mobile('wholesale-booking');
  await page.getByRole('button', { name: 'Create customer order', exact: true }).click();
  await page.waitForURL((u) => /^\/orders\/[a-f0-9-]{36}$/.test(u.pathname));
  orderId = new URL(page.url()).pathname.split('/').at(-1);
  const [o] = await db`SELECT order_no,total,credit_days FROM customer_orders WHERE id=${orderId}`;
  orderNo = o.order_no;
  assert.equal(o.total, '216.00');
  assert.equal(o.credit_days, 14);
  assert.deepEqual(await balance(), { stock: '37.000', debt: '20.00' });
  result.checks.push(
    'Wholesale booking defaults customer pricing, freezes pack/credit terms and leaves stock and debt unchanged',
  );
  await page.goto(`${origin}/orders?trade=wholesale&view=late&q=${encodeURIComponent(customer)}`);
  await page.getByRole('link', { name: orderNo, exact: true }).waitFor();
  await page.getByText('Wholesale fulfilment', { exact: true }).last().waitFor();
  await mobile('wholesale-queue');
  result.checks.push(
    'Wholesale fulfilment filter isolates its late commitments with native query state',
  );
  await page.goto(`${origin}/orders/${orderId}`);
  await page.getByRole('heading', { name: orderNo, exact: true }).waitFor();
  await money('60');
  await handover('12');
  assert.deepEqual(await balance(), { stock: '25.000', debt: '56.00' });
  const [delivery] =
    await db`SELECT s.id,s.due_date FROM sales s JOIN customer_order_deliveries d ON d.sale_id=s.id WHERE d.order_id=${orderId}`;
  assert.equal(new Date(delivery.due_date).toISOString().slice(0, 10), date(14));
  result.checks.push(
    'First handover applies the advance before its credit check and starts the agreed credit period',
  );
  await handover('12', true);
  assert.deepEqual(await balance(), { stock: '25.000', debt: '56.00' });
  const [count] =
    await db`SELECT count(*)::int n FROM customer_order_deliveries WHERE order_id=${orderId}`;
  assert.equal(count.n, 1);
  await mobile('credit-decline');
  result.checks.push(
    'Over-limit handover is declined without stock, bill, progress or allocation drift',
  );
  await page.goto(`${origin}/inventory/packs`);
  const card = page.locator('article').filter({ hasText: product });
  await card.getByRole('button', { name: 'Archive pack', exact: true }).click();
  await page.getByText('Archived', { exact: true }).waitFor();
  await page.getByLabel('Product to pack', { exact: true }).selectOption(productId);
  await page.getByLabel('Pack name', { exact: true }).fill('Carton');
  await page.getByLabel('Stock units per pack (pc)', { exact: true }).fill('24');
  await Promise.all([
    page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() }),
    page.getByRole('button', { name: 'Create pack definition', exact: true }).click(),
  ]);
  await page.getByText('1 Carton = 24.000 pc', { exact: true }).waitFor();
  result.checks.push(
    'Archiving and replacing a conversion changes future entry while preserving the original agreement',
  );
  await page.goto(`${origin}/orders/${orderId}`);
  await page.getByRole('heading', { name: orderNo, exact: true }).waitFor();
  await money('40');
  await handover('12');
  assert.deepEqual(await balance(), { stock: '13.000', debt: '112.00' });
  await money('24');
  await handover('3');
  assert.deepEqual(await balance(), { stock: '10.000', debt: '112.00' });
  await page.getByText('Delivered', { exact: true }).waitFor();
  await mobile('wholesale-fulfilled');
  const [saved] =
    await db`SELECT count(*)::int n FROM sale_items i JOIN customer_order_deliveries d ON d.sale_id=i.sale_id WHERE d.order_id=${orderId} AND i.pack_snapshot->>'factor'='12.000'`;
  assert.equal(saved.n, 3);
  result.checks.push(
    'Further collections release credit for partial and final handovers without changing the original conversion',
  );
  await page.goto(`${origin}/sales/${delivery.id}`);
  await page.getByText(date(14), { exact: true }).waitFor();
  await page.getByText('1 × Carton (12.000 pc each)', { exact: true }).waitFor();
  result.checks.push(
    'Delivery bill displays frozen pack notes, base-unit prices and the agreed due date',
  );
  for (const role of ['admin', 'inventory', 'sales', 'billing', 'accounts', 'floor_manager']) {
    const person = seed.users.find((p) => p.role === role);
    assert(person);
    const staff = await browser.newContext();
    const response = await staff.request.post(`${origin}/api/emp-signin`, {
      data: { empId: person.empId, password: person.password },
    });
    assert.equal(response.status(), 200);
    const tab = await staff.newPage();
    tab.setDefaultNavigationTimeout(60000);
    await tab.goto(`${origin}/dashboard`);
    await tab.locator('[data-dashboard-view]').waitFor();
    const menu = tab.locator('header').getByRole('button', { name: 'Inventory', exact: true });
    if (await menu.count()) await menu.click();
    assert.equal(
      await tab.locator('header a[href="/inventory/packs"]').count(),
      ['admin', 'inventory'].includes(role) ? 1 : 0,
    );
    if (['admin', 'inventory'].includes(role)) {
      await tab.goto(`${origin}/inventory/packs`);
      await tab.getByRole('heading', { name: 'Pack definitions', exact: true }).waitFor();
    }
    result.checks.push(
      `${role}: pack configuration navigation and store permissions remain scoped`,
    );
    await staff.close();
  }
  result.passed = true;
} catch (error) {
  let message = String(error.stack ?? error);
  for (const p of [owner, ...seed.users]) message = message.replaceAll(p.password, '[redacted]');
  result.error = message;
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: fileURLToPath(new URL('failure.png', shots)), fullPage: true })
      .catch(() => {});
} finally {
  await browser?.close();
  if (businessId)
    await db.begin(async (tx) => {
      await tx`DELETE FROM audit_logs WHERE business_id=${businessId} AND entity_id IN (SELECT ${productId}::text UNION ALL SELECT ${customerId}::text UNION ALL SELECT ${supplierId}::text UNION ALL SELECT id::text FROM product_packs WHERE product_id=${productId} UNION ALL SELECT id::text FROM customer_orders WHERE customer_id=${customerId} UNION ALL SELECT p.id::text FROM customer_order_payments p JOIN customer_orders o ON o.id=p.order_id WHERE o.customer_id=${customerId} UNION ALL SELECT d.id::text FROM customer_order_deliveries d JOIN customer_orders o ON o.id=d.order_id WHERE o.customer_id=${customerId} UNION ALL SELECT id::text FROM sales WHERE customer_id=${customerId} UNION ALL SELECT p.id::text FROM purchases p JOIN purchase_items i ON i.purchase_id=p.id WHERE i.product_id=${productId})`;
      await tx`DELETE FROM sales WHERE customer_id=${customerId} AND business_id=${businessId}`;
      await tx`DELETE FROM customer_orders WHERE customer_id=${customerId} AND business_id=${businessId}`;
      await tx`DELETE FROM purchases WHERE id IN(SELECT purchase_id FROM purchase_items WHERE product_id=${productId}) AND business_id=${businessId}`;
      await tx`DELETE FROM customers WHERE id=${customerId} AND business_id=${businessId}`;
      await tx`DELETE FROM suppliers WHERE id=${supplierId} AND business_id=${businessId}`;
      await tx`DELETE FROM products WHERE id=${productId} AND business_id=${businessId}`;
    });
  await db.end();
  writeFileSync(
    new URL('.cache/wholesale-browser-local.json', root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: Credentials and sessions are excluded.
  console.log(JSON.stringify(result));
}
