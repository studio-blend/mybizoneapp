import { BusinessProfileForm } from '@/components/business-profile-form';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { businesses } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
export default async function BusinessSettingsPage() {
  const user = await requireUser();
  await requirePermission(user, 'manage_settings');
  const [business] = await withTenant(db, user.businessId, (tx) =>
    tx
      .select({
        businessProfile: businesses.businessProfile,
        sellingModel: businesses.sellingModel,
      })
      .from(businesses)
      .where(eq(businesses.id, user.businessId)),
  );
  if (!business) throw new Error('Business not found');
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business profile</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Choose defaults for your business. Each store can use its own profile and selling model.
        </p>
      </div>
      <BusinessProfileForm initial={business} />
      <p className="text-sm text-muted-foreground">
        Manage individual profiles in{' '}
        <Link href="/stores" className="underline underline-offset-4">
          Stores
        </Link>
        . Changing a profile preserves existing records.
      </p>
    </div>
  );
}
