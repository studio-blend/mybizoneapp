import { type BrowserContext, expect, test } from '@playwright/test';
import { createOwnerAndStore } from './helpers';

const routes = [
  '/dashboard',
  '/sales/new',
  '/sales',
  '/reports',
  '/products',
  '/products/new',
  '/categories',
  '/brands',
  '/catalogues',
  '/stores',
  '/employees',
];
let context: BrowserContext;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const page = await context.newPage();
  await createOwnerAndStore(page);
  await page.close();
});

test.afterAll(async () => {
  await context?.close();
});

test('mobile menu opens groups, navigates and closes', async () => {
  const page = await context.newPage();
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Toggle menu', exact: true }).click();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.locator('header').getByRole('link', { name: 'Products', exact: true }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('button', { name: 'Inventory', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Toggle menu', exact: true }).click();
  await page.getByRole('button', { name: 'Billing', exact: true }).click();
  await page.locator('header').getByRole('link', { name: 'New Sale (POS)', exact: true }).click();
  await expect(page).toHaveURL(/\/sales\/new$/);
  await expect(page.getByRole('button', { name: 'Billing', exact: true })).toBeHidden();
  await page.close();
});

for (const route of routes) {
  test(`${route} remains usable at 360px`, async () => {
    const page = await context.newPage();
    await page.goto(route);
    await expect(page.locator('main h1, main h2, main h3').first()).toBeVisible();
    await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Horizontal overflow at ${route}`,
    ).toBe(true);
    await page.close();
  });
}
