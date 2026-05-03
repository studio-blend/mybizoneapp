import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { sales, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Streaming CSV export of sales matching the same filters as /sales.
 * Server-side serialization (not client-side) so we don't OOM on large
 * histories. RLS enforces tenant scope.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.businessId) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const url = new URL(req.url);
  const storeId = pickUuid(url.searchParams.get('storeId'));
  const fromDate = parseDate(url.searchParams.get('from'));
  const toDate = parseDate(url.searchParams.get('to'));

  const businessId = user.businessId;
  const rows = await withTenant(db, businessId, async (tx) => {
    const conditions = [eq(sales.businessId, businessId)];
    if (storeId) conditions.push(eq(sales.storeId, storeId));
    if (fromDate) conditions.push(gte(sales.createdAt, fromDate));
    if (toDate) conditions.push(lte(sales.createdAt, toDate));
    return tx
      .select({
        billNo: sales.billNo,
        createdAt: sales.createdAt,
        storeName: stores.name,
        customerName: sales.customerName,
        customerPhone: sales.customerPhone,
        paymentMethod: sales.paymentMethod,
        subtotal: sales.subtotal,
        discount: sales.discount,
        taxTotal: sales.taxTotal,
        total: sales.total,
        status: sales.status,
      })
      .from(sales)
      .leftJoin(stores, eq(stores.id, sales.storeId))
      .where(and(...conditions))
      .orderBy(desc(sales.createdAt));
  });

  const headerLine = [
    'bill_no',
    'date',
    'store',
    'customer_name',
    'customer_phone',
    'payment',
    'subtotal',
    'discount',
    'tax_total',
    'total',
    'status',
  ].join(',');

  const lines = [headerLine];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.billNo),
        csvCell(new Date(r.createdAt).toISOString()),
        csvCell(r.storeName ?? ''),
        csvCell(r.customerName ?? ''),
        csvCell(r.customerPhone ?? ''),
        csvCell(r.paymentMethod),
        csvCell(r.subtotal),
        csvCell(r.discount),
        csvCell(r.taxTotal),
        csvCell(r.total),
        csvCell(r.status),
      ].join(','),
    );
  }
  const body = lines.join('\n');
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sales-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

function csvCell(v: string | number): string {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function pickUuid(v: string | null): string | null {
  if (!v) return null;
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

function parseDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
