import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { campaignRecipients, customers, marketingCampaigns } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const data = await withTenant(db, user.businessId, async (tx) => {
    const [campaign] = await tx
      .select()
      .from(marketingCampaigns)
      .where(
        and(
          eq(marketingCampaigns.id, params.id),
          eq(marketingCampaigns.businessId, user.businessId),
        ),
      );
    if (!campaign) return null;

    const recipients = await tx
      .select({
        id: campaignRecipients.id,
        phone: campaignRecipients.phone,
        personalizedMessage: campaignRecipients.personalizedMessage,
        openedWhatsappAt: campaignRecipients.openedWhatsappAt,
        customerName: customers.name,
      })
      .from(campaignRecipients)
      .leftJoin(customers, eq(campaignRecipients.customerId, customers.id))
      .where(
        and(
          eq(campaignRecipients.campaignId, params.id),
          eq(campaignRecipients.businessId, user.businessId),
        ),
      )
      .limit(500);

    return { campaign, recipients };
  });

  if (!data) notFound();
  const { campaign, recipients } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            Created{' '}
            {campaign.createdAt
              ? new Date(campaign.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : '—'}
            {' · '}
            <span
              className={`font-medium ${
                campaign.status === 'sent' ? 'text-green-700' : 'text-yellow-700'
              }`}
            >
              {campaign.status}
            </span>
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/cms/campaigns">Back</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message template</CardTitle>
          <CardDescription>
            {campaign.recipientCount ?? 0} recipients sent
            {campaign.sentAt
              ? ` on ${new Date(campaign.sentAt).toLocaleDateString('en-IN')}`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
            {campaign.messageTemplate}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <CardDescription>{recipients.length} recipients in this campaign.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recipients.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No recipients found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Message (preview)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.customerName ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.phone ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-sm text-sm text-muted-foreground">
                      <span className="line-clamp-2">
                        {r.personalizedMessage ?? '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
