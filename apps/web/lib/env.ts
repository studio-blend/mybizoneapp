import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default('MyBizOne <noreply@mybizone.local>'),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional().default(''),
  SENTRY_AUTH_TOKEN: z.string().optional().default(''),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional().default(''),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional().default('https://us.i.posthog.com'),
  STORAGE_BACKEND: z.enum(['local', 'r2']).default('local'),
  STORAGE_DIR: z.string().optional().default('./storage'),
  R2_BUCKET: z.string().optional().default(''),
  LAN_MODE: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_SUPPORT_WHATSAPP: z.string().optional().default(''),
  // Razorpay — optional; billing features are disabled when these are unset.
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  RAZORPAY_PLAN_ID_MONTHLY: z.string().optional().default(''),
  RAZORPAY_PLAN_ID_ANNUAL: z.string().optional().default(''),
});

const parsed = schema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_SUPPORT_WHATSAPP: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  RAZORPAY_PLAN_ID_MONTHLY: process.env.RAZORPAY_PLAN_ID_MONTHLY,
  RAZORPAY_PLAN_ID_ANNUAL: process.env.RAZORPAY_PLAN_ID_ANNUAL,
  STORAGE_BACKEND: process.env.STORAGE_BACKEND,
  STORAGE_DIR: process.env.STORAGE_DIR,
  R2_BUCKET: process.env.R2_BUCKET,
  LAN_MODE: process.env.LAN_MODE,
  NODE_ENV: process.env.NODE_ENV,
});

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid env. See .env.example.');
}

export const env = parsed.data;
