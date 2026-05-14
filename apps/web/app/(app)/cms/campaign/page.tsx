import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { businesses, customers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { and, eq, inArray, sql } from 'drizzle-orm';
import Link from 'next/link';
import { CampaignComposer } from './_components/campaign-composer';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({
  searchParams,
}: {
  searchParams: { ids?: string };
}) {
  const user = await requireUser();

  const rawIds = searchParams.ids ?? '';
  const customerIds = rawIds
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^[0-9a-f-]{36}$/.test(id));

  if (customerIds.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Campaign Composer</h1>
        <p className="text-muted-foreground">
          No customers selected.{' '}
          <Link href="/cms" className="underline">
            Go back to segment builder
          </Link>
          .
        </p>
      </div>
    );
  }

  const { customerRows, storeName } = await withTenant(db, user.businessId, async (tx) => {
    const rows = await tx
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        outstandingBalance: customers.outstandingBalance,
        lastPurchaseAt: sql<string | null>`(
          SELECT MAX(s.created_at)::text FROM sales s
          WHERE s.customer_id = ${customers.id}
            AND s.business_id = ${customers.businessId}
        )`.as('last_purchase_at'),
      })
      .from(customers)
      .where(
        and(
          eq(customers.businessId, user.businessId),
          inArray(customers.id, customerIds),
        ),
      );

    const [biz] = await tx
      .select({ name: businesses.name })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));

    return { customerRows: rows, storeName: biz?.name ?? 'Our Store' };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaign Composer</h1>
          <p className="text-sm text-muted-foreground">
            Composing for {customerRows.length} customer{customerRows.length !== 1 ? 's' : ''}.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/cms">Back to segments</Link>
        </Button>
      </div>
      <CampaignComposer
        customers={customerRows.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          outstandingBalance: c.outstandingBalance,
          lastPurchaseAt: c.lastPurchaseAt,
        }))}
        storeName={storeName}
      />
    </div>
  );
}
