import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { brands, categories, products, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.businessId) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const businessId = user.businessId;

  const rows = await withTenant(db, businessId, (tx) =>
    tx
      .select({
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        storeName: stores.name,
        categoryName: categories.name,
        brandName: brands.name,
        unitSymbol: products.unitSymbol,
        price: products.price,
        inventory: products.inventory,
        hsnCode: products.hsnCode,
        gstRate: products.gstRate,
        active: products.active,
      })
      .from(products)
      .leftJoin(stores, eq(stores.id, products.storeId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(and(eq(products.businessId, businessId)))
      .orderBy(asc(products.name)),
  );

  const header = [
    'name',
    'sku',
    'barcode',
    'store',
    'category',
    'brand',
    'unit',
    'price',
    'inventory',
    'hsn_code',
    'gst_rate',
    'active',
  ].join(',');

  const lines = [header];
  for (const r of rows) {
    lines.push(
      [
        cell(r.name),
        cell(r.sku ?? ''),
        cell(r.barcode ?? ''),
        cell(r.storeName ?? ''),
        cell(r.categoryName ?? ''),
        cell(r.brandName ?? ''),
        cell(r.unitSymbol),
        cell(r.price),
        cell(r.inventory),
        cell(r.hsnCode ?? ''),
        cell(r.gstRate ?? ''),
        cell(r.active ? 'true' : 'false'),
      ].join(','),
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="inventory-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

function cell(v: string | number): string {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
