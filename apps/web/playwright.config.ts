import { defineConfig, devices } from '@playwright/test';

if (
  process.env.LAN_MODE !== 'true' ||
  process.env.DATABASE_URL !== 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test'
) {
  throw new Error('Browser acceptance requires the isolated release-check.mjs e2e environment');
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: process.env.RELEASE_E2E_DEV === 'true' ? 30_000 : 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    actionTimeout: process.env.RELEASE_E2E_DEV === 'true' ? 30_000 : 5_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: process.env.RELEASE_E2E_DEV === 'true' ? 'pnpm dev' : 'pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
