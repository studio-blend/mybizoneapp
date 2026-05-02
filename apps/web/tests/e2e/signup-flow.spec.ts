import { expect, test } from '@playwright/test';

/**
 * E2E happy path:
 *   Landing → Signup form → submit (verification email logs to console in dev,
 *   so we cannot click the link in CI without intercepting). For M1 the test
 *   verifies the form submits cleanly and the "check your email" screen renders.
 *   M2 adds a test-only auth bypass that auto-verifies for the e2e suite.
 */
test('landing renders and signup form submits', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MyBizOne' })).toBeVisible();

  await page.getByRole('link', { name: /get started/i }).click();
  await expect(page).toHaveURL(/\/signup$/);

  const ts = Date.now();
  await page.getByLabel(/business name/i).fill(`Shop ${ts}`);
  await page.getByLabel(/your name/i).fill('Test Owner');
  await page.getByLabel(/email/i).fill(`owner+${ts}@example.com`);
  await page.getByLabel(/password/i).fill('password123');
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible({
    timeout: 15_000,
  });
});

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /log in/i })).toBeVisible();
});

test('protected route redirects to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
