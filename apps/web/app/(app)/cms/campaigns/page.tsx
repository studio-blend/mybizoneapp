import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { marketingCampaigns } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const user = await requireUser();

  const rows = await withTenant(db, user.businessId, async (tx) => {
    return tx
      .select()
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.businessId, user.businessId))
      .orderBy(desc(marketingCampaigns.createdAt))
      .limit(100);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaign History</h1>
        <Button asChild variant="outline">
          <Link href="/cms">Back to CMS</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No campaigns yet. Go to CMS to create one.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead>Sent at</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.createdAt
                        ? new Date(c.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.status === 'sent'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {c.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{c.recipientCount ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.sentAt
                        ? new Date(c.sentAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/cms/campaigns/${c.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
