import { BusinessProfileForm } from '@/components/business-profile-form';
import { BUSINESS_PROFILES, effectiveProfile } from '@/lib/business-profile';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { businesses, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
export default async function StoreProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  await requirePermission(user, 'manage_stores');
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { store, business } = await withTenant(db, user.businessId, async (tx) => {
    const [store] = await tx
      .select()
      .from(stores)
      .where(and(eq(stores.id, id), eq(stores.businessId, user.businessId)));
    const [business] = await tx
      .select({
        businessProfile: businesses.businessProfile,
        sellingModel: businesses.sellingModel,
      })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));
    return { store, business };
  });
  if (!store || !business) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/stores" className="text-sm underline underline-offset-4">
        Back to stores
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{store.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set the profile for this store, or inherit the business defaults.
        </p>
      </div>
      <BusinessProfileForm
        initial={store}
        storeId={id}
        defaultLabel={BUSINESS_PROFILES[effectiveProfile(business).businessProfile].label}
      />
    </div>
  );
}
