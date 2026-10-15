import { getUserRoles } from '@/lib/get-user-roles';
import { permittedNavigation } from '@/lib/navigation';
import { requireUser } from '@/lib/session';
import type { ReactNode } from 'react';
import { NavHeader } from './_components/nav-header';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const roles = await getUserRoles(user);
  return (
    <div className="min-h-screen font-sans">
      <NavHeader email={user.email} groups={permittedNavigation(roles)} />
      <main className="container mx-auto px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}
