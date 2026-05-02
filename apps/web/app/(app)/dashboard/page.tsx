import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import Link from 'next/link';

export default async function DashboardPage() {
  const user = await requireUser();
  const storeRows = await withTenant(db, user.businessId, (tx) => tx.select().from(stores));

  if (storeRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome, {user.name}</CardTitle>
          <CardDescription>Set up your first store to start tracking inventory.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/stores/new">Create your first store</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">M1 shell green. Features land in M2.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {storeRows.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{s.name}</CardTitle>
              {s.address && <CardDescription>{s.address}</CardDescription>}
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
