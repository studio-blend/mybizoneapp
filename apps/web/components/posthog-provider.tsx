'use client';

import { type ReactNode, useEffect } from 'react';

/**
 * Load analytics after the initial render, and only when configured.
 * Keeping the SDK in an async chunk avoids parsing it on every page load.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    let cancelled = false;
    async function initialize(apiKey: string) {
      const { default: posthog } = await import('posthog-js');
      if (cancelled || posthog.__loaded) return;
      posthog.init(apiKey, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: true,
      });
    }
    const load = () => {
      void initialize(key).catch(() => {
        // Analytics failures must not interrupt the application.
      });
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load, { timeout: 2000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = setTimeout(load, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, []);
  return <>{children}</>;
}
