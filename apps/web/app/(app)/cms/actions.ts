'use server';

import { safeAction } from '@/lib/server-action';
import { campaignRecipients, customerTags, customers, marketingCampaigns, sales } from '@mybizone/db';
import { and, desc, eq, gte, gt, inArray, isNotNull, lte, sql, sum } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const RATE_CATEGORIES = ['retail', 'wholesale', 'mrp', 'dealer', 'rate1', 'rate2', 'rate3', 'rate4'] as const;

const SegmentFiltersSchema = z.object({
  tags: z.array(z.string()).optional(),
  lastPurchaseDays: z.enum(['7', '30', '60', '90', 'never']).optional(),
  outstandingMin: z.string().optional(),
  lifetimeValueMin: z.string().optional(),
  rateCategory: z.enum(RATE_CATEGORIES).optional(),
  hasPhone: z.enum(['yes', 'no']).optional(),
});

export type SegmentFilters = z.infer<typeof SegmentFiltersSchema>;

export type SegmentCustomer = {
  id: string;
  name: string;
  phone: string | null;
  tags: string[];
  lastPurchaseAt: Date | null;
  outstandingBalance: string;
  lifetimeValue: string;
};

export const getSegmentAction = safeAction(
  SegmentFiltersSchema,
  async (filters, { user, tx }) => {
    // Build customer IDs matching tag filter
    let tagFilteredIds: string[] | null = null;
    if (filters.tags && filters.tags.length > 0) {
      const rows = await tx
        .select({ customerId: customerTags.customerId })
        .from(customerTags)
        .where(
          and(
            eq(customerTags.businessId, user.businessId),
            inArray(customerTags.tag, filters.tags),
          ),
        );
      tagFilteredIds = [...new Set(rows.map((r) => r.customerId))];
      if (tagFilteredIds.length === 0) return [] as SegmentCustomer[];
    }

    // Build lifetime value subquery
    const ltv = tx
      .select({
        customerId: sales.customerId,
        total: sum(sales.total).as('ltv'),
      })
      .from(sales)
      .where(eq(sales.businessId, user.businessId))
      .groupBy(sales.customerId)
      .as('ltv');

    // Build WHERE conditions for customers
    const conditions = [eq(customers.businessId, user.businessId)];

    if (tagFilteredIds !== null) {
      conditions.push(inArray(customers.id, tagFilteredIds));
    }

    if (filters.hasPhone === 'yes') {
      conditions.push(isNotNull(customers.phone));
    } else if (filters.hasPhone === 'no') {
      conditions.push(sql`${customers.phone} IS NULL`);
    }

    if (filters.outstandingMin && Number(filters.outstandingMin) > 0) {
      conditions.push(gt(customers.outstandingBalance, filters.outstandingMin));
    }

    if (filters.rateCategory) {
      conditions.push(eq(customers.rateCategory, filters.rateCategory));
    }

    const rows = await tx
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        outstandingBalance: customers.outstandingBalance,
        rateCategory: customers.rateCategory,
        createdAt: customers.createdAt,
        ltv: ltv.total,
        lastPurchaseAt: sql<Date | null>`(
          SELECT MAX(s.created_at) FROM sales s
          WHERE s.customer_id = ${customers.id}
            AND s.business_id = ${customers.businessId}
        )`.as('last_purchase_at'),
      })
      .from(customers)
      .leftJoin(ltv, eq(ltv.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(customers.outstandingBalance))
      .limit(200);

    // Apply post-filters that need computed values
    let filtered = rows;

    if (filters.lastPurchaseDays) {
      if (filters.lastPurchaseDays === 'never') {
        filtered = filtered.filter((r) => !r.lastPurchaseAt);
      } else {
        const days = Number(filters.lastPurchaseDays);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        filtered = filtered.filter(
          (r) => r.lastPurchaseAt && new Date(r.lastPurchaseAt) >= cutoff,
        );
      }
    }

    if (filters.lifetimeValueMin && Number(filters.lifetimeValueMin) > 0) {
      filtered = filtered.filter(
        (r) => Number(r.ltv ?? 0) >= Number(filters.lifetimeValueMin),
      );
    }

    // Fetch tags for result set
    const ids = filtered.map((r) => r.id);
    if (ids.length === 0) return [] as SegmentCustomer[];

    const tagRows = await tx
      .select({ customerId: customerTags.customerId, tag: customerTags.tag })
      .from(customerTags)
      .where(
        and(
          eq(customerTags.businessId, user.businessId),
          inArray(customerTags.customerId, ids),
        ),
      );

    const tagMap = new Map<string, string[]>();
    for (const t of tagRows) {
      const arr = tagMap.get(t.customerId) ?? [];
      arr.push(t.tag);
      tagMap.set(t.customerId, arr);
    }

    return filtered.map((r): SegmentCustomer => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      tags: tagMap.get(r.id) ?? [],
      lastPurchaseAt: r.lastPurchaseAt ? new Date(r.lastPurchaseAt) : null,
      outstandingBalance: r.outstandingBalance,
      lifetimeValue: r.ltv ?? '0',
    }));
  },
);

// ── Campaign actions ──────────────────────────────────────────────────────────

const LaunchCampaignSchema = z.object({
  campaignName: z.string().min(1).max(200),
  messageTemplate: z.string().min(1).max(5000),
  customerIds: z.array(z.string().uuid()).min(1).max(500),
  storeName: z.string().default(''),
});

function replaceCampaignVars(
  template: string,
  customer: { name: string; lastPurchaseAt: Date | null; outstandingBalance: string; storeName: string },
) {
  return template
    .replace(/{name}/g, customer.name)
    .replace(
      /{last_purchase}/g,
      customer.lastPurchaseAt
        ? new Date(customer.lastPurchaseAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'N/A',
    )
    .replace(
      /{balance}/g,
      `₹${Number(customer.outstandingBalance).toLocaleString('en-IN')}`,
    )
    .replace(/{store_name}/g, customer.storeName);
}

export const launchCampaignAction = safeAction(
  LaunchCampaignSchema,
  async (input, { user, tx }) => {
    // Create campaign
    const [campaign] = await tx
      .insert(marketingCampaigns)
      .values({
        businessId: user.businessId,
        name: input.campaignName,
        messageTemplate: input.messageTemplate,
        status: 'draft',
        recipientCount: 0,
      })
      .returning({ id: marketingCampaigns.id });
    if (!campaign) throw new Error('campaign insert failed');

    // Fetch customer details
    const custRows = await tx
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        outstandingBalance: customers.outstandingBalance,
        lastPurchaseAt: sql<Date | null>`(
          SELECT MAX(s.created_at) FROM sales s
          WHERE s.customer_id = ${customers.id}
            AND s.business_id = ${customers.businessId}
        )`.as('last_purchase_at'),
      })
      .from(customers)
      .where(
        and(
          eq(customers.businessId, user.businessId),
          inArray(customers.id, input.customerIds),
        ),
      );

    // Build recipient rows
    const recipientRows = custRows.map((c) => ({
      businessId: user.businessId,
      campaignId: campaign.id,
      customerId: c.id,
      phone: c.phone ?? null,
      personalizedMessage: replaceCampaignVars(input.messageTemplate, {
        name: c.name,
        lastPurchaseAt: c.lastPurchaseAt,
        outstandingBalance: c.outstandingBalance,
        storeName: input.storeName,
      }),
    }));

    if (recipientRows.length > 0) {
      await tx.insert(campaignRecipients).values(recipientRows);
    }

    return {
      campaignId: campaign.id,
      recipients: recipientRows
        .filter((r) => r.phone)
        .map((r) => ({ phone: r.phone!, message: r.personalizedMessage })),
    };
  },
);

const MarkSentSchema = z.object({
  campaignId: z.string().uuid(),
  count: z.number().int().min(0),
});

export const markCampaignSentAction = safeAction(
  MarkSentSchema,
  async (input, { user, tx }) => {
    await tx
      .update(marketingCampaigns)
      .set({
        status: 'sent',
        sentAt: new Date(),
        recipientCount: input.count,
      })
      .where(
        and(
          eq(marketingCampaigns.id, input.campaignId),
          eq(marketingCampaigns.businessId, user.businessId),
        ),
      );
    revalidatePath('/cms/campaigns');
    return { ok: true };
  },
);
