import { expect, test } from '@playwright/test';
import { createOwnerAndStore } from './helpers';

test('public pages render without invented contact details', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MyBizOne', exact: true })).toBeVisible();
  await expect(page.locator('a[href*="919999999999"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Explore the workflow' }).click();
  await expect(page.getByRole('heading', { name: 'Getting started', exact: true })).toBeVisible();
});

test('LAN owner can register, log in and create the first store', async ({ page }) => {
  await createOwnerAndStore(page);
  await expect(page.getByRole('heading', { name: 'Main Shop', exact: true })).toBeVisible();
  await page.goto('/settings/billing');
  await expect(page.getByText('1 / 1').first()).toBeVisible();
});

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /log in to mybizone/i })).toBeVisible();
});

test('protected route redirects to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('anonymous callers cannot download a backup', async ({ request }) => {
  const response = await request.get('/api/backup/download');
  expect([401, 403]).toContain(response.status());
});
