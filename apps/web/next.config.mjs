// @ts-check
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow verification builds to run alongside the development server.
  distDir: process.env.MYBIZONE_BUILD_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // standalone bundles server.js + only-used node_modules for portable/Docker deploys
  // Verification builds use next start and avoid Windows symlink packaging.
  output: process.env.MYBIZONE_BUILD_DIR ? undefined : 'standalone',
  // Keep PDF JSX and its React 18 renderer together in Node, outside RSC's React runtime.
  serverExternalPackages: ['@mybizone/pdf'],
  webpack(config, { isServer }) {
    if (isServer) {
      // Workspace symlinks resolve outside node_modules, so force the same native
      // boundary for the invoice entry rather than letting RSC bundle its JSX.
      config.externals = [
        { '@mybizone/pdf/invoice': 'import @mybizone/pdf/invoice' },
        ...(Array.isArray(config.externals) ? config.externals : [config.externals ?? {}]),
      ];
    }
    return config;
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  transpilePackages: ['@mybizone/ui', '@mybizone/db', '@mybizone/auth-config', '@mybizone/domain'],
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: !process.env.NEXT_PUBLIC_SENTRY_DSN || !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
  telemetry: false,
  webpack: { treeshake: { removeDebugLogging: true } },
});
