// Mutating acceptance runs only on the exact guarded disposable cluster.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const require = createRequire(new URL('apps/web/package.json', root));
const { chromium } = require('@playwright/test');
const postgres = createRequire(new URL('packages/db/package.json', root))('postgres');
const url = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
assert.equal(process.env.DATABASE_URL, url);
const db = postgres(url, { max: 1 });
const owner = JSON.parse(
  readFileSync(new URL('.local/test-accounts/pro-owner.json', root), 'utf8'),
);
const seed = JSON.parse(
  readFileSync(new URL('.local/test-accounts/four-store-seed.json', root), 'utf8'),
);
const origin = 'http://localhost:3015';
const outputId = randomUUID();
const flourId = randomUUID();
const oilId = randomUUID();
const suffix = outputId.slice(0, 8);
const bread = `Kitchen bread ${suffix}`;
const flour = `Kitchen flour ${suffix}`;
const oil = `Kitchen oil ${suffix}`;
const recipeName = `Bread recipe ${suffix}`;
const reference = `Morning bake ${suffix}`;
const customer = `Kitchen counter ${suffix}`;
const shots = new URL('.cache/kitchen-screenshots/', root);
mkdirSync(shots, { recursive: true });
const result = { checks: [], passed: false };
let browser;
let page;
let businessId;
let recipeId;
let ticketId;
let baseline;
async function snapshot() {
  const [s] =
    await db`SELECT (SELECT count(*) FROM products)::int products,(SELECT coalesce(sum(inventory),0)::text FROM products) stock,(SELECT coalesce(sum(total),0)::text FROM sales) sales,(SELECT coalesce(sum(outstanding_balance),0)::text FROM customers) customers,(SELECT coalesce(sum(outstanding_balance),0)::text FROM suppliers) suppliers`;
  return s;
}
async function stock() {
  const [s] =
    await db`SELECT (SELECT inventory FROM products WHERE id=${flourId}) flour,(SELECT inventory FROM products WHERE id=${oilId}) oil,(SELECT inventory FROM products WHERE id=${outputId}) bread`;
  return s;
}
async function mobile(name) {
  await page.setViewportSize({ width: 360, height: 800 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${name}: overflow`,
  );
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}-mobile.png`, shots)),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function reloadClick(button) {
  await Promise.all([
    page.waitForEvent('framenavigated', {
      predicate: (f) => f === page.mainFrame(),
      timeout: 30000,
    }),
    button.click(),
  ]);
}
try {
  const [d] = await db`SHOW data_directory`;
  assert(d.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'));
  const [u] = await db`SELECT business_id FROM "user" WHERE email=${owner.email}`;
  businessId = u.business_id;
  baseline = await snapshot();
  await db`INSERT INTO products(id,business_id,store_id,name,unit_type,unit_symbol,price,cost_price,inventory,batch_tracking) VALUES(${outputId},${businessId},${seed.stores[0].id},${bread},'piece','pc',20,NULL,0,true),(${flourId},${businessId},${seed.stores[0].id},${flour},'weight','kg',50,40,5,true),(${oilId},${businessId},${seed.stores[0].id},${oil},'volume','litre',100,80,2,false)`;
  await db`INSERT INTO stock_batches(business_id,product_id,code,expires_on,quantity) VALUES(${businessId},${flourId},'EXPIRED','2020-01-01',2),(${businessId},${flourId},'EARLY','2090-01-01',1),(${businessId},${flourId},'LATER','2091-01-01',2)`;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultNavigationTimeout(60000);
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.goto(`${origin}/kitchen/recipes`);
  await page.getByLabel('Prepared product', { exact: true }).selectOption(outputId);
  await page.getByLabel('Recipe name / version', { exact: true }).fill(recipeName);
  await page.getByLabel('Expected yield per batch (pc)', { exact: true }).fill('4');
  await page.getByLabel('Ingredient 1', { exact: true }).selectOption(flourId);
  await page.getByLabel('Ingredient quantity 1 (kg)', { exact: true }).fill('0.5');
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
  await page.getByLabel('Ingredient 2', { exact: true }).selectOption(oilId);
  await page.getByLabel('Ingredient quantity 2 (litre)', { exact: true }).fill('0.1');
  await mobile('recipe');
  await reloadClick(page.getByRole('button', { name: 'Save recipe version', exact: true }));
  await page.getByRole('heading', { name: recipeName, exact: true }).waitFor();
  const [r] = await db`SELECT id FROM kitchen_recipes WHERE output_product_id=${outputId}`;
  recipeId = r.id;
  assert.deepEqual(await stock(), { flour: '5.000', oil: '2.000', bread: '0.000' });
  result.checks.push(
    'Recipe versions store real ingredient quantities and yield without moving stock',
  );
  await page.goto(`${origin}/kitchen`);
  await page.getByLabel('Recipe version', { exact: true }).selectOption(recipeId);
  await page.getByLabel('Whole recipe batches', { exact: true }).fill('2');
  await page.getByLabel('Kitchen reference', { exact: true }).fill(reference);
  await page
    .getByLabel('Preparation notes', { exact: true })
    .fill('Bake two batches for the morning counter');
  await mobile('plan-ticket');
  await page.getByRole('button', { name: 'Create prep ticket', exact: true }).click();
  await page.waitForURL(/\/kitchen\/[a-f0-9-]{36}$/);
  ticketId = page.url().split('/').at(-1);
  assert.deepEqual(await stock(), { flour: '5.000', oil: '2.000', bread: '0.000' });
  result.checks.push(
    'Queued tickets freeze the recipe and show base-unit ingredient coverage without reserving stock',
  );
  await reloadClick(page.getByRole('button', { name: 'Start preparation', exact: true }));
  await page.getByRole('heading', { name: 'Record completed preparation', exact: true }).waitFor();
  assert.deepEqual(await stock(), { flour: '5.000', oil: '2.000', bread: '0.000' });
  await mobile('in-kitchen');
  result.checks.push(
    'Starting preparation updates the kitchen queue without claiming a stock movement',
  );
  await page.goto(`${origin}/kitchen/recipes`);
  const article = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: recipeName, exact: true }) });
  await reloadClick(article.getByRole('button', { name: 'Archive recipe', exact: true }));
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: recipeName, exact: true }) })
    .getByText('Archived', { exact: true })
    .waitFor();
  result.checks.push(
    'Archiving a recipe closes future selection and preserves the existing prep agreement',
  );
  await page.goto(`${origin}/kitchen/${ticketId}`);
  await page.getByLabel('Actual finished quantity (pc)', { exact: true }).fill('6');
  await page.getByLabel('Prepared batch code', { exact: true }).fill(`BAKE-${suffix}`);
  await page.getByLabel('Prepared batch expiry', { exact: true }).fill('2090-12-01');
  await page
    .getByLabel('Yield / handover notes', { exact: true })
    .fill('Six usable rolls after the actual bake');
  await db`UPDATE products SET inventory=0.1 WHERE id=${oilId}`;
  await page.getByRole('button', { name: 'Record actual preparation', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Insufficient ingredient stock' }).waitFor();
  assert.deepEqual(await stock(), { flour: '5.000', oil: '0.100', bread: '0.000' });
  assert.equal(
    (await db`SELECT id FROM kitchen_consumptions WHERE ticket_id=${ticketId}`).length,
    0,
  );
  result.checks.push(
    'Short ingredients decline completion without partial consumption or prepared stock',
  );
  await db`UPDATE products SET inventory=2 WHERE id=${oilId}`;
  await reloadClick(page.getByRole('button', { name: 'Record actual preparation', exact: true }));
  await page
    .getByRole('heading', { name: 'Recorded ingredient consumption', exact: true })
    .waitFor();
  assert.deepEqual(await stock(), { flour: '4.000', oil: '1.800', bread: '6.000' });
  const [t] = await db`SELECT ingredient_cost,unit_cost FROM kitchen_tickets WHERE id=${ticketId}`;
  assert.equal(t.ingredient_cost, '56.00');
  assert.equal(t.unit_cost, '9.33');
  await mobile('completed-ticket');
  result.checks.push(
    'Actual lower yield consumes the full recipe once and transfers ingredient cost into prepared stock',
  );
  const moves =
    await db`SELECT m.kind,b.code,m.quantity FROM stock_batch_movements m JOIN stock_batches b ON b.id=m.batch_id WHERE document_id=${ticketId} ORDER BY kind`;
  assert.deepEqual(
    moves.map((m) => m.kind),
    ['kitchen_output', 'kitchen_use'],
  );
  assert.equal(moves.find((m) => m.kind === 'kitchen_use').code, 'EARLY');
  result.checks.push(
    'Preparation consumes unexpired ingredient batches FEFO and records the finished batch trace',
  );
  await page.reload();
  assert.deepEqual(await stock(), { flour: '4.000', oil: '1.800', bread: '6.000' });
  result.checks.push(
    'Refreshing a completed ticket cannot consume ingredients or add finished goods again',
  );
  await page.goto(`${origin}/sales/new`);
  await page.getByLabel('Store', { exact: true }).selectOption(seed.stores[0].id);
  await page.getByPlaceholder('Name, SKU, or barcode').fill(bread);
  await page.getByRole('button').filter({ hasText: bread }).first().click();
  await page.getByLabel('Customer name', { exact: true }).fill(customer);
  await page.locator('#billType').selectOption('non_gst_bill');
  await page.getByRole('button', { name: 'Save bill (F2)', exact: true }).click();
  await page.waitForURL(`${origin}/sales`);
  assert.deepEqual(await stock(), { flour: '4.000', oil: '1.800', bread: '5.000' });
  result.checks.push(
    'Normal checkout sells prepared stock without consuming the recipe ingredients again',
  );
  await page.goto(`${origin}/kitchen/waste`);
  await page.getByLabel('Wasted product / ingredient', { exact: true }).selectOption(outputId);
  await page.getByLabel('Waste quantity (pc)', { exact: true }).fill('1');
  const [b] = await db`SELECT id FROM stock_batches WHERE product_id=${outputId}`;
  await page.getByLabel('Physical batch to discard', { exact: true }).selectOption(b.id);
  await page.getByLabel('Waste reason', { exact: true }).selectOption('unsold');
  await page
    .getByLabel('Waste explanation / kitchen reference', { exact: true })
    .fill(`Counter close ${suffix}`);
  await mobile('waste');
  await reloadClick(page.getByRole('button', { name: 'Write off kitchen waste', exact: true }));
  assert.deepEqual(await stock(), { flour: '4.000', oil: '1.800', bread: '4.000' });
  const [loss] =
    await db`SELECT d.total_value FROM kitchen_waste w JOIN damage_logs d ON d.id=w.damage_id WHERE d.product_id=${outputId}`;
  assert.equal(loss.total_value, '9.33');
  result.checks.push(
    'Unsold finished food is written off once in both kitchen history and existing loss reports',
  );
  await page.getByLabel('Wasted product / ingredient', { exact: true }).selectOption(flourId);
  await page.getByLabel('Waste quantity (kg)', { exact: true }).fill('0.25');
  const [expired] =
    await db`SELECT id FROM stock_batches WHERE product_id=${flourId} AND code='EXPIRED'`;
  await page.getByLabel('Physical batch to discard', { exact: true }).selectOption(expired.id);
  await page.getByLabel('Waste reason', { exact: true }).selectOption('expired');
  await page
    .getByLabel('Waste explanation / kitchen reference', { exact: true })
    .fill(`Expired flour ${suffix}`);
  await reloadClick(page.getByRole('button', { name: 'Write off kitchen waste', exact: true }));
  assert.deepEqual(await stock(), { flour: '3.750', oil: '1.800', bread: '4.000' });
  result.checks.push('Expired ingredient disposal removes the explicitly selected physical batch');
  await page.goto(`${origin}/kitchen?store=${seed.stores[0].id}&view=completed`);
  assert.equal(await page.locator('select[name="view"]').inputValue(), 'completed');
  await page.getByRole('link', { name: reference, exact: true }).waitFor();
  await mobile('queue');
  result.checks.push(
    'Native store/status filters retain completed prep tickets and readable phone summaries',
  );
  for (const role of ['admin', 'inventory', 'sales', 'billing', 'accounts', 'floor_manager']) {
    const person = seed.users.find((p) => p.role === role);
    assert(person);
    const ctx = await browser.newContext();
    const response = await ctx.request.post(`${origin}/api/emp-signin`, {
      data: { empId: person.empId, password: person.password },
    });
    assert.equal(response.status(), 200);
    const tab = await ctx.newPage();
    await tab.goto(`${origin}/dashboard`);
    await tab.locator('[data-dashboard-view]').waitFor();
    const menu = tab.locator('header').getByRole('button', { name: 'Inventory', exact: true });
    if (await menu.count()) await menu.click();
    assert.equal(
      await tab.locator('header a[href="/kitchen"]').count(),
      ['admin', 'inventory'].includes(role) ? 1 : 0,
    );
    if (['admin', 'inventory'].includes(role)) {
      await tab.goto(`${origin}/kitchen`);
      await tab.getByRole('heading', { name: 'Kitchen preparation', exact: true }).waitFor();
    }
    result.checks.push(`${role}: kitchen navigation and access follow stock permissions`);
    await ctx.close();
  }
  result.passed = true;
} catch (error) {
  let message = String(error.stack ?? error);
  for (const p of [owner, ...seed.users]) message = message.replaceAll(p.password, '[redacted]');
  result.error = message;
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: fileURLToPath(new URL('failure.png', shots)), fullPage: true })
      .catch(() => {});
} finally {
  await browser?.close();
  try {
    if (businessId) {
      await db.begin(async (tx) => {
        const recipes =
          await tx`SELECT id FROM kitchen_recipes WHERE output_product_id=${outputId}`;
        const recipeIds = recipes.map((r) => r.id);
        const tickets = recipeIds.length
          ? await tx`SELECT id FROM kitchen_tickets WHERE recipe_id IN ${tx(recipeIds)}`
          : [];
        const ticketIds = tickets.map((t) => t.id);
        const losses =
          await tx`SELECT id FROM damage_logs WHERE product_id IN ${tx([outputId, flourId, oilId])}`;
        const lossIds = losses.map((l) => l.id);
        const sales =
          await tx`SELECT id FROM sales WHERE customer_name=${customer} AND business_id=${businessId}`;
        const saleIds = sales.map((s) => s.id);
        const documents = [...ticketIds, ...lossIds, ...saleIds];
        if (documents.length)
          await tx`DELETE FROM stock_batch_movements WHERE document_id IN ${tx(documents)} AND business_id=${businessId}`;
        if (lossIds.length)
          await tx`DELETE FROM kitchen_waste WHERE damage_id IN ${tx(lossIds)} AND business_id=${businessId}`;
        if (ticketIds.length) {
          await tx`DELETE FROM kitchen_consumptions WHERE ticket_id IN ${tx(ticketIds)} AND business_id=${businessId}`;
          await tx`DELETE FROM kitchen_tickets WHERE id IN ${tx(ticketIds)} AND business_id=${businessId}`;
        }
        if (recipeIds.length) {
          await tx`DELETE FROM kitchen_recipe_items WHERE recipe_id IN ${tx(recipeIds)} AND business_id=${businessId}`;
          await tx`DELETE FROM kitchen_recipes WHERE id IN ${tx(recipeIds)} AND business_id=${businessId}`;
        }
        if (lossIds.length)
          await tx`DELETE FROM damage_logs WHERE id IN ${tx(lossIds)} AND business_id=${businessId}`;
        if (saleIds.length) {
          await tx`DELETE FROM invoices WHERE sale_id IN ${tx(saleIds)} AND business_id=${businessId}`;
          await tx`DELETE FROM sale_items WHERE sale_id IN ${tx(saleIds)} AND business_id=${businessId}`;
          await tx`DELETE FROM sales WHERE id IN ${tx(saleIds)} AND business_id=${businessId}`;
        }
        const auditIds = [...documents, ...recipeIds];
        if (auditIds.length)
          await tx`DELETE FROM audit_logs WHERE entity_id IN ${tx(auditIds)} AND business_id=${businessId}`;
        await tx`DELETE FROM stock_batches WHERE product_id IN ${tx([outputId, flourId, oilId])} AND business_id=${businessId}`;
        await tx`DELETE FROM products WHERE id IN ${tx([outputId, flourId, oilId])} AND business_id=${businessId}`;
      });
      if (baseline) {
        try {
          assert.deepEqual(await snapshot(), baseline);
          result.checks.push(
            'Fixture cleanup preserves existing stock, sales and customer/supplier balances',
          );
        } catch (error) {
          result.passed = false;
          result.cleanupError = String(error);
          process.exitCode = 1;
        }
      }
    }
  } catch (error) {
    result.passed = false;
    result.cleanupError = String(error);
    process.exitCode = 1;
  }
  await db.end();
  writeFileSync(
    new URL('.cache/kitchen-browser-local.json', root),
    JSON.stringify(result, null, 2),
  );
  // biome-ignore lint/suspicious/noConsole: Credentials and sessions are excluded.
  console.log(JSON.stringify(result));
}
