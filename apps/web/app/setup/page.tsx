import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { businesses } from '@mybizone/db';
import { count } from 'drizzle-orm';
import { SetupWizard } from './_components/setup-wizard';

export default async function SetupPage() {
  if (process.env.LAN_MODE !== 'true') {
    redirect('/');
  }

  const [row] = await db.select({ n: count() }).from(businesses);
  if ((row?.n ?? 0) > 0) {
    redirect('/dashboard');
  }

  return <SetupWizard />;
}
