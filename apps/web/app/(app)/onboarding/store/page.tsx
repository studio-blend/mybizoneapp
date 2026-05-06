import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { redirect } from 'next/navigation';
import { NewStoreForm } from '../../stores/new/form';
import { OnboardingProgress } from '../_components/progress';

export const dynamic = 'force-dynamic';

export default async function OnboardingStorePage() {
  const user = await requireUser();
  const existing = await withTenant(db, user.businessId, (tx) =>
    tx.select({ id: stores.id }).from(stores).limit(1),
  );
  // Already past step 2 — send to demo-sale.
  if (existing.length > 0) redirect('/onboarding/demo-sale');

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Almost there</h1>
        <p className="text-sm text-muted-foreground">
          Add your first store to start tracking inventory.
        </p>
      </div>
      <OnboardingProgress current={2} />
      <NewStoreForm redirectTo="/onboarding/demo-sale" />
    </div>
  );
}
