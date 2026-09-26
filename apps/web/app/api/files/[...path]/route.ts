import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { getSessionUser } from '@/lib/session';
import { storage } from '@/lib/storage';
import { invoices, products, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { StorageError, isValidKey, mimeFromKey } from '@mybizone/storage';
import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Auth-gated file serving. Tenancy is enforced by inspecting the key shape:
 * keys are `<category>/<businessId>/<filename>` and the requesting session
 * must own the businessId segment. 404 (not 403) on mismatch so we don't
 * confirm whether a key exists for someone else.
 *
 * Permission checks use current role grants. Sensitive assets are never cached.
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const user = await getSessionUser();
  if (!user || !user.businessId) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  if (user.mustChangePassword) return new NextResponse('forbidden', { status: 403 });

  const key = (await ctx.params).path.join('/');
  if (!isValidKey(key)) {
    return new NextResponse('not found', { status: 404 });
  }
  const segments = key.split('/');
  if (segments.length < 3 || segments[1] !== user.businessId) {
    return new NextResponse('not found', { status: 404 });
  }

  const currentUser = { ...user, businessId: user.businessId };
  try {
    if (segments[0] === 'invoices' || segments[0] === 'bills') {
      const row = await withTenant(db, user.businessId, async (tx) => {
        if (segments[0] === 'invoices') {
          const [invoice] = await tx
            .select({ storeId: sales.storeId })
            .from(invoices)
            .innerJoin(sales, eq(sales.id, invoices.saleId))
            .where(
              and(
                eq(invoices.businessId, user.businessId!),
                eq(sales.businessId, user.businessId!),
                eq(invoices.pdfKey, key),
              ),
            );
          return invoice;
        }
        const [sale] = await tx
          .select({ storeId: sales.storeId })
          .from(sales)
          .where(and(eq(sales.businessId, user.businessId!), eq(sales.billImageKey, key)));
        return sale;
      });
      if (!row) return new NextResponse('not found', { status: 404 });
      await requirePermission(currentUser, 'view_sales', { storeId: row.storeId });
    } else if (segments[0] === 'products') {
      const [product] = await withTenant(db, user.businessId, (tx) =>
        tx
          .select({ storeId: products.storeId })
          .from(products)
          .where(and(eq(products.businessId, user.businessId!), eq(products.imageKey, key))),
      );
      if (!product) return new NextResponse('not found', { status: 404 });
      await requirePermission(currentUser, 'manage_products', { storeId: product.storeId });
    } else if (['brands', 'catalogues'].includes(segments[0]!)) {
      await requirePermission(currentUser, 'manage_products');
    } else {
      return new NextResponse('not found', { status: 404 });
    }
  } catch {
    return new NextResponse('forbidden', { status: 403 });
  }

  try {
    const body = await storage.get(key);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': mimeFromKey(key),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': String(body.byteLength),
      },
    });
  } catch (err) {
    if (err instanceof StorageError && err.code === 'not_found') {
      return new NextResponse('not found', { status: 404 });
    }
    throw err;
  }
}
