// Read-only acceptance: this runner never submits a financial command.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { retryBrowserTransport } from './browser-transport.mjs';
const root = new URL('../', import.meta.url);
const { chromium } = createRequire(new URL('apps/web/package.json', root))('@playwright/test');
const owner = JSON.parse(
  readFileSync(new URL('.local/test-accounts/pro-owner.json', root), 'utf8'),
);
const seed = JSON.parse(
  readFileSync(new URL('.local/test-accounts/four-store-seed.json', root), 'utf8'),
);
const origin = process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3015';
assert(['http://localhost:3015', 'https://mybizoneapp.vercel.app'].includes(origin));
const suffix = origin.startsWith('https:') ? 'hosted' : 'local';
const shots = new URL(`.cache/funds-register-${suffix}-screenshots/`, root);
mkdirSync(shots, { recursive: true });
const result = { origin, checks: [], networkRetries: 0, passed: false };
const browser = await chromium.launch({ headless: true });
const navigate = (page, path) =>
  retryBrowserTransport(
    () => page.goto(`${origin}${path}`),
    () => result.networkRetries++,
  );
async function phone(page, name) {
  await page.setViewportSize({ width: 360, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  for (const label of ['Action', 'Evidence / reason']) {
    const box = await page.getByLabel(label, { exact: true }).boundingBox();
    assert(box && box.width >= 220);
  }
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, shots)), fullPage: true });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultNavigationTimeout(60000);
  await navigate(page, '/login');
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await navigate(page, '/settlements/funds');
  await page.getByRole('heading', { name: 'Advances & refunds', exact: true }).waitFor();
  await page.getByText('Unused customer advances', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Return refunds to resolve', exact: true }).waitFor();
  await phone(page, 'customer-funds');
  result.checks.push('Owner sees advances, refund priorities and readable phone controls');
  await page.getByRole('link', { name: 'Supplier funds', exact: true }).click();
  await page.getByLabel('Supplier', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Supplier', { exact: true }).inputValue(), '');
  await phone(page, 'supplier-funds');
  result.checks.push('Native supplier tab resets customer state and retains readable controls');
  for (const kind of [
    'advance_apply',
    'advance_refund',
    'return_refund',
    'settlement_reverse',
    'allocation_reverse',
    'money_reverse',
  ]) {
    await page.getByLabel('Action', { exact: true }).selectOption(kind);
    await page.getByLabel('Source record', { exact: true }).waitFor();
    if (kind.endsWith('_reverse')) {
      assert.equal(await page.getByRole('checkbox').count(), 1);
      assert.equal(await page.getByLabel('Amount ₹', { exact: true }).count(), 0);
    } else assert.equal(await page.getByLabel('Amount ₹', { exact: true }).count(), 1);
  }
  result.checks.push(
    'All command modes expose their required source and full-correction confirmation without submitting',
  );
  await navigate(page, '/settlements/funds?saved=00000000-0000-4000-8000-000000000000');
  assert.equal(await page.locator('output').filter({ hasText: 'Saved:' }).count(), 0);
  result.checks.push('A forged saved ID cannot display a success confirmation');
  await navigate(page, '/cashbook');
  await page
    .getByText('Applying an advance or assigning a bill never adds money again.', { exact: false })
    .waitFor();
  result.checks.push('Cashbook explains actual money versus advance applications');
  await navigate(page, '/reports/balance-sheet');
  await page.getByText('Unused general customer advances', { exact: true }).waitFor();
  await page.getByText('Supplier return refunds receivable', { exact: true }).waitFor();
  result.checks.push('Management report separates advance assets and refund liabilities');
  for (const role of ['admin', 'accounts', 'sales', 'billing', 'inventory', 'floor_manager']) {
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
    const menu = tab.locator('header').getByRole('button', { name: 'Billing', exact: true });
    if (await menu.count()) await menu.click();
    const allowed = ['admin', 'accounts'].includes(role);
    assert.equal(await tab.locator('header a[href="/settlements/funds"]').count(), allowed ? 1 : 0);
    if (allowed) {
      await navigate(tab, '/settlements/funds');
      await tab.getByRole('heading', { name: 'Advances & refunds', exact: true }).waitFor();
      await tab.getByLabel('Action', { exact: true }).waitFor();
    } else {
      await navigate(tab, '/settlements/funds');
      assert.equal(await tab.getByLabel('Action', { exact: true }).count(), 0);
    }
    result.checks.push(
      `${role}: finance navigation and direct-page access follow global permissions`,
    );
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
    new URL(`.cache/funds-register-${suffix}.json`, root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: No credentials or sessions are printed.
  console.log(JSON.stringify(result));
}
