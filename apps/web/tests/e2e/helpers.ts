import { type Page, expect } from '@playwright/test';

export async function createOwnerAndStore(page: Page, options: { gst?: boolean } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const email = `owner-${suffix}@example.com`;
  const password = 'Release-test-password-123!';
  await page.goto('/signup');
  await page.getByLabel('Business name', { exact: true }).fill(`Release Shop ${suffix}`);
  await page.getByLabel('Your name', { exact: true }).fill('Release Owner');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account is ready' })).toBeVisible({
    timeout: 20_000,
  });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 20_000 });
  await page.goto('/onboarding');
  if (options.gst) {
    await page.getByLabel('Enable GST billing').check();
    await page.getByLabel('GSTIN', { exact: true }).fill('27AAPFU0939F1ZV');
  }
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/store$/);
  await page.getByLabel('Store name', { exact: true }).fill('Main Shop');
  await page.getByRole('button', { name: 'Create store', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/demo-sale$/, { timeout: 15_000 });
  await page.goto('/stores');
  return { email, password };
}
