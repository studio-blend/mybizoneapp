'use client';

import posthog from 'posthog-js';
import { type ReactNode, useEffect } from 'react';

/**
 * Lightweight PostHog bootstrap. Initializes the singleton on the client only —
 * no React Context provider, so SSR/prerender stays clean. Components call
 * `posthog.capture()` directly when they need to record events. We'll add an
 * identity hook (posthog.identify on login) when M2 wires real events.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: true,
    });
  }, []);
  return <>{children}</>;
}
