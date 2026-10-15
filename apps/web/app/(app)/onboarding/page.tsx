import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { businesses, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { OnboardingBusinessForm } from './_components/business-form';
import { OnboardingProgress } from './_components/progress';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await requireUser();
  await requirePermission(user, 'manage_settings');
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [biz] = await tx
      .select({
        gstEnabled: businesses.gstEnabled,
        gstin: businesses.gstin,
        businessProfile: businesses.businessProfile,
        sellingModel: businesses.sellingModel,
      })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));
    const storeRows = await tx.select({ id: stores.id }).from(stores).limit(1);
    return { biz, hasStore: storeRows.length > 0 };
  });

  if (data.hasStore) redirect('/dashboard');

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Welcome to MyBizOne</h1>
        <p className="text-sm text-muted-foreground">
          Two quick steps and you're ready to record sales.
        </p>
      </div>
      <OnboardingProgress current={1} />
      <OnboardingBusinessForm
        initial={{
          gstEnabled: data.biz?.gstEnabled ?? false,
          gstin: data.biz?.gstin ?? '',
          businessProfile: data.biz?.businessProfile,
          sellingModel: data.biz?.sellingModel,
        }}
      />
    </div>
  );
}
