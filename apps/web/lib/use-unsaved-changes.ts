'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const CONFIRM_MSG = 'You have unsaved changes. Leave without saving?';

/**
 * Guards against accidental navigation when a form is dirty.
 * - Blocks browser refresh / tab close via beforeunload.
 * - Intercepts all in-page <a> link clicks and prompts the user.
 *
 * Returns `safeNavigate(href)` for programmatic navigation (e.g. Cancel buttons).
 */
export function useUnsavedChanges(isDirty: boolean) {
  const router = useRouter();

  // 1. Block browser close / hard navigation
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 2. Intercept all <a href> clicks (covers Next.js <Link> soft navigation)
  useEffect(() => {
    if (!isDirty) return;
    function handleClick(e: MouseEvent) {
      // Walk up the DOM to find the closest anchor
      const anchor = (e.target as Element).closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      // Ignore anchors, external links handled by beforeunload, and no-href
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
      if (!window.confirm(CONFIRM_MSG)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, [isDirty]);

  // 3. Safe programmatic navigation (for Cancel buttons etc.)
  const safeNavigate = useCallback(
    (href: string) => {
      if (isDirty && !window.confirm(CONFIRM_MSG)) return;
      router.push(href);
    },
    [isDirty, router],
  );

  return { safeNavigate };
}
