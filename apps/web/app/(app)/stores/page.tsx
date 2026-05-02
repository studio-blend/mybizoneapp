import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { desc } from 'drizzle-orm';
import Link from 'next/link';

export default async function StoresPage() {
  const user = await requireUser();
  const rows = await withTenant(db, user.businessId, (tx) =>
    tx.select().from(stores).orderBy(desc(stores.createdAt)),
  );

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
              {s.phone && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{s.phone}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
