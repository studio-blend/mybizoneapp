import { redirect } from 'next/navigation';
import { stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { NewStoreForm } from '../stores/new/form';

/**
 * Onboarding lands here after first login. If they already have a store, skip
 * straight to dashboard. M2 will add a multi-step wizard (vertical, GST flag,
 * first product). For M1 we only ask for the first store.
 */
export default async function OnboardingPage() {
  const user = await requireUser();
  const existing = await withTenant(db, user.businessId, (tx) =>
    tx.select({ id: stores.id }).from(stores).limit(1),
  );
  if (existing.length > 0) redirect('/dashboard');

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Welcome to MyBizOne</h1>
        <p className="text-sm text-muted-foreground">
          One last step — add your first store.
        </p>
      </div>
      <NewStoreForm />
    </div>
  );
}
