import { BUSINESS_PROFILES, SELLING_MODELS, effectiveProfile } from '@/lib/business-profile';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { businesses, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';

export default async function StoresPage() {
  const user = await requireUser();
  await requirePermission(user, 'manage_stores');
  const { rows, business } = await withTenant(db, user.businessId, async (tx) => {
    const rows = await tx.select().from(stores).orderBy(desc(stores.createdAt));
    const [business] = await tx
      .select({
        businessProfile: businesses.businessProfile,
        sellingModel: businesses.sellingModel,
      })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));
    return { rows, business };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Stores</h1>
        <Button asChild>
          <Link href="/stores/new">New store</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No stores yet</CardTitle>
            <CardDescription>Create your first store to get started.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/stores/new">Create store</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle>{s.name}</CardTitle>
                {s.address && <CardDescription>{s.address}</CardDescription>}
              </CardHeader>
              <CardContent>
                {s.phone && <p className="text-sm text-muted-foreground">{s.phone}</p>}
                <p className="mt-2 text-sm font-medium">
                  {BUSINESS_PROFILES[effectiveProfile(business ?? {}, s).businessProfile].label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {SELLING_MODELS[effectiveProfile(business ?? {}, s).sellingModel]}
                  {!s.businessProfile ? ' · Inherited profile' : ''}
                </p>
                <Link
                  href={`/stores/${s.id}/profile`}
                  className="mt-4 inline-block text-sm underline underline-offset-4"
                >
                  Configure profile
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
