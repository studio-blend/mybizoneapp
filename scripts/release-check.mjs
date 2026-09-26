import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Explicit environment values prevent Next's local dotenv files from enabling
// real integrations or selecting an existing database during release tests.
const commands = {
  build: 'pnpm --filter @mybizone/web build',
  test: 'pnpm -r test',
  'test:providers':
    'pnpm --filter @mybizone/web exec vitest run tests/unit/subscription-events.test.ts tests/unit/email-templates.test.ts tests/unit/provider-mailer.test.ts tests/integration/provider-webhooks.test.ts',
  'test:transactions':
    'pnpm --filter @mybizone/pdf build && pnpm --filter @mybizone/web exec vitest run tests/integration/transaction-actions.test.ts',
  'test:security':
    'pnpm --filter @mybizone/web exec vitest run tests/integration/security- tests/unit/backup- tests/unit/employee-credentials.test.ts',
  'test:permissions': 'pnpm --filter @mybizone/domain exec vitest run tests/permissions.test.ts',
  'test:domain': 'pnpm --filter @mybizone/domain test',
  'test:pdf': 'pnpm --filter @mybizone/pdf test',
  'test:db': 'pnpm --filter @mybizone/db test',
  'test:damage':
    'pnpm --filter @mybizone/pdf build && pnpm --filter @mybizone/web exec vitest run tests/integration/transaction-actions.test.ts --testNamePattern=damage',
  migrate: 'pnpm --filter @mybizone/db migrate',
  typecheck: 'pnpm typecheck',
  start: 'pnpm --filter @mybizone/web start',
  e2e: 'pnpm --filter @mybizone/web test:e2e',
  'e2e:commerce': 'pnpm --filter @mybizone/web exec playwright test commerce.spec.ts',
  'e2e:permissions': 'pnpm --filter @mybizone/web exec playwright test permissions.spec.ts',
  'e2e:dev': 'pnpm --filter @mybizone/web test:e2e',
  'e2e:commerce:dev':
    'pnpm --filter @mybizone/web exec playwright test commerce.spec.ts --workers=1',
  'test:recovery': 'go -C packages/desktop test -tags=recovery -count=1 -v ./backup',
};
const command = commands[process.argv[2]];
if (!command) throw new Error(`Choose one of: ${Object.keys(commands).join(', ')}`);
const env = {
  ...process.env,
  NODE_ENV: process.argv[2].endsWith(':dev')
    ? 'development'
    : ['build', 'start'].includes(process.argv[2]) || process.argv[2].startsWith('e2e')
      ? 'production'
      : 'test',
  RELEASE_E2E_DEV: process.argv[2].endsWith(':dev') ? 'true' : 'false',
  MYBIZONE_RECOVERY_TEST: process.argv[2] === 'test:recovery' ? '1' : '0',
  BACKUP_DIR: fileURLToPath(new URL('../.cache/release-test-backups', import.meta.url)),
  DATABASE_URL: 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test',
  BETTER_AUTH_SECRET: 'release-test-only-not-for-production-2026',
  BETTER_AUTH_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  STORAGE_BACKEND: 'local',
  STORAGE_DIR: '../../.cache/release-test-storage',
  LAN_MODE: 'true',
  PORTABLE_MODE: 'false',
  SETUP_COMPLETE: 'true',
  GSTN_SANDBOX: 'true',
  NEXT_TELEMETRY_DISABLED: '1',
  EMAIL_FROM: 'MyBizOne Test <noreply@example.invalid>',
  RESEND_API_KEY: '',
  NEXT_PUBLIC_SENTRY_DSN: '',
  SENTRY_AUTH_TOKEN: '',
  NEXT_PUBLIC_POSTHOG_KEY: '',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  RAZORPAY_KEY_ID: '',
  RAZORPAY_KEY_SECRET: '',
  NEXT_PUBLIC_RAZORPAY_KEY_ID: '',
  RAZORPAY_WEBHOOK_SECRET: '',
  RAZORPAY_PLAN_ID_MONTHLY: '',
  RAZORPAY_PLAN_ID_ANNUAL: '',
  LICENSE_KEY: '',
  GSTN_USERNAME: '',
  GSTN_CLIENT_ID: '',
  GSTN_CLIENT_SECRET: '',
  SUPPORT_EMAIL: '',
  NEXT_PUBLIC_SUPPORT_WHATSAPP: '',
};
const child = spawn(command, {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env,
  shell: true,
  windowsHide: true,
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
