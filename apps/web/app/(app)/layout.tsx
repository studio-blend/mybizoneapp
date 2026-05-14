import { requireUser } from '@/lib/session';
import type { ReactNode } from 'react';
import { NavHeader } from './_components/nav-header';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <NavHeader email={user.email} />
      <main className="container mx-auto px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}
