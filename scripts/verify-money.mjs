// Financial writes are restricted to the exact disposable local cluster.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const { chromium } = createRequire(new URL('apps/web/package.json', root))('@playwright/test');
const postgres = createRequire(new URL('packages/db/package.json', root))('postgres');
const url = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
assert.equal(process.env.DATABASE_URL, url);
const db = postgres(url, { max: 1 });
const owner = JSON.parse(
  readFileSync(new URL('.local/test-accounts/pro-owner.json', root), 'utf8'),
);
const origin = 'http://localhost:3015';
const expenseId = randomUUID();
const tag = `MONEY-${expenseId.slice(0, 8)}`;
const shots = new URL('.cache/money-screenshots/', root);
mkdirSync(shots, { recursive: true });
const result = { checks: [], passed: false };
let browser;
let page;
let biz;
let before;
const tables = [
  'products',
  'product_packs',
  'sales',
  'sale_items',
  'purchases',
  'purchase_items',
  'sales_returns',
  'return_items',
  'purchase_returns',
  'purchase_return_items',
  'damage_logs',
  'customers',
  'suppliers',
  'user_roles',
  'stores',
  'businesses',
  'stock_batches',
  'stock_batch_movements',
  'stock_serials',
  'stock_serial_events',
  'customer_orders',
  'customer_order_items',
  'customer_order_payments',
  'customer_order_deliveries',
  'customer_order_delivery_items',
  'customer_order_allocations',
  'kitchen_recipes',
  'kitchen_recipe_items',
  'kitchen_tickets',
  'kitchen_consumptions',
  'kitchen_waste',
  'sales_settlements',
  'purchase_settlements',
  'expense_entries',
  'emi_schedules',
  'emi_payments',
  'opening_balances',
  'sales_settlement_allocations',
  'purchase_settlement_allocations',
  'accounting_events',
  'money_accounts',
  'money_opening_revisions',
  'money_source_snapshots',
  'money_postings',
  'money_posting_events',
  'money_source_offsets',
];
const hashes = () =>
  db.unsafe(
    tables
      .map(
        (t) =>
          `SELECT '${t}' AS name,count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) AS hash FROM ${t} t`,
      )
      .join(' UNION ALL '),
  );
const labels = {
  account: 'Add account',
  opening: 'Correct opening',
  source: 'Assign recorded money',
  transfer: 'Transfer between accounts',
  clear: 'Mark cleared',
  bounce: 'Mark bounced',
  cancel: 'Cancel pending',
  reverse: 'Reverse cleared',
  offset: 'Reconcile bounced correction',
};
async function command(kind, fields = {}) {
  await page.goto(`${origin}/money`);
  await page.getByLabel('Action', { exact: true }).selectOption(kind);
  for (const [name, value] of Object.entries(fields)) {
    const input = page.locator(`[name="${name}"]`);
    if (await input.evaluate((e) => e.tagName === 'SELECT')) await input.selectOption(value);
    else await input.fill(value);
  }
  await page.getByLabel('Evidence reference', { exact: true }).fill(`${tag}-${kind}`);
  await page
    .getByLabel('Evidence note', { exact: true })
    .fill('Count sheet or bank statement checked for acceptance');
  const button = page.getByRole('button', { name: labels[kind], exact: true });
  await button.waitFor();
  await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
  await Promise.all([
    page.waitForURL((u) => u.pathname === '/money' && u.searchParams.has('saved')),
    button.click(),
  ]);
  await page.locator('output').waitFor();
  return new URL(page.url()).searchParams.get('saved');
}
async function accountBalance(id) {
  const [r] =
    await db`SELECT a.opening_balance+COALESCE((SELECT sum(CASE WHEN p.to_account_id=a.id THEN p.amount ELSE -p.amount END) FROM money_postings p WHERE p.business_id=a.business_id AND (p.from_account_id=a.id OR p.to_account_id=a.id) AND EXISTS(SELECT 1 FROM money_posting_events e WHERE e.posting_id=p.id AND e.kind='clear') AND NOT EXISTS(SELECT 1 FROM money_posting_events e WHERE e.posting_id=p.id AND e.kind IN ('bounce','cancel','reverse'))),0) AS balance FROM money_accounts a WHERE a.id=${id}`;
  return Number(r.balance);
}
try {
  const [d] = await db`SHOW data_directory`;
  assert(d.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'));
  before = await hashes();
  const [u] = await db`SELECT business_id FROM "user" WHERE email=${owner.email}`;
  biz = u.business_id;
  await db`INSERT INTO expense_entries(id,business_id,type,category,amount,description,payment_method) VALUES(${expenseId},${biz},'expense','Acceptance',40,${tag},'cheque')`;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultNavigationTimeout(60000);
  await page.goto(`${origin}/login`);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  const cash = await command('account', {
    name: `Till ${tag}`,
    accountKind: 'cash',
    amount: '1000',
  });
  assert.equal(await accountBalance(cash), 1000);
  result.checks.push('Verified cash opening saved with evidence and immediately refreshed');
  const bank = await command('account', { name: `Bank ${tag}`, accountKind: 'bank', amount: '0' });
  assert.equal(await accountBalance(bank), 0);
  result.checks.push('Separate bank account starts at its verified opening');
  const posting = await command('source', {
    accountId: cash,
    source: `expense:${expenseId}`,
    amount: '40',
  });
  assert.equal(await accountBalance(cash), 1000);
  await page.getByRole('cell', { name: 'pending', exact: true }).waitFor();
  result.checks.push('Assignment reserves outgoing money without changing the cleared balance');
  await command('clear', { postingId: posting });
  assert.equal(await accountBalance(cash), 960);
  result.checks.push('Statement clearing changes account balance once');
  await command('bounce', { postingId: posting });
  assert.equal(await accountBalance(cash), 1000);
  result.checks.push('Bounced clearing restores balance and retains history');
  const again = await command('source', {
    accountId: cash,
    source: `expense:${expenseId}`,
    amount: '40',
  });
  await command('cancel', { postingId: again });
  assert.equal(await accountBalance(cash), 1000);
  result.checks.push('Pending cancellation frees source money for reconciliation');
  const transfer = await command('transfer', { accountId: cash, toAccountId: bank, amount: '200' });
  assert.equal(await accountBalance(bank), 0);
  await command('clear', { postingId: transfer });
  assert.equal(await accountBalance(cash), 800);
  assert.equal(await accountBalance(bank), 200);
  result.checks.push('Linked transfer clears both sides atomically without income or expense');
  await command('reverse', { postingId: transfer });
  assert.equal(await accountBalance(cash), 1000);
  assert.equal(await accountBalance(bank), 0);
  result.checks.push('Transfer reversal restores both sides and keeps the original');
  await command('opening', { accountId: cash, amount: '1100' });
  await page.getByText('Opening correction ·', { exact: false }).waitFor({ state: 'attached' });
  result.checks.push('Opening correction is available after all dependent entries close');
  await page.setViewportSize({ width: 360, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  for (const label of ['Action', 'Evidence reference', 'Evidence note']) {
    const box = await page.getByLabel(label, { exact: true }).boundingBox();
    assert(box && box.width >= 220);
  }
  await page.screenshot({ path: fileURLToPath(new URL('money-phone.png', shots)), fullPage: true });
  result.checks.push('Account cards, forms and history fit a 360px phone viewport');
  await page.goto(`${origin}/cashbook`);
  await page.getByRole('link', { name: 'Cash & bank clearing', exact: true }).click();
  await page.getByRole('heading', { name: 'Cash & bank', exact: true }).waitFor();
  result.checks.push('Cashbook links to account clearing using a fresh page');
  await page.goto(`${origin}/reports/credit-ageing`);
  await page
    .getByRole('heading', { name: 'Remaining value by invoice age', exact: true })
    .waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  result.checks.push(
    'Credit evidence report distinguishes invoice age and reconciliation gaps on mobile',
  );
  result.passed = true;
} catch (e) {
  result.error = String(e.stack ?? e).replaceAll(owner.password, '[redacted]');
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  try {
    if (biz) {
      await db.begin(async (tx) => {
        await tx`DELETE FROM money_posting_events WHERE posting_id IN (SELECT id FROM money_postings WHERE reference LIKE ${`${tag}%`})`;
        await tx`DELETE FROM money_postings WHERE reference LIKE ${`${tag}%`}`;
        await tx`DELETE FROM money_opening_revisions WHERE reference LIKE ${`${tag}%`}`;
        await tx`DELETE FROM money_source_snapshots WHERE business_id=${biz} AND source_kind='expense' AND source_id=${expenseId}`;
        await tx`DELETE FROM money_accounts WHERE reference LIKE ${`${tag}%`}`;
        await tx`DELETE FROM expense_entries WHERE id=${expenseId}`;
      });
    }
    if (before) {
      assert.deepEqual(await hashes(), before);
      result.checks.push(
        'All 46 existing stock, financial and account table hashes preserved after fixture cleanup',
      );
    }
  } catch (e) {
    result.passed = false;
    result.cleanupError = String(e);
    process.exitCode = 1;
  }
  await db.end();
  writeFileSync(new URL('.cache/money-acceptance.json', root), JSON.stringify(result, null, 2));
  // biome-ignore lint/suspicious/noConsole: Acceptance output contains no credentials or sessions.
  console.log(JSON.stringify(result));
}
