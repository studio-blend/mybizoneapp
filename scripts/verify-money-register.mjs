// Read-only acceptance. This runner never submits a financial command.
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
const shots = new URL(`.cache/money-register-${suffix}-screenshots/`, root);
mkdirSync(shots, { recursive: true });
const result = { origin, checks: [], networkRetries: 0, passed: false };
const browser = await chromium.launch({ headless: true });
const navigate = (p, path) =>
  retryBrowserTransport(
    () => p.goto(`${origin}${path}`),
    () => result.networkRetries++,
  );
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultNavigationTimeout(60000);
  await navigate(page, '/login');
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await navigate(page, '/money');
  await page.getByRole('heading', { name: 'Cash & bank', exact: true }).waitFor();
  await page
    .getByText('Available amounts below use cleared entries less reserved outgoing money.', {
      exact: false,
    })
    .waitFor();
  result.checks.push(
    'Owner sees account setup or recorded positions with explicit balance qualifications',
  );
  await page.setViewportSize({ width: 360, height: 800 });
  for (const kind of [
    'account',
    'opening',
    'source',
    'transfer',
    'clear',
    'bounce',
    'cancel',
    'reverse',
    'offset',
  ]) {
    await page.getByLabel('Action', { exact: true }).selectOption(kind);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const field of await page.locator('fieldset input,fieldset select').all()) {
      const box = await field.boundingBox();
      assert(box && box.width >= 220);
    }
  }
  await page.screenshot({
    path: fileURLToPath(new URL('all-command-modes-phone.png', shots)),
    fullPage: true,
  });
  result.checks.push(
    'All nine account command modes retain usable full-width controls on 360px phones',
  );
  await navigate(page, '/money?saved=00000000-0000-4000-8000-000000000000');
  assert.equal(await page.locator('output').count(), 0);
  result.checks.push('Forged saved IDs cannot display a success confirmation');
  for (const tab of ['sales', 'purchases']) {
    await navigate(page, `/reports/credit-ageing?tab=${tab}`);
    await page.getByRole('heading', { name: 'Credit bill reconciliation', exact: true }).waitFor();
    await page
      .getByRole('heading', { name: 'Remaining value by invoice age', exact: true })
      .waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({
      path: fileURLToPath(new URL(`${tab}-credit-phone.png`, shots)),
      fullPage: true,
    });
    result.checks.push(
      `${tab}: ordinary credit evidence, invoice-age bars and reconciliation limits display on mobile`,
    );
  }
  await navigate(page, '/dashboard');
  await page
    .getByRole('heading', { name: 'Cash & bank · current position', exact: true })
    .waitFor();
  await page.getByRole('link', { name: 'Manage cash & bank clearing', exact: true }).waitFor();
  result.checks.push('Owner master dashboard links to current account positions');
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
    assert.equal(await tab.locator('header a[href="/money"]').count(), allowed ? 1 : 0);
    for (const path of ['/money', '/reports/credit-ageing']) {
      await navigate(tab, path);
      if (allowed)
        await tab
          .getByRole('heading', {
            name: path === '/money' ? 'Cash & bank' : 'Credit bill reconciliation',
            exact: true,
          })
          .waitFor();
      else {
        assert.equal(await tab.getByLabel('Action', { exact: true }).count(), 0);
        assert.equal(
          await tab
            .getByRole('heading', { name: 'Credit bill reconciliation', exact: true })
            .count(),
          0,
        );
      }
    }
    result.checks.push(`${role}: navigation and both finance pages follow global permissions`);
    await staff.close();
  }
  result.passed = true;
} catch (e) {
  let message = String(e.stack ?? e);
  for (const p of [owner, ...seed.users]) message = message.replaceAll(p.password, '[redacted]');
  result.error = message;
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(
    new URL(`.cache/money-register-${suffix}.json`, root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: No credentials or sessions are printed.
  console.log(JSON.stringify(result));
}
