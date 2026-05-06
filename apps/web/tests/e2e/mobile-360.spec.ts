/**
 * 360px mobile QA pass — walks every authenticated route at 360×640 viewport.
 *
 * Asserts:
 *   1. No horizontal overflow (scrollWidth <= innerWidth).
 *   2. Key CTA on the page is visible.
 *
 * Requires a running app (`pnpm start`) and these env vars:
 *   PLAYWRIGHT_TEST_EMAIL    — email of an existing admin user
 *   PLAYWRIGHT_TEST_PASSWORD — that user's password
 *
 * The first test (`login`) stores session state so subsequent tests skip re-login.
 */
import { type Browser, type BrowserContext, chromium, expect, test } from '@playwright/test';

const VIEWPORT = { width: 360, height: 640 };
const BASE = 'http://localhost:3000';
const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? 'password';

async function noHorizontalOverflow(
  ctx: BrowserContext,
  path: string,
): Promise<void> {
  const page = await ctx.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow, `Horizontal overflow on ${path}`).toBe(false);
  await page.close();
}

let browser: Browser;
let ctx: BrowserContext;

test.beforeAll(async () => {
  browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: VIEWPORT });

  // Log in once and reuse the session cookie across all tests.
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15_000 });
  await page.close();
});

test.afterAll(async () => {
  await ctx.close();
  await browser.close();
});

const ROUTES: { path: string; ctaSelector: string }[] = [
  { path: '/dashboard', ctaSelector: 'a[href="/sales/new"]' },
  { path: '/sales/new', ctaSelector: 'button[type="submit"]' },
  { path: '/sales', ctaSelector: 'h1' },
  { path: '/reports', ctaSelector: 'h1' },
  { path: '/products', ctaSelector: 'a[href="/products/new"]' },
  { path: '/products/new', ctaSelector: 'button[type="submit"]' },
  { path: '/categories', ctaSelector: 'a[href="/categories/new"]' },
  { path: '/brands', ctaSelector: 'a[href="/brands/new"]' },
  { path: '/catalogues', ctaSelector: 'a[href="/catalogues/new"]' },
  { path: '/stores', ctaSelector: 'a[href="/stores/new"]' },
  { path: '/employees', ctaSelector: 'a[href="/employees/invite"]' },
];

for (const { path, ctaSelector } of ROUTES) {
  test(`${path} — no horizontal overflow`, async () => {
    await noHorizontalOverflow(ctx, path);
  });

  test(`${path} — key CTA visible`, async () => {
    const page = await ctx.newPage();
    await page.setViewportSize(VIEWPORT);
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const cta = page.locator(ctaSelector).first();
    await expect(cta).toBeVisible();
    await page.close();
  });
}
