// Read-only acceptance: opens forms and filters without saving business records.
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
const shots = new URL(`.cache/customer-orders-register-${suffix}-screenshots/`, root);
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
  await navigate(page, '/orders');
  await page.getByRole('heading', { name: 'Customer orders', exact: true }).waitFor();
  await page.getByRole('link', { name: 'New customer order', exact: true }).waitFor();
  result.checks.push('Owner can open the order register and booking entry');
  await navigate(page, `/orders?storeId=${seed.stores[0].id}&view=late&q=no-such-order-acceptance`);
  await page.getByRole('heading', { name: 'Customer orders', exact: true }).waitFor();
  assert.equal(await page.locator('select[name="storeId"]').inputValue(), seed.stores[0].id);
  assert.equal(await page.locator('select[name="view"]').inputValue(), 'late');
  assert.equal(await page.locator('article').count(), 0);
  result.checks.push('Store, promised-date and search filters retain native query state');
  await page.setViewportSize({ width: 360, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({
    path: fileURLToPath(new URL('register-mobile.png', shots)),
    fullPage: true,
  });
  await navigate(page, '/orders/new');
  await page.getByRole('heading', { name: 'New customer order', exact: true }).waitFor();
  await page.getByLabel('Store', { exact: true }).selectOption(seed.stores[0].id);
  for (const label of [
    'Registered customer',
    'Product',
    'Agreed unit price (₹)',
    'Delivery address',
  ]) {
    const field = page.getByLabel(label, { exact: true });
    const box = await field.boundingBox();
    assert(box && box.width >= 220, `${label}: phone field width`);
  }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({
    path: fileURLToPath(new URL('booking-mobile.png', shots)),
    fullPage: true,
  });
  result.checks.push(
    'Register and unsaved booking stay readable at 360px without inventing transactions',
  );
  await navigate(page, '/reports/balance-sheet');
  await page.getByRole('heading', { name: 'Simplified Balance Sheet', exact: true }).waitFor();
  await page.getByText('Customer order advances held', { exact: true }).waitFor();
  await navigate(page, '/reports/due-bills');
  await page.getByRole('heading', { name: 'Due bills', exact: true }).waitFor();
  result.checks.push('Advance liabilities and bill collection reports render with the new schema');
  for (const role of ['admin', 'sales', 'billing', 'accounts', 'inventory', 'floor_manager']) {
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
    await navigate(tab, '/orders');
    await tab.getByRole('heading', { name: 'Customer orders', exact: true }).waitFor();
    const readable =
      ['admin', 'sales', 'billing', 'accounts'].includes(role) && !person.departmentId;
    if (!readable)
      await tab
        .getByText('Your role does not permit orders in this store.', { exact: true })
        .waitFor();
    else await tab.locator('dt').getByText('Awaiting handover', { exact: true }).waitFor();
    assert.equal(
      await tab.getByRole('link', { name: 'New customer order', exact: true }).count(),
      role === 'admin' ? 1 : 0,
    );
    result.checks.push(`${role}: register access and booking controls follow assigned scope`);
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
  await browser.close();
  writeFileSync(
    new URL(`.cache/customer-orders-register-${suffix}.json`, root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: Credentials and sessions are excluded.
  console.log(JSON.stringify(result));
}
