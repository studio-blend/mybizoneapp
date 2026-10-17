// Mutating acceptance is restricted to the exact disposable local database.
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
const productId = randomUUID();
const customerId = randomUUID();
const suffix = productId.slice(0, 8);
const product = `Order sideboard ${suffix}`;
const customer = `Order customer ${suffix}`;
const shots = new URL('.cache/customer-orders-screenshots/', root);
mkdirSync(shots, { recursive: true });
const result = { checks: [], passed: false };
let browser;
let page;
let businessId;
let orderId;
let orderNo;
const date = (days) =>
  new Date(Date.now() + 330 * 60000 + days * 86400000).toISOString().slice(0, 10);
async function ready() {
  await page.getByRole('heading', { name: orderNo, exact: true }).waitFor();
}
async function mobile(label) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({
    path: fileURLToPath(new URL(`${label}-mobile.png`, shots)),
    fullPage: true,
  });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${label}: page overflow`,
  );
  for (const selector of ['input:not([type="checkbox"])', 'select', 'textarea'])
    for (const field of await page.locator(selector).all()) {
      if (await field.isVisible()) {
        const b = await field.boundingBox();
        assert(b && b.width >= 190, `${label}: cramped ${selector} ${b?.width}`);
      }
    }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
function section(title) {
  return page
    .locator('details')
    .filter({ has: page.locator('summary').getByText(title, { exact: true }) });
}
async function saveReload(button) {
  try {
    await Promise.all([
      page.waitForEvent('framenavigated', {
        predicate: (f) => f === page.mainFrame(),
        timeout: 20000,
      }),
      button.click(),
    ]);
    await ready();
  } catch (error) {
    throw new Error(
      `${error.message}; inline alerts: ${await page.getByRole('alert').allTextContents()}`,
    );
  }
}
async function payment(amount, kind = 'receipt') {
  const title = kind === 'receipt' ? 'Record customer payment' : 'Refund unused advance';
  await page.getByText(title, { exact: true }).click();
  const form = section(title);
  await form.getByLabel('Amount (₹)', { exact: true }).fill(amount);
  await form.getByLabel('Payment note', { exact: true }).fill('Verified actual customer funds');
  await mobile(kind);
  await saveReload(
    form.getByRole('button', {
      name: kind === 'receipt' ? 'Record payment received' : 'Record refund already paid',
      exact: true,
    }),
  );
}
async function handover() {
  await page.getByText('Record physical handover', { exact: true }).click();
  const form = section('Record physical handover');
  await form.getByLabel('Handover quantity (pc)', { exact: true }).fill('1');
  await form
    .getByLabel('Recipient / handover reference', { exact: true })
    .fill('Customer signed at showroom');
  await mobile('handover');
  await saveReload(form.getByRole('button', { name: 'Create delivery bill', exact: true }));
  const [bill] =
    await db`SELECT s.id,s.bill_no,s.payment_status FROM customer_order_deliveries d JOIN sales s ON s.id=d.sale_id WHERE d.order_id=${orderId} ORDER BY d.created_at DESC LIMIT 1`;
  assert(bill);
  return bill;
}
async function balances() {
  const [row] =
    await db`SELECT (SELECT inventory FROM products WHERE id=${productId}) AS stock,(SELECT outstanding_balance FROM customers WHERE id=${customerId}) AS debt`;
  return row;
}
try {
  const [directory] = await db`SHOW data_directory`;
  assert(directory.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'));
  const [tenant] =
    await db`SELECT u.business_id FROM "user" u JOIN stores s ON s.business_id=u.business_id::uuid WHERE u.email=${owner.email} AND s.id=${seed.stores[0].id}`;
  assert(tenant);
  businessId = tenant.business_id;
  await db`INSERT INTO products(id,business_id,store_id,name,unit_type,unit_symbol,price,cost_price,inventory) VALUES(${productId},${businessId},${seed.stores[0].id},${product},'piece','pc',125,60,4)`;
  await db`INSERT INTO customers(id,business_id,name,outstanding_balance) VALUES(${customerId},${businessId},${customer},50)`;
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await ctx.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.goto(`${origin}/orders/new`);
  await page.getByLabel('Store', { exact: true }).selectOption(seed.stores[0].id);
  await page.getByLabel('Registered customer', { exact: true }).selectOption(customerId);
  await page.getByLabel('Promised handover date', { exact: true }).fill(date(-1));
  await page.getByLabel('Delivery address', { exact: true }).fill('27 Garden Road, side entrance');
  await page.getByLabel('Delivery bill type', { exact: true }).selectOption('non_gst_bill');
  await page.getByLabel('Product', { exact: true }).selectOption(productId);
  await page.getByLabel('Quantity (pc)', { exact: true }).fill('3');
  await page.getByLabel('Agreed unit price (₹)', { exact: true }).fill('100');
  await mobile('create-order');
  await page.getByRole('button', { name: 'Create customer order', exact: true }).click();
  await page.waitForURL((u) => /^\/orders\/[a-f0-9-]{36}$/.test(u.pathname));
  orderId = new URL(page.url()).pathname.split('/').at(-1);
  const [order] = await db`SELECT order_no,total FROM customer_orders WHERE id=${orderId}`;
  assert(order);
  orderNo = order.order_no;
  await ready();
  assert.equal(order.total, '300.00');
  assert.deepEqual(await balances(), { stock: '4.000', debt: '50.00' });
  result.checks.push('Order form saves agreed prices without moving stock or customer debt');
  await page.goto(`${origin}/orders?view=late&q=${encodeURIComponent(customer)}`);
  await page.getByRole('link', { name: orderNo, exact: true }).waitFor();
  await page.getByText('Past date', { exact: true }).waitFor();
  await mobile('late-orders');
  result.checks.push('Native order filters show overdue handover promises at phone width');
  await page.goto(`${origin}/orders/${orderId}`);
  await ready();
  await payment('100');
  assert.deepEqual(await balances(), { stock: '4.000', debt: '50.00' });
  result.checks.push(
    'Customer advance is recorded separately without inventing a sale or reducing unrelated debt',
  );
  await page.goto(`${origin}/reports/balance-sheet`);
  await page.getByRole('heading', { name: 'Simplified Balance Sheet', exact: true }).waitFor();
  const advance = page
    .locator('div')
    .filter({ has: page.getByText('Customer order advances held', { exact: true }) })
    .last();
  assert((await advance.innerText()).includes('100.00'));
  result.checks.push('Management balance sheet includes unused customer advances as a liability');
  await page.goto(`${origin}/dashboard`);
  await page.getByRole('heading', { name: 'Orders awaiting handover', exact: true }).waitFor();
  assert((await page.locator('[data-dashboard-insights]').innerText()).includes(orderNo));
  result.checks.push('Owner dashboard shows promised handovers and separate order funds');
  await page.goto(`${origin}/orders/${orderId}`);
  await ready();
  const first = await handover();
  assert.equal(first.payment_status, 'paid');
  assert.deepEqual(await balances(), { stock: '3.000', debt: '50.00' });
  result.checks.push(
    'Partial handover creates one paid delivery bill and consumes the advance once',
  );
  await page.goto(`${origin}/sales/${first.id}`);
  await page.getByRole('link', { name: 'Open customer order', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('link', { name: 'Open customer order', exact: true }).getAttribute('href'),
    `/orders/${orderId}`,
  );
  result.checks.push('Delivery bill links back to its exact order ledger');
  await page.goto(`${origin}/orders/${orderId}`);
  await ready();
  await payment('50');
  const second = await handover();
  assert.equal(second.payment_status, 'partial');
  assert.deepEqual(await balances(), { stock: '2.000', debt: '100.00' });
  result.checks.push(
    'A partly paid handover adds only its unpaid delivered value to customer debt',
  );
  await page.goto(`${origin}/reports/due-bills`);
  const row = page.getByRole('row').filter({ hasText: second.bill_no });
  await row.waitFor();
  assert((await row.innerText()).includes('50.00'));
  assert.equal(
    await row.getByRole('link', { name: 'View', exact: true }).getAttribute('href'),
    `/orders/${orderId}`,
  );
  result.checks.push(
    'Due-bill report shows the exact remaining order bill amount and opens its ledger',
  );
  await page.goto(`${origin}/returns/new`);
  await page.getByLabel('Original bill number', { exact: true }).fill(second.bill_no);
  await page.getByLabel('Product', { exact: true }).selectOption(productId);
  await page.getByLabel('Qty', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Create return', exact: true }).click();
  await page.waitForURL(`${origin}/returns`);
  await page.goto(`${origin}/orders/${orderId}`);
  await ready();
  assert.deepEqual(await balances(), { stock: '3.000', debt: '50.00' });
  const [held] =
    await db`SELECT (SELECT sum(CASE kind WHEN 'receipt' THEN amount ELSE -amount END) FROM customer_order_payments WHERE order_id=${orderId})-(SELECT sum(amount) FROM customer_order_allocations WHERE order_id=${orderId}) AS amount`;
  assert.equal(Number(held.amount), 50);
  result.checks.push(
    'Returning a partly paid delivery clears exact debt and releases paid value as an advance',
  );
  await page.getByText('Change handover arrangements', { exact: true }).click();
  const schedule = section('Change handover arrangements');
  await schedule.getByLabel('Promised handover date', { exact: true }).fill(date(2));
  await schedule
    .getByLabel('Change note', { exact: true })
    .fill('Customer requested another handover date');
  await saveReload(
    schedule.getByRole('button', { name: 'Save handover arrangements', exact: true }),
  );
  await page.getByText(date(2), { exact: true }).waitFor();
  result.checks.push('Promised date changes are saved without changing agreed prices or stock');
  await page.getByText('Cancel undelivered remainder', { exact: true }).first().click();
  assert(
    await section('Cancel undelivered remainder')
      .getByRole('button', { name: 'Cancel undelivered remainder', exact: true })
      .isDisabled(),
  );
  await payment('50', 'refund');
  result.checks.push(
    'Unused advance must be recorded as an actual refund before cancelling the remainder',
  );
  for (const role of ['admin', 'sales', 'billing', 'accounts', 'inventory', 'floor_manager']) {
    const person = seed.users.find((p) => p.role === role);
    assert(person);
    const staff = await browser.newContext();
    const response = await staff.request.post(`${origin}/api/emp-signin`, {
      data: { empId: person.empId, password: person.password },
    });
    assert.equal(response.status(), 200);
    const tab = await staff.newPage();
    await tab.goto(`${origin}/orders`);
    await tab.getByRole('heading', { name: 'Customer orders', exact: true }).waitFor();
    const read =
      ['admin', 'sales', 'billing', 'accounts'].includes(role) &&
      !person.departmentId &&
      (!person.storeId || person.storeId === seed.stores[0].id);
    if (read) await tab.getByRole('link', { name: orderNo, exact: true }).waitFor();
    else
      await tab
        .getByText('Your role does not permit orders in this store.', { exact: true })
        .waitFor();
    assert.equal(
      await tab.getByRole('link', { name: 'New customer order', exact: true }).count(),
      role === 'admin' ? 1 : 0,
    );
    if (read) {
      await tab.goto(`${origin}/orders/${orderId}`);
      await tab.getByRole('heading', { name: orderNo, exact: true }).waitFor();
      assert.equal(
        await tab.getByText('Record physical handover', { exact: true }).count(),
        role === 'admin' ? 1 : 0,
      );
    }
    if (role === 'inventory') {
      await tab.goto(`${origin}/dashboard`);
      await tab.getByRole('heading', { name: 'Orders awaiting handover', exact: true }).waitFor();
      const text = await tab.locator('[data-dashboard-insights]').innerText();
      assert(text.includes(orderNo));
      assert(!text.includes('Order receipts · this period'));
      assert(!text.includes(customer));
    }
    result.checks.push(
      `${role}: order access, mutation controls and dashboard privacy follow scope`,
    );
    await staff.close();
  }
  await page.goto(`${origin}/orders/${orderId}`);
  await ready();
  await page.getByText('Cancel undelivered remainder', { exact: true }).first().click();
  const cancel = section('Cancel undelivered remainder');
  await cancel
    .getByLabel('Cancellation note', { exact: true })
    .fill('Customer cancelled remaining piece');
  await saveReload(
    cancel.getByRole('button', { name: 'Cancel undelivered remainder', exact: true }),
  );
  await page.getByText('Cancelled remainder', { exact: true }).waitFor();
  assert.deepEqual(await balances(), { stock: '3.000', debt: '50.00' });
  await mobile('completed-order');
  await page.screenshot({
    path: fileURLToPath(new URL('order-desktop.png', shots)),
    fullPage: true,
  });
  result.checks.push(
    'Cancellation closes only the remainder and preserves net sale, returned stock and unrelated debt',
  );
  result.passed = true;
} catch (error) {
  let message = String(error?.stack ?? error);
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
      await tx`DELETE FROM audit_logs WHERE business_id=${businessId} AND entity_id IN (SELECT ${productId}::text UNION ALL SELECT ${customerId}::text UNION ALL SELECT id::text FROM customer_orders WHERE customer_id=${customerId} UNION ALL SELECT p.id::text FROM customer_order_payments p JOIN customer_orders o ON o.id=p.order_id WHERE o.customer_id=${customerId} UNION ALL SELECT d.id::text FROM customer_order_deliveries d JOIN customer_orders o ON o.id=d.order_id WHERE o.customer_id=${customerId} UNION ALL SELECT id::text FROM sales WHERE customer_id=${customerId} UNION ALL SELECT r.id::text FROM sales_returns r JOIN sales s ON s.id=r.original_sale_id WHERE s.customer_id=${customerId})`;
      await tx`DELETE FROM sales_returns WHERE original_sale_id IN (SELECT id FROM sales WHERE customer_id=${customerId} AND business_id=${businessId})`;
      await tx`DELETE FROM sales WHERE customer_id=${customerId} AND business_id=${businessId}`;
      await tx`DELETE FROM customer_orders WHERE customer_id=${customerId} AND business_id=${businessId}`;
      await tx`DELETE FROM customers WHERE id=${customerId} AND business_id=${businessId}`;
      await tx`DELETE FROM products WHERE id=${productId} AND business_id=${businessId}`;
    });
  await db.end();
  writeFileSync(
    new URL('.cache/customer-orders-browser-local.json', root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: Private credentials and sessions are excluded.
  console.log(JSON.stringify(result));
}
