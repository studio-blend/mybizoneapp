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
const shots = new URL('.cache/dashboard-screenshots/', root);
const shotPath = (name) => fileURLToPath(new URL(name, shots));
mkdirSync(shots, { recursive: true });
const result = { origin, checks: [], passed: false };
const browser = await chromium.launch({ headless: true });
async function dashboard(page, query = '') {
  const response = await page.goto(`${origin}/dashboard${query}`);
  assert.equal(response.status(), 200);
  await page.locator('[data-dashboard-view]').waitFor();
  assert.equal(
    await page.getByRole('heading', { name: /couldn.t load|Something went wrong/ }).count(),
    0,
  );
}
async function mobile(page, name) {
  await page.setViewportSize({ width: 360, height: 800 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    `Mobile overflow: ${name}`,
  );
  await page.screenshot({
    path: shotPath(`${name}-mobile.png`),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.getByRole('heading', { name: 'Master dashboard', exact: true }).waitFor();
  const workspaces = [
    'overview',
    'operations',
    'sales',
    'billing',
    'inventory',
    'accounts',
    'marketing',
  ];
  assert.equal(await page.locator('select[name="view"] option').count(), 7);
  for (const view of workspaces) {
    await dashboard(page, `?view=${view}`);
    assert.equal(
      await page.locator('[data-dashboard-view]').getAttribute('data-dashboard-view'),
      view,
    );
    if (view === 'marketing') assert.equal(await page.locator('select[name="storeId"]').count(), 0);
    result.checks.push(`Owner opens ${view}`);
  }
  await dashboard(page);
  await page.screenshot({
    path: shotPath('owner-desktop.png'),
    fullPage: true,
  });
  await mobile(page, 'owner');
  const first = seed.stores[0];
  await page.locator('select[name="storeId"]').selectOption(first.id);
  await page.waitForURL((url) => url.searchParams.get('storeId') === first.id);
  await page.locator('form[aria-label="Dashboard filters"][aria-busy="false"]').waitFor();
  assert.equal(
    await page.getByRole('heading', { name: 'Business ledger', exact: true }).count(),
    0,
  );
  result.checks.push('Owner store filter updates without displaying shared ledger totals');
  await page.locator('select[name="departmentId"]').selectOption(first.departments[0].id);
  await page.waitForURL((url) => url.searchParams.get('departmentId') === first.departments[0].id);
  await page.locator('form[aria-label="Dashboard filters"][aria-busy="false"]').waitFor();
  result.checks.push('Owner department filter works');
  await dashboard(
    page,
    `?view=operations&storeId=${first.id}&departmentId=${first.departments[0].id}`,
  );
  await page.getByRole('heading', { name: 'Stock on hand', exact: true }).waitFor();
  assert.equal(await page.getByText('Gross profit', { exact: true }).count(), 0);
  result.checks.push('Owner opens a department operations workspace');
  await page.close();

  const defaults = {
    admin: 'overview',
    shop_manager: 'overview',
    branch_manager: 'operations',
    floor_manager: 'operations',
    sales: 'sales',
    billing: 'billing',
    inventory: 'inventory',
    accounts: 'accounts',
    marketing: 'marketing',
  };
  for (const [role, view] of Object.entries(defaults)) {
    const person = seed.users.find(
      (u) => u.role === role && !(role === 'billing' && u.storeId === first.id),
    );
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const login = await context.request.post(`${origin}/api/emp-signin`, {
        data: { empId: person.empId, password: person.password },
      });
      assert.equal(login.status(), 200, role);
      const staff = await context.newPage();
      await dashboard(staff);
      assert.equal(
        await staff.locator('[data-dashboard-view]').getAttribute('data-dashboard-view'),
        view,
        role,
      );
      const content = await staff.locator('main').innerText();
      if (person.storeId) {
        for (const store of seed.stores.filter((s) => s.id !== person.storeId))
          assert(!content.includes(store.name), `${role}: other store metadata`);
        assert.equal(
          await staff.getByRole('heading', { name: 'Business ledger', exact: true }).count(),
          0,
        );
      }
      if (['sales', 'billing', 'inventory', 'floor_manager', 'marketing'].includes(role))
        assert(!content.includes('Gross profit'), role);
      if (role === 'floor_manager') {
        const own = seed.products.filter((p) => p.departmentId === person.departmentId);
        const other = seed.products.filter((p) => p.departmentId !== person.departmentId);
        for (const product of own) assert(content.includes(product.name));
        for (const product of other)
          assert(!content.includes(product.name), `Floor scope: ${product.name}`);
        await staff.screenshot({
          path: shotPath('floor-desktop.png'),
          fullPage: true,
        });
        await mobile(staff, 'floor');
      }
      if (['billing', 'sales', 'inventory', 'marketing'].includes(role)) {
        assert.equal(
          await staff.getByRole('button', { name: 'Settings', exact: true }).count(),
          0,
          role,
        );
        assert.equal(
          await staff.getByRole('button', { name: 'Reports', exact: true }).count(),
          0,
          role,
        );
      }
      if (role === 'branch_manager') {
        const other = seed.stores.find((s) => s.id !== person.storeId);
        await staff.goto(`${origin}/dashboard?storeId=${other.id}`);
        await staff.getByRole('heading', { name: 'Dashboard access', exact: true }).waitFor();
        assert.equal(await staff.locator('main dd').count(), 0);
        await staff.goto(`${origin}/dashboard?view=overview`);
        await staff.getByRole('heading', { name: 'Dashboard access', exact: true }).waitFor();
        result.checks.push('Branch URL tampering rejected for other stores and master dashboard');
      }
      if (role === 'inventory') await mobile(staff, 'inventory');
      if (role === 'marketing') await mobile(staff, 'marketing');
      result.checks.push(`${role}: correct workspace, scoped data and navigation`);
    } finally {
      await context.close();
    }
  }
  const multi = seed.users.find((u) => u.empId === 'EMPFUR1BILL');
  const context = await browser.newContext();
  try {
    assert.equal(
      (
        await context.request.post(`${origin}/api/emp-signin`, {
          data: { empId: multi.empId, password: multi.password },
        })
      ).status(),
      200,
    );
    const page = await context.newPage();
    await dashboard(page);
    assert.deepEqual(
      await page
        .locator('select[name="view"] option')
        .evaluateAll((options) => options.map((o) => o.value)),
      ['sales', 'billing'],
    );
    await page.locator('select[name="view"]').selectOption('billing');
    await page.waitForURL((url) => url.searchParams.get('view') === 'billing');
    await page.locator('[data-dashboard-view="billing"]').waitFor();
    result.checks.push('Multiple-role staff switch between sales and billing workspaces');
  } finally {
    await context.close();
  }
  result.passed = true;
} catch (error) {
  let message = String(error.message);
  for (const user of [owner, ...seed.users])
    message = message.replaceAll(user.password, '[redacted]');
  result.error = message;
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(
    new URL(
      `.cache/dashboard-browser-${origin.startsWith('https') ? 'hosted' : 'local'}.json`,
      root,
    ),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: Acceptance summary excludes credentials and sessions.
  console.log(JSON.stringify(result));
}
