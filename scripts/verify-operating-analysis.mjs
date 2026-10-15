import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const require = createRequire(new URL('apps/web/package.json', root));
const { chromium } = require('@playwright/test');
const read = (name) =>
  JSON.parse(readFileSync(new URL(`.local/test-accounts/${name}`, root), 'utf8'));
const owner = read('pro-owner.json');
const seed = read('four-store-seed.json');
const origin = process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3015';
assert(['http://localhost:3015', 'https://mybizoneapp.vercel.app'].includes(origin));
const result = { origin, checks: [], passed: false };
const shots = new URL('.cache/operating-analysis-screenshots/', root);
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
async function analysis(page, query = '') {
  const response = await page.goto(`${origin}/dashboard/analysis${query}`);
  assert.equal(response.status(), 200);
  await page.locator('[data-operating-view]').waitFor();
}
async function mobile(page, name) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}-mobile.png`, shots)),
    fullPage: true,
  });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${name} mobile overflow`,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.locator('[data-dashboard-view]').waitFor();
  await page.getByRole('button', { name: 'Gross profit', exact: true }).click();
  await page
    .getByRole('img', { name: 'Gross profit by day for the selected period', exact: true })
    .waitFor();
  result.checks.push('Master dashboard switches between billed sales and gross-profit trends');
  await page.getByRole('link', { name: 'Operating analysis', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard/analysis');
  await page.locator('[data-operating-view="overview"]').waitFor();
  await page.getByRole('heading', { name: 'Collection priorities', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Returns, discounts and damage', exact: true }).waitFor();
  result.checks.push('Owner opens scoped operating analysis from the master dashboard');
  await page.getByRole('button', { name: 'Gross profit', exact: true }).click();
  await page
    .getByRole('img', { name: 'Gross profit by day for the selected period', exact: true })
    .waitFor();
  await page.getByText('View chart data', { exact: true }).click();
  const chartData = page
    .locator('details')
    .filter({ has: page.getByText('View chart data', { exact: true }) });
  assert.match(await chartData.innerText(), /Gross profit/);
  result.checks.push('Profit toggle and accessible daily data table work in analysis');
  const heatmap = page.getByRole('region', {
    name: 'Hourly bill-count heatmap, scroll horizontally for all hours',
    exact: true,
  });
  const heatmapLink = heatmap.getByRole('link').first();
  await heatmapLink.waitFor();
  const slotUrl = new URL(await heatmapLink.getAttribute('href'), origin);
  await heatmapLink.click();
  await page.waitForURL(
    (url) =>
      url.searchParams.get('hour') === slotUrl.searchParams.get('hour') &&
      url.searchParams.get('weekday') === slotUrl.searchParams.get('weekday'),
  );
  await page.getByRole('heading', { name: 'Bills behind the pattern', exact: true }).waitFor();
  assert.equal(
    await page.locator('select[name="hour"]').inputValue(),
    slotUrl.searchParams.get('hour'),
  );
  assert((await page.locator('#bill-details li').count()) > 0);
  result.checks.push('Selecting a busy-hour cell opens its bill details and preserves scope');
  await page.getByRole('link', { name: 'Clear time filters', exact: true }).click();
  await page.waitForURL((url) => !url.searchParams.has('hour') && !url.searchParams.has('weekday'));
  await page.getByRole('heading', { name: 'Bills behind the pattern', exact: true }).waitFor();
  await page.locator('[data-adjustment="discount"] summary').click();
  await page.locator('[data-adjustment="return"] summary').click();
  assert((await page.locator('[data-adjustment="return"] li').count()) > 0);
  result.checks.push('Adjustment summaries expand into product-level breakdowns');
  const collectionLink = page.getByRole('link', { name: /^Record collection for / }).first();
  const collectionUrl = new URL(await collectionLink.getAttribute('href'), origin);
  await collectionLink.click();
  await page.getByLabel('Customer', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Customer', { exact: true }).inputValue(),
    collectionUrl.searchParams.get('customerId'),
  );
  assert(Number(await page.getByLabel('Amount ₹', { exact: true }).inputValue()) > 0);
  result.checks.push(
    'Collection action opens the correct customer and balance without submitting a payment',
  );
  await analysis(page);
  await page.locator('select[name="range"]').selectOption('today');
  await page.waitForURL(
    (url) => url.pathname === '/dashboard/analysis' && url.searchParams.get('range') === 'today',
  );
  await page.getByRole('heading', { name: 'Collection priorities', exact: true }).waitFor();
  result.checks.push(
    'Analysis date filters stay on the analysis route and preserve current collection priorities',
  );
  await analysis(page);
  await page.locator('select[name="storeId"]').selectOption(seed.stores[0].id);
  await page.waitForURL((url) => url.searchParams.get('storeId') === seed.stores[0].id);
  await page.locator('[data-operating-view]').waitFor();
  assert.equal(
    await page.getByRole('heading', { name: 'Collection priorities', exact: true }).count(),
    0,
  );
  result.checks.push('Store-filtered analysis withholds shared customer balances');
  for (const view of ['operations', 'sales', 'billing', 'inventory', 'accounts']) {
    await analysis(page, `?view=${view}`);
    if (['sales', 'billing', 'inventory'].includes(view))
      assert.equal(
        await page.getByRole('button', { name: 'Gross profit', exact: true }).count(),
        0,
      );
    if (view === 'inventory')
      assert.equal(await page.getByRole('heading', { name: 'Busy hours', exact: true }).count(), 0);
  }
  result.checks.push(
    'Owner can inspect all six relevant workspaces with each workspace’s financial visibility',
  );
  await analysis(page);
  await page.screenshot({
    path: fileURLToPath(new URL('owner-desktop.png', shots)),
    fullPage: true,
  });
  await mobile(page, 'owner');
  result.checks.push('Owner analysis including the hourly heatmap fits a 360px viewport');
  await page.locator('select[name="weekday"]').selectOption('1');
  await page.locator('select[name="hour"]').selectOption('0');
  await page.getByRole('button', { name: 'Review bills', exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === '/dashboard/analysis' &&
      url.searchParams.get('weekday') === '1' &&
      url.searchParams.get('hour') === '0',
  );
  await page.locator('[data-operating-view="overview"]').waitFor();
  assert.equal(await page.locator('select[name="hour"]').inputValue(), '0');
  assert.equal(new URL(page.url()).searchParams.get('view'), 'overview');
  result.checks.push(
    'Explicit weekday/hour form submits a native GET while preserving workspace filters',
  );
  await context.close();
  for (const role of [
    'admin',
    'shop_manager',
    'branch_manager',
    'floor_manager',
    'sales',
    'billing',
    'inventory',
    'accounts',
    'marketing',
  ]) {
    const person = seed.users.find((user) => user.role === role);
    const staffContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      assert.equal(
        (
          await staffContext.request.post(`${origin}/api/emp-signin`, {
            data: { empId: person.empId, password: person.password },
          })
        ).status(),
        200,
        role,
      );
      const staff = await staffContext.newPage();
      await staff.goto(`${origin}/dashboard`);
      await staff.locator('[data-dashboard-view]').waitFor();
      if (role === 'marketing') {
        assert.equal(
          await staff.getByRole('link', { name: 'Operating analysis', exact: true }).count(),
          0,
        );
        await staff.goto(`${origin}/dashboard/analysis`);
        await staff.getByRole('heading', { name: 'Analysis access', exact: true }).waitFor();
        result.checks.push(
          'Marketing retains the customer workspace and cannot open operating analysis',
        );
        continue;
      }
      await staff.getByRole('link', { name: 'Operating analysis', exact: true }).click();
      await staff.waitForURL((url) => url.pathname === '/dashboard/analysis');
      await staff.locator('[data-operating-view]').waitFor();
      const text = await staff.locator('main').innerText();
      if (person.storeId) {
        for (const store of seed.stores.filter((store) => store.id !== person.storeId))
          assert(!text.includes(store.name), `${role} other store metadata`);
        assert.equal(
          await staff.getByRole('heading', { name: 'Collection priorities', exact: true }).count(),
          0,
        );
      }
      if (['floor_manager', 'sales', 'billing', 'inventory'].includes(role))
        assert.equal(
          await staff.getByRole('button', { name: 'Gross profit', exact: true }).count(),
          0,
        );
      if (role === 'floor_manager') {
        assert(!text.includes('DEMO-BILL-'));
        assert(!text.includes('Recorded stock cost'));
        for (const product of seed.products.filter(
          (product) => product.departmentId !== person.departmentId,
        ))
          assert(!text.includes(product.name), `Floor saw ${product.name}`);
        await mobile(staff, 'floor');
      }
      if (role === 'inventory') {
        assert.equal(
          await staff.getByRole('heading', { name: 'Busy hours', exact: true }).count(),
          0,
        );
        await mobile(staff, 'inventory');
      }
      if (role === 'accounts') await mobile(staff, 'accounts');
      if (role === 'branch_manager') {
        const other = seed.stores.find((store) => store.id !== person.storeId);
        await staff.goto(`${origin}/dashboard/analysis?storeId=${other.id}`);
        await staff.getByRole('heading', { name: 'Analysis access', exact: true }).waitFor();
        await staff.goto(`${origin}/dashboard/analysis?view=accounts`);
        await staff.getByRole('heading', { name: 'Analysis access', exact: true }).waitFor();
      }
      result.checks.push(
        `${role}: permitted analysis, scoped records and restricted financial visibility`,
      );
    } finally {
      await staffContext.close();
    }
  }
  result.passed = true;
} catch (error) {
  let message = String(error.message);
  for (const person of [owner, ...seed.users])
    message = message.replaceAll(person.password, '[redacted]');
  result.error = message;
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(
    new URL(
      `.cache/operating-analysis-browser-${origin.startsWith('https') ? 'hosted' : 'local'}.json`,
      root,
    ),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: Acceptance output excludes credentials and sessions.
  console.log(JSON.stringify(result));
}
