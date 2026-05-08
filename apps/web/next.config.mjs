// @ts-check
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  transpilePackages: ['@mybizone/ui', '@mybizone/db', '@mybizone/auth-config', '@mybizone/domain'],
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,
  dryRun: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  telemetry: false,
  webpack: { treeshake: { removeDebugLogging: true } },
});
