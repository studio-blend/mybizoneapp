// Read-only acceptance for an unactivated demo account, locally or after deployment.
// This script never submits reconciliation, inventory or financial mutations.
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
const shots = new URL(`.cache/stock-serials-register-${suffix}-screenshots/`, root);
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
  await navigate(page, '/login');
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await navigate(page, '/inventory/serials');
  await page.getByRole('heading', { name: 'Serial inventory', exact: true }).waitFor();
  await page.getByText('No serials match these filters.', { exact: false }).waitFor();
  assert.equal(await page.locator('article').count(), 0);
  result.checks.push('Owner opens serial register with no invented unit identities');
  await page.getByText('Enable serial tracking for a product', { exact: true }).click();
  const product = page.getByLabel('Product to reconcile', { exact: true });
  const options = await product
    .locator('option')
    .evaluateAll((items) => items.map((item) => item.value).filter(Boolean));
  assert(options.length > 0);
  await product.selectOption(options[0]);
  await page.getByText('Current physical stock:', { exact: false }).waitFor();
  await page.getByLabel('Warranty months', { exact: true }).waitFor();
  await page.getByLabel('Warranty issuer', { exact: true }).waitFor();
  result.checks.push('Opening serial and warranty defaults are shown without saving activation');
  await page.setViewportSize({ width: 360, height: 800 });
  for (const field of [
    page.locator('select[name="productId"]'),
    page.getByLabel('Serial numbers (one per line)', { exact: true }),
  ]) {
    const box = await field.boundingBox();
    assert(box && box.width >= 240);
  }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({
    path: fileURLToPath(new URL('reconciliation-mobile.png', shots)),
    fullPage: true,
  });
  result.checks.push('Expanded reconciliation fields remain readable on a 360px phone');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate(page, '/inventory/serials?state=quarantine');
  await page.getByRole('heading', { name: 'Serial inventory', exact: true }).waitFor();
  assert.equal(await page.locator('select[name="state"]').inputValue(), 'quarantine');
  assert.equal(await page.locator('article').count(), 0);
  result.checks.push('Serial state filter preserves the empty unactivated register');
  await navigate(page, '/warranties');
  await page.getByRole('heading', { name: 'Warranty lookup', exact: true }).waitFor();
  await page.getByText('No serial sale records match this search.', { exact: false }).waitFor();
  await page.getByLabel('Exact serial number', { exact: true }).fill('UNREGISTERED-ACCEPTANCE');
  await page.getByRole('button', { name: 'Find warranty', exact: true }).click();
  await page.waitForURL(
    (u) =>
      u.pathname === '/warranties' && u.searchParams.get('serial') === 'UNREGISTERED-ACCEPTANCE',
  );
  await page.getByText('No serial sale records match this search.', { exact: false }).waitFor();
  assert.equal(await page.locator('article').count(), 0);
  await page.setViewportSize({ width: 360, height: 800 });
  const lookup = await page.getByLabel('Exact serial number', { exact: true }).boundingBox();
  assert(lookup && lookup.width >= 240);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({
    path: fileURLToPath(new URL('warranty-mobile.png', shots)),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  result.checks.push('Warranty search stays empty for unknown serials and fits a phone');
  for (const [path, heading] of [
    ['/purchases/new', 'New Purchase Bill'],
    ['/purchase-returns/new', 'New Purchase Return'],
    ['/damage-logs/new', 'Log damage'],
  ]) {
    assert.equal((await navigate(page, path)).status(), 200);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('Serial numbers (one per line)', { exact: true }).count(),
      0,
    );
  }
  result.checks.push(
    'Untracked purchase, supplier return and damage forms keep their existing behaviour',
  );
  await ctx.close();
  for (const role of ['admin', 'inventory', 'sales', 'floor_manager']) {
    const person = seed.users.find((item) => item.role === role);
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
    await navigate(tab, '/dashboard');
    await tab.locator('[data-dashboard-view]').waitFor();
    const inventory = tab.locator('header').getByRole('button', { name: 'Inventory', exact: true });
    if (await inventory.count()) await inventory.click();
    assert.equal(
      await tab.locator('header a[href="/inventory/serials"]').count(),
      role === 'admin' ? 1 : 0,
    );
    if (role === 'admin') {
      await navigate(tab, '/inventory/serials');
      await tab.getByRole('heading', { name: 'Serial inventory', exact: true }).waitFor();
    }
    await navigate(tab, '/warranties');
    await tab.getByRole('heading', { name: 'Warranty lookup', exact: true }).waitFor();
    if (['admin', 'sales'].includes(role))
      await tab.getByText('No serial sale records match this search.', { exact: false }).waitFor();
    else
      await tab
        .getByText('Your role does not permit sale warranty records.', { exact: true })
        .waitFor();
    result.checks.push(`${role}: register navigation and warranty access preserve scope`);
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
    new URL(`.cache/stock-serials-register-${suffix}.json`, root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: No credentials or sessions are included.
  console.log(JSON.stringify(result));
}
