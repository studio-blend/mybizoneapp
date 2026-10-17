// Read-only rollout acceptance. No pack, customer, stock or financial form is saved.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { retryBrowserTransport } from './browser-transport.mjs';
const root = new URL('../', import.meta.url);
const require = createRequire(new URL('apps/web/package.json', root));
const { chromium } = require('@playwright/test');
const owner = JSON.parse(
  readFileSync(new URL('.local/test-accounts/pro-owner.json', root), 'utf8'),
);
const seed = JSON.parse(
  readFileSync(new URL('.local/test-accounts/four-store-seed.json', root), 'utf8'),
);
const origin = process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3015';
assert(['http://localhost:3015', 'https://mybizoneapp.vercel.app'].includes(origin));
const suffix = origin.startsWith('https:') ? 'hosted' : 'local';
const shots = new URL(`.cache/wholesale-register-${suffix}-screenshots/`, root);
mkdirSync(shots, { recursive: true });
const result = { origin, checks: [], networkRetries: 0, passed: false };
const browser = await chromium.launch({ headless: true });
const navigate = (page, path) =>
  retryBrowserTransport(
    () => page.goto(`${origin}${path}`),
    () => result.networkRetries++,
  );
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(60000);
  await navigate(page, '/login');
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await navigate(page, '/inventory/packs');
  await page.getByRole('heading', { name: 'Pack definitions', exact: true }).waitFor();
  await page.getByText('No pack definitions yet.', { exact: false }).waitFor();
  assert.equal(await page.locator('article').count(), 0);
  result.checks.push('Owner opens an empty pack register without invented conversions');
  const picker = page.getByLabel('Product to pack', { exact: true });
  const options = await picker
    .locator('option')
    .evaluateAll((items) => items.map((x) => x.value).filter(Boolean));
  assert(options.length > 0);
  await picker.selectOption(options[0]);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const field of [
    picker,
    page.getByLabel('Pack name', { exact: true }),
    page.getByLabel('Stock units per pack', { exact: false }),
  ]) {
    const box = await field.boundingBox();
    assert(box && box.width >= 220);
  }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({
    path: fileURLToPath(new URL('pack-form-mobile.png', shots)),
    fullPage: true,
  });
  result.checks.push('Unsaved pack definition and conversion help remain readable at 360px');
  await navigate(page, '/orders?trade=wholesale&view=late&q=unknown-wholesale-acceptance');
  await page.getByRole('heading', { name: 'Customer orders', exact: true }).waitFor();
  assert.equal(await page.locator('select[name="trade"]').inputValue(), 'wholesale');
  assert.equal(await page.locator('select[name="view"]').inputValue(), 'late');
  assert.equal(await page.locator('article').count(), 0);
  await page.screenshot({
    path: fileURLToPath(new URL('wholesale-queue-mobile.png', shots)),
    fullPage: true,
  });
  await navigate(page, '/orders/new?trade=wholesale');
  await page.getByRole('heading', { name: 'New customer order', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Order type', { exact: true }).inputValue(), 'wholesale');
  result.checks.push(
    'Wholesale queue filters and unsaved booking preserve the selected order type',
  );
  const customers = page.getByLabel('Registered customer', { exact: true });
  const ids = await customers
    .locator('option')
    .evaluateAll((items) => items.map((x) => x.value).filter(Boolean));
  assert(ids.length > 0);
  await navigate(page, `/customers/${ids[0]}/edit`);
  await page.getByLabel('Credit days', { exact: true }).waitFor();
  await page.getByLabel('Credit Limit ₹', { exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({
    path: fileURLToPath(new URL('credit-fields-mobile.png', shots)),
    fullPage: true,
  });
  result.checks.push(
    'Existing customer terms and credit ceiling render without submitting changes',
  );
  await navigate(page, '/purchases');
  await page.getByRole('heading', { name: 'Purchase Bills', exact: true }).waitFor();
  const bill = page.locator('tbody a[href^="/purchases/"]').first();
  const number = await bill.innerText();
  await bill.click();
  await page.getByRole('heading', { name: number, exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Received items', exact: true }).waitFor();
  assert((await page.locator('article').count()) > 0);
  result.checks.push(
    'Existing purchase receipt opens its immutable base quantities without fabricating pack history',
  );
  for (const role of ['admin', 'inventory', 'sales', 'billing', 'accounts', 'floor_manager']) {
    const person = seed.users.find((p) => p.role === role);
    assert(person);
    const staff = await browser.newContext();
    const response = await retryBrowserTransport(
      () =>
        staff.request.post(`${origin}/api/emp-signin`, {
          data: { empId: person.empId, password: person.password },
        }),
      () => result.networkRetries++,
    );
    assert.equal(response.status(), 200);
    const tab = await staff.newPage();
    tab.setDefaultNavigationTimeout(60000);
    await navigate(tab, '/dashboard');
    await tab.locator('[data-dashboard-view]').waitFor();
    const menu = tab.locator('header').getByRole('button', { name: 'Inventory', exact: true });
    if (await menu.count()) await menu.click();
    assert.equal(
      await tab.locator('header a[href="/inventory/packs"]').count(),
      ['admin', 'inventory'].includes(role) ? 1 : 0,
    );
    if (['admin', 'inventory'].includes(role)) {
      await navigate(tab, '/inventory/packs');
      await tab.getByRole('heading', { name: 'Pack definitions', exact: true }).waitFor();
    }
    result.checks.push(`${role}: pack configuration navigation and access follow scope`);
    await staff.close();
  }
  result.passed = true;
} catch (error) {
  let message = String(error.stack ?? error);
  for (const p of [owner, ...seed.users]) message = message.replaceAll(p.password, '[redacted]');
  result.error = message;
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(
    new URL(`.cache/wholesale-register-${suffix}.json`, root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: Credentials and sessions are excluded.
  console.log(JSON.stringify(result));
}
