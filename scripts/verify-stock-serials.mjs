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
const name = `Serial browser ${id.slice(0, 8)}`;
const prefix = id.slice(0, 8).toUpperCase();
const A = `${prefix}-A`;
const B = `${prefix}-B`;
const C = `${prefix}-C`;
const R = `${prefix}-RECEIVED`;
const shots = new URL('.cache/stock-serials-screenshots/', root);
mkdirSync(shots, { recursive: true });
const result = { checks: [], passed: false };
let browser;
let page;
let businessId;
const serialField = () => page.getByLabel('Serial numbers (one per line)', { exact: true });
async function mobile(label) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({
    path: fileURLToPath(new URL(`${label}-mobile.png`, shots)),
    fullPage: true,
  });
  for (const selector of ['select[name="productId"]', 'input[name="serial"]', 'textarea']) {
    for (const item of await page.locator(selector).all())
      if (await item.isVisible()) {
        const box = await item.boundingBox();
        assert(box && box.width >= 200, `${label}: unreadable ${selector} width ${box?.width}`);
      }
  }
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${label}: mobile overflow`,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function checkout(codes) {
  await page.goto(`${origin}/sales/new`);
  await page.getByLabel('Store', { exact: true }).selectOption(seed.stores[0].id);
  await page.getByLabel('Bill type', { exact: true }).selectOption('non_gst_bill');
  await page.locator('#search').fill(name);
  await page.getByRole('button').filter({ hasText: name }).first().click();
  await page
    .locator('tbody tr')
    .filter({ hasText: name })
    .locator('input')
    .first()
    .fill(String(codes.length));
  await serialField().fill(codes.join('\n'));
  await mobile(`checkout-${codes.length}`);
  await page.getByRole('button', { name: 'Save bill (F2)', exact: true }).click();
  await page.waitForURL(`${origin}/sales`);
  const [bill] =
    await db`SELECT s.id,s.bill_no FROM sales s JOIN sale_items i ON i.sale_id=s.id WHERE i.product_id=${id} ORDER BY s.created_at DESC LIMIT 1`;
  assert(bill);
  return bill;
}
try {
  const [directory] = await db`SHOW data_directory`;
  assert(directory.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'));
  const [tenant] =
    await db`SELECT u.business_id FROM "user" u JOIN stores s ON s.business_id=u.business_id::uuid WHERE u.email=${owner.email} AND s.id=${seed.stores[0].id}`;
  assert(tenant);
  businessId = tenant.business_id;
  await db`INSERT INTO products(id,business_id,store_id,name,unit_type,unit_symbol,price,cost_price,inventory) VALUES (${id},${businessId},${seed.stores[0].id},${name},'piece','pc',100,50,3)`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.goto(`${origin}/inventory/serials`);
  await page.getByText('Enable serial tracking for a product', { exact: true }).click();
  await page.getByLabel('Product to reconcile', { exact: true }).selectOption(id);
  await serialField().fill([A.toLowerCase(), B, C].join('\n'));
  await page.getByLabel('Warranty months', { exact: true }).fill('12');
  await page.getByLabel('Warranty issuer', { exact: true }).fill('Acceptance manufacturer');
  await mobile('activation');
  await page
    .getByRole('button', { name: 'Reconcile and enable serial tracking', exact: true })
    .click();
  await page.waitForURL(`${origin}/inventory/serials?productId=${id}`);
  const [active] =
    await db`SELECT serial_tracking,inventory,(SELECT count(*) FROM stock_serials WHERE product_id=${id}) AS units FROM products WHERE id=${id}`;
  assert.equal(active.serial_tracking, true);
  assert.equal(Number(active.inventory), 3);
  assert.equal(Number(active.units), 3);
  result.checks.push('Physical serial reconciliation normalizes codes without changing quantity');
  const bill = await checkout([A, B]);
  result.checks.push('Checkout requires the exact sold units and saves two serials');
  await page.goto(`${origin}/sales/${bill.id}`);
  await page.getByText('Serials & recorded warranty', { exact: true }).click();
  const billText = await page
    .locator('details')
    .filter({ hasText: 'Serials & recorded warranty' })
    .innerText();
  assert(
    billText.includes(A) && billText.includes(B) && billText.includes('Acceptance manufacturer'),
  );
  result.checks.push('Web bill shows its immutable serial and warranty snapshots');
  await page.goto(`${origin}/warranties`);
  await page.getByLabel('Exact serial number', { exact: true }).fill(A.toLowerCase());
  await page.getByRole('button', { name: 'Find warranty', exact: true }).click();
  await page.waitForURL((u) => u.pathname === '/warranties' && !!u.searchParams.get('serial'));
  assert.equal(await page.locator('article').count(), 1);
  assert.match(await page.locator('article').innerText(), /12 months/);
  await mobile('warranty');
  result.checks.push('Scoped warranty lookup finds the original bill and recorded issuer');
  await page.goto(`${origin}/returns/new`);
  await page.getByLabel('Original bill number', { exact: true }).fill(bill.bill_no);
  await page.getByLabel('Product', { exact: true }).selectOption(id);
  await page.getByLabel('Qty', { exact: true }).fill('1');
  await serialField().fill(A);
  await mobile('customer-return');
  await page.getByRole('button', { name: 'Create return', exact: true }).click();
  await page.waitForURL(`${origin}/returns`);
  const [returned] = await db`SELECT state FROM stock_serials WHERE product_id=${id} AND code=${A}`;
  assert.equal(returned.state, 'quarantine');
  result.checks.push('Partial customer return quarantines only the selected unit');
  await page.goto(`${origin}/dashboard`);
  await page
    .getByRole('heading', { name: 'Serial units awaiting inspection', exact: true })
    .waitFor();
  assert((await page.locator('[data-dashboard-insights]').innerText()).includes(name));
  result.checks.push('Owner dashboard shows serial inspection priorities');
  await page.goto(`${origin}/inventory/serials?productId=${id}`);
  await page.getByText('Warranty terms for future sales', { exact: true }).click();
  const terms = page.locator('details').filter({ hasText: 'Warranty terms for future sales' });
  await terms.getByLabel('Warranty months', { exact: true }).fill('24');
  await terms.getByLabel('Warranty issuer', { exact: true }).fill('Future acceptance issuer');
  await Promise.all([
    page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() }),
    terms.getByRole('button', { name: 'Save terms for future sales', exact: true }).click(),
  ]);
  await page.waitForLoadState('networkidle');
  const [savedTerms] =
    await db`SELECT warranty_months,warranty_issuer FROM products WHERE id=${id}`;
  assert.equal(savedTerms.warranty_months, 24);
  assert.equal(savedTerms.warranty_issuer, 'Future acceptance issuer');
  await page.goto(`${origin}/inventory/serials?productId=${id}`);
  const unit = page.locator('article').filter({ hasText: A });
  await unit.getByText('Inspect and release', { exact: true }).click();
  await unit
    .getByLabel('Inspection note', { exact: true })
    .fill('Verified matching serial, accessories and condition');
  await Promise.all([
    page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() }),
    unit.getByRole('button', { name: 'Release inspected unit', exact: true }).click(),
  ]);
  await page.waitForLoadState('networkidle');
  await page.goto(`${origin}/inventory/serials?productId=${id}`);
  assert((await page.locator('article').filter({ hasText: A }).innerText()).includes('Available'));
  result.checks.push('Inspection releases an exact returned unit for resale');
  await checkout([A]);
  await page.goto(`${origin}/warranties?serial=${A}`);
  const history = await page.locator('article').allTextContents();
  assert.equal(history.length, 2);
  assert(
    history.some(
      (t) =>
        t.includes('Returned') && t.includes('12 months') && t.includes('Acceptance manufacturer'),
    ),
  );
  assert(history.some((t) => t.includes('24 months') && t.includes('Future acceptance issuer')));
  result.checks.push(
    'Resale records new terms while preserving the returned sale’s original warranty',
  );
  await page.goto(`${origin}/purchases/new`);
  await page.getByLabel('Supplier name', { exact: true }).fill('Serial acceptance supplier');
  await page
    .locator('select')
    .filter({ has: page.locator(`option[value="${id}"]`) })
    .selectOption(id);
  await page.getByPlaceholder('Qty (pc)', { exact: true }).fill('1');
  await page.getByPlaceholder('Unit price', { exact: true }).fill('50');
  await serialField().fill(R);
  await mobile('purchase');
  await page.getByRole('button', { name: 'Create purchase bill', exact: true }).click();
  await page.waitForURL(`${origin}/purchases`);
  const [receipt] =
    await db`SELECT p.bill_no FROM purchases p JOIN purchase_items i ON i.purchase_id=p.id WHERE i.product_id=${id}`;
  assert(receipt);
  result.checks.push('Purchase receipt registers its exact incoming serial');
  await page.goto(`${origin}/purchase-returns/new`);
  await page.getByLabel('Original purchase bill number', { exact: true }).fill(receipt.bill_no);
  await page.getByLabel('Product', { exact: true }).selectOption(id);
  await page.getByLabel('Qty', { exact: true }).fill('1');
  await serialField().fill(R);
  await mobile('supplier-return');
  await page.getByRole('button', { name: 'Create purchase return', exact: true }).click();
  await page.waitForURL(`${origin}/purchase-returns`);
  const [supplierReturn] =
    await db`SELECT state FROM stock_serials WHERE product_id=${id} AND code=${R}`;
  assert.equal(supplierReturn.state, 'supplier_return');
  result.checks.push('Supplier return removes only the serial from the original receipt');
  await page.goto(`${origin}/damage-logs/new`);
  await page.getByLabel('Product', { exact: true }).selectOption(id);
  await page.getByLabel('Quantity', { exact: true }).fill('1');
  await page.getByLabel('Reason', { exact: true }).selectOption('damaged');
  await serialField().fill(C);
  await mobile('damage');
  await page.getByRole('button', { name: 'Log damage', exact: true }).click();
  await page.waitForURL(`${origin}/damage-logs`);
  const [damaged] = await db`SELECT state FROM stock_serials WHERE product_id=${id} AND code=${C}`;
  assert.equal(damaged.state, 'damaged');
  result.checks.push('Damage form writes off the selected physical serial');
  await page.goto(`${origin}/inventory/serials?productId=${id}`);
  await page.getByRole('heading', { name: 'Serial inventory', exact: true }).waitFor();
  await page.locator('article').first().waitFor();
  assert.equal(await page.locator('article').count(), 4);
  await page.screenshot({
    path: fileURLToPath(new URL('owner-desktop.png', shots)),
    fullPage: true,
  });
  await mobile('register');
  const [balance] =
    await db`SELECT p.inventory,(SELECT count(*) FROM stock_serials WHERE product_id=p.id AND state IN ('available','quarantine')) AS physical,(SELECT count(*) FROM stock_serial_events e JOIN stock_serials u ON u.id=e.serial_id WHERE u.product_id=p.id) AS events FROM products p WHERE p.id=${id}`;
  assert.equal(Number(balance.inventory), 0);
  assert.equal(Number(balance.physical), 0);
  assert.equal(Number(balance.events), 11);
  result.checks.push('Physical stock reconciles to zero with all 11 serial movements preserved');
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
    const menu = tab.locator('header').getByRole('button', { name: 'Inventory', exact: true });
    if (await menu.count()) await menu.click();
    assert.equal(
      await tab.locator('header a[href="/inventory/serials"]').count(),
      role === 'admin' ? 1 : 0,
    );
    await tab.goto(`${origin}/inventory/serials`);
    if (role === 'admin')
      await tab.getByRole('heading', { name: 'Serial inventory', exact: true }).waitFor();
    else await tab.getByRole('heading', { name: 'Something went wrong', exact: true }).waitFor();
    assert.equal(
      await tab.getByRole('heading', { name: 'Serial inventory', exact: true }).count(),
      role === 'admin' ? 1 : 0,
    );
    await tab.goto(`${origin}/warranties?serial=${A}`);
    await tab.getByRole('heading', { name: 'Warranty lookup', exact: true }).waitFor();
    const canRead = ['admin', 'sales'].includes(role);
    if (canRead) await tab.locator('article').first().waitFor();
    else
      await tab
        .getByText('Your role does not permit sale warranty records.', { exact: true })
        .waitFor();
    assert.equal(await tab.locator('article').count(), canRead ? 2 : 0);
    result.checks.push(`${role}: serial management and warranty history respect role/store scope`);
    await staff.close();
  }
  result.passed = true;
} catch (error) {
  let message = String(error?.stack ?? error);
  for (const person of [owner, ...seed.users])
    message = message.replaceAll(person.password, '[redacted]');
  result.error = message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (businessId)
    await db.begin(async (tx) => {
      await tx`DELETE FROM audit_logs WHERE business_id=${businessId} AND entity_id IN (SELECT ${id}::text UNION ALL SELECT id::text FROM stock_serials WHERE product_id=${id} UNION ALL SELECT sale_id::text FROM sale_items WHERE product_id=${id} UNION ALL SELECT purchase_id::text FROM purchase_items WHERE product_id=${id} UNION ALL SELECT return_id::text FROM return_items WHERE product_id=${id} UNION ALL SELECT return_id::text FROM purchase_return_items WHERE product_id=${id} UNION ALL SELECT id::text FROM damage_logs WHERE product_id=${id})`;
      await tx`DELETE FROM sales_returns WHERE id IN (SELECT return_id FROM return_items WHERE product_id=${id}) AND business_id=${businessId}`;
      await tx`DELETE FROM purchase_returns WHERE id IN (SELECT return_id FROM purchase_return_items WHERE product_id=${id}) AND business_id=${businessId}`;
      await tx`DELETE FROM sales WHERE id IN (SELECT sale_id FROM sale_items WHERE product_id=${id}) AND business_id=${businessId}`;
      await tx`DELETE FROM purchases WHERE id IN (SELECT purchase_id FROM purchase_items WHERE product_id=${id}) AND business_id=${businessId}`;
      await tx`DELETE FROM damage_logs WHERE product_id=${id} AND business_id=${businessId}`;
      await tx`DELETE FROM products WHERE id=${id} AND business_id=${businessId}`;
    });
  await db.end();
  writeFileSync(
    new URL('.cache/stock-serials-browser-local.json', root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: No credentials or sessions are included.
  console.log(JSON.stringify(result));
}
