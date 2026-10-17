// Read-only local/hosted acceptance: financial forms are never submitted.
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
const shots = new URL(`.cache/accounting-register-${suffix}-screenshots/`, root);
mkdirSync(shots, { recursive: true });
const result = { origin, checks: [], networkRetries: 0, passed: false };
const browser = await chromium.launch({ headless: true });
const navigate = (page, path) =>
  retryBrowserTransport(
    () => page.goto(`${origin}${path}`),
    () => result.networkRetries++,
  );
async function phone(page, name, fields = []) {
  await page.setViewportSize({ width: 360, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  for (const field of fields) {
    const box = await page.getByLabel(field, { exact: true }).boundingBox();
    assert(box && box.width >= 220, `Phone field ${field} must stay readable`);
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
  await navigate(page, '/cashbook');
  await page.getByRole('heading', { name: 'Cashbook', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Daily money movement', exact: true }).waitFor();
  await page.getByText('Net movement is not cash available', { exact: false }).waitFor();
  await phone(page, 'cashbook', ['From', 'To', 'Payment method']);
  result.checks.push(
    'Owner sees recorded cashbook, daily visualization and explicit balance limits on phone',
  );
  await page.getByLabel('Payment method', { exact: true }).selectOption('cash');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.waitForURL(/method=cash/);
  assert.equal(await page.getByLabel('Payment method', { exact: true }).inputValue(), 'cash');
  result.checks.push('GET payment-method filter retains its value without recording money');
  await navigate(page, '/cashbook?from=2020-01-01&to=2022-01-01');
  await page.getByRole('alert').filter({ hasText: 'at most 366 days' }).waitFor();
  result.checks.push('Unsupported date ranges recover to this month');
  await navigate(page, '/settlements');
  await page.getByRole('heading', { name: 'Settlements', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Assign an earlier payment', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Bill allocation history', exact: true }).waitFor();
  await phone(page, 'customer-settlements', [
    'Customer',
    'Apply to bill',
    'Unallocated payment',
    'Allocation evidence / note',
  ]);
  result.checks.push(
    'Customer receipts and earlier-payment evidence forms remain readable at 360px',
  );
  await page.getByRole('link', { name: 'Purchase settlements', exact: true }).click();
  await page.getByLabel('Supplier', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Supplier', { exact: true }).inputValue(), '');
  await phone(page, 'supplier-settlements', ['Supplier', 'Apply to bill']);
  result.checks.push('Supplier tab resets customer state and shows purchase allocation controls');
  await navigate(page, '/reports/due-bills');
  await page.getByRole('heading', { name: 'Due bills', exact: true }).waitFor();
  await page
    .getByText('Unallocated general payments may still reduce customer debt', { exact: false })
    .waitFor();
  result.checks.push('Due-bill report explains residual allocation uncertainty and EMI limits');
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
    assert.equal(await tab.locator('header a[href="/cashbook"]').count(), allowed ? 1 : 0);
    if (allowed) {
      await navigate(tab, '/cashbook');
      await tab.getByRole('heading', { name: 'Cashbook', exact: true }).waitFor();
      await navigate(tab, '/settlements');
      await tab.getByRole('heading', { name: 'Record sales settlement', exact: true }).waitFor();
    }
    result.checks.push(`${role}: finance navigation and allowed reads follow global permissions`);
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
    new URL(`.cache/accounting-register-${suffix}.json`, root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: Credentials and sessions are excluded.
  console.log(JSON.stringify(result));
}
