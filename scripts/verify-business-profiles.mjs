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
assert(
  seed.stores.length === 4 && seed.stores.every((store) => store.name.startsWith('AR ')),
  'Unexpected fixture',
);
const result = { origin, checks: [], passed: false };
const browser = await chromium.launch({ headless: true });
const shots = new URL('.cache/business-profile-screenshots/', root);
mkdirSync(shots, { recursive: true });
async function save(page, profile, model) {
  await page.getByLabel('What do you sell?', { exact: true }).selectOption(profile);
  await page.getByLabel('How do you sell?', { exact: true }).selectOption(model);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page
    .getByText('Profile saved. Dashboard priorities now use these settings.', { exact: true })
    .waitFor();
  assert.equal(await page.locator('form').getByRole('alert').count(), 0, 'Profile form error');
}
async function dashboard(page, query = '') {
  assert.equal((await page.goto(`${origin}/dashboard${query}`)).status(), 200);
  await page.locator('[data-dashboard-view]').waitFor();
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.goto(`${origin}/settings/business`);
  assert.equal(
    await page.getByLabel('What do you sell?', { exact: true }).locator('option').count(),
    6,
  );
  await save(page, 'general_retail', 'both');
  const first = seed.stores[0];
  const second = seed.stores[1];
  await page.goto(`${origin}/stores/${first.id}/profile`);
  await save(page, 'furniture', '');
  await dashboard(page, `?storeId=${first.id}`);
  assert.match(
    await page.locator('[data-business-profile]').innerText(),
    /Furniture.*Retail and wholesale.*90 days/,
  );
  result.checks.push('Store industry override independently inherits the business selling model');
  await page.goto(`${origin}/stores/${second.id}/profile`);
  await save(page, '', '');
  await page.goto(`${origin}/settings/business`);
  await save(page, 'electronics', 'retail');
  await dashboard(page, `?storeId=${first.id}`);
  assert.match(
    await page.locator('[data-business-profile]').innerText(),
    /Furniture.*Retail.*90 days/,
  );
  await dashboard(page, `?storeId=${second.id}`);
  assert.match(await page.locator('[data-business-profile]').innerText(), /Electronics.*60 days/);
  result.checks.push(
    'Business default updates inherited settings while preserving explicit store overrides',
  );
  await page.goto(`${origin}/settings/business`);
  await save(page, 'general_retail', 'retail');
  const profiles = ['furniture', 'furniture', 'electronics', 'general_retail'];
  for (let i = 0; i < seed.stores.length; i++) {
    await page.goto(`${origin}/stores/${seed.stores[i].id}/profile`);
    await save(page, profiles[i], '');
  }
  await page.goto(`${origin}/stores`);
  for (const store of seed.stores) await page.getByText(store.name, { exact: true }).waitFor();
  result.checks.push(
    'Four demo stores configured as furniture, furniture, electronics and general retail',
  );
  await dashboard(page);
  assert.match(await page.locator('[data-business-profile]').innerText(), /Mixed store profiles/);
  await page.getByRole('heading', { name: 'Product profitability', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Slow stock', exact: true }).waitFor();
  const comparisons = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Store comparison', exact: true }) });
  const comparisonCount = await comparisons.locator('li').count();
  if (origin.startsWith('https')) assert.equal(comparisonCount, 4);
  else assert(comparisonCount >= 4, 'Local account preserves its older test stores');
  for (const store of seed.stores) assert((await comparisons.innerText()).includes(store.name));
  assert.match(await comparisons.innerText(), /margin/);
  await page.screenshot({
    path: fileURLToPath(new URL('owner-desktop.png', shots)),
    fullPage: true,
  });
  result.checks.push(
    'Owner sees mixed profiles, product profitability and all four demo store margin comparisons',
  );
  await page.setViewportSize({ width: 360, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({
    path: fileURLToPath(new URL('owner-mobile.png', shots)),
    fullPage: true,
  });
  result.checks.push('Owner insights fit a 360px viewport');
  await page.goto(`${origin}/stores/${first.id}/profile`);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  result.checks.push('Store profile form fits a 360px viewport');
  const person = seed.users.find((user) => user.role === 'floor_manager');
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  try {
    assert.equal(
      (
        await context.request.post(`${origin}/api/emp-signin`, {
          data: { empId: person.empId, password: person.password },
        })
      ).status(),
      200,
    );
    const staff = await context.newPage();
    await dashboard(staff);
    assert.equal(
      await staff.getByRole('heading', { name: 'Product profitability', exact: true }).count(),
      0,
    );
    assert.equal(await staff.getByText('Business profile', { exact: true }).count(), 0);
    assert(!(await staff.locator('main').innerText()).includes('Stock at current recorded cost'));
    await staff.screenshot({
      path: fileURLToPath(new URL('floor-mobile.png', shots)),
      fullPage: true,
    });
    await staff.goto(`${origin}/settings/business`);
    assert.equal(await staff.getByRole('button', { name: 'Save profile', exact: true }).count(), 0);
    result.checks.push('Department staff cannot see product costs or configure business profiles');
  } finally {
    await context.close();
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
      `.cache/business-profiles-browser-${origin.startsWith('https') ? 'hosted' : 'local'}.json`,
      root,
    ),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: Acceptance summary excludes credentials and sessions.
  console.log(JSON.stringify(result));
}
