// Read-only acceptance: no recipe, preparation or waste form is submitted.
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
const shots = new URL(`.cache/kitchen-register-${suffix}-screenshots/`, root);
mkdirSync(shots, { recursive: true });
const result = { origin, checks: [], networkRetries: 0, passed: false };
const browser = await chromium.launch({ headless: true });
const navigate = (page, path) =>
  retryBrowserTransport(
    () => page.goto(`${origin}${path}`),
    () => result.networkRetries++,
  );
async function mobile(page, name) {
  await page.setViewportSize({ width: 360, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}-mobile.png`, shots)),
    fullPage: true,
  });
}
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(60000);
  await navigate(page, '/login');
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await navigate(page, '/kitchen');
  await page.getByRole('heading', { name: 'Kitchen preparation', exact: true }).waitFor();
  await page.getByText('No kitchen tickets match these filters.', { exact: true }).waitFor();
  assert.equal(await page.locator('article').count(), 0);
  await mobile(page, 'empty-queue');
  result.checks.push('Owner opens the empty kitchen queue with no fabricated prep history');
  await navigate(page, `/kitchen?store=${seed.stores[0].id}&view=preparing`);
  assert.equal(await page.locator('select[name="store"]').inputValue(), seed.stores[0].id);
  assert.equal(await page.locator('select[name="view"]').inputValue(), 'preparing');
  result.checks.push('Native store and preparation-status filters retain their query state');
  await navigate(page, '/kitchen/recipes');
  await page.getByRole('heading', { name: 'Recipe versions', exact: true }).waitFor();
  await page.getByText('No recipe versions yet.', { exact: false }).waitFor();
  const output = page.getByLabel('Prepared product', { exact: true });
  const options = await output
    .locator('option')
    .evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  assert(options.length > 0);
  await output.selectOption(options[0]);
  await mobile(page, 'recipe-form');
  for (const field of [
    output,
    page.getByLabel('Recipe name / version', { exact: true }),
    page.getByLabel('Expected yield per batch', { exact: false }),
    page.getByLabel('Ingredient 1', { exact: true }),
  ]) {
    const box = await field.boundingBox();
    assert(box && box.width >= 220);
  }
  result.checks.push('Unsaved recipe fields and stock-unit guidance remain readable at 360px');
  await navigate(page, '/kitchen/waste');
  await page.getByRole('heading', { name: 'Kitchen waste', exact: true }).waitFor();
  await page.getByText('No kitchen waste recorded yet.', { exact: true }).waitFor();
  const product = page.getByLabel('Wasted product / ingredient', { exact: true });
  const ids = await product
    .locator('option')
    .evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  assert(ids.length > 0);
  await product.selectOption(ids[0]);
  await mobile(page, 'waste-form');
  await page.getByLabel('Waste explanation / kitchen reference', { exact: true }).waitFor();
  result.checks.push(
    'Existing stock can be selected in an unsaved waste form without discarding it',
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
      await tab.locator('header a[href="/kitchen"]').count(),
      ['admin', 'inventory'].includes(role) ? 1 : 0,
    );
    if (['admin', 'inventory'].includes(role)) {
      await navigate(tab, '/kitchen');
      await tab.getByRole('heading', { name: 'Kitchen preparation', exact: true }).waitFor();
    }
    result.checks.push(`${role}: kitchen entry and read access follow stock permissions`);
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
    new URL(`.cache/kitchen-register-${suffix}.json`, root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: Credentials and sessions are excluded.
  console.log(JSON.stringify(result));
}
