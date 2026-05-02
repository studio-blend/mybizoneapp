import { Toaster } from '@mybizone/ui/toaster';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PostHogProvider } from '../components/posthog-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'MyBizOne',
  description: 'Inventory + POS for Indian SMBs',
};

// Force dynamic rendering across the app: every page either reads cookies
// (auth) or DB (tenant data). Static prerender would crash on any of those.
// Re-enable static for marketing pages later.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <PostHogProvider>
          {children}
          <Toaster />
        </PostHogProvider>
      </body>
    </html>
  );
}
