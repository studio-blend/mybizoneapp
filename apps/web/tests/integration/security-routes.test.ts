import { randomUUID } from 'node:crypto';
import type { AppUser } from '@/lib/session';
import {
  businesses,
  categories,
  invoices,
  products,
  sales,
  stores,
  user,
  userRoles,
} from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { type ReactNode, isValidElement } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const enabled =
  process.env.DATABASE_URL === 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const state = vi.hoisted(() => ({ current: null as (AppUser & { businessId: string }) | null }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@mybizone/db');
  return { db: createDb('postgresql://postgres@127.0.0.1:55432/mybizone_release_test') };
});
vi.mock('@/lib/session', () => ({
  getSessionUser: async () => state.current,
  requireUser: async () => {
    if (!state.current) throw new Error('unauthorized');
    return state.current;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
  redirect: () => {
    throw new Error('redirect');
  },
}));
vi.mock('@/lib/storage', () => ({
  storage: { get: vi.fn(async () => Buffer.from('private-file')) },
}));
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { GET as getFile } from '../../app/api/files/[...path]/route';
import { GET as exportInventory } from '../../app/api/reports/inventory/export/route';
import { GET as exportSales } from '../../app/api/sales/export/route';

const tenants: string[] = [];
let assigned = '';
let other = '';
let foreign = '';
const request = (path = '/') => new NextRequest(`http://localhost${path}`);
const file = (key: string) =>
  getFile(request(), { params: Promise.resolve({ path: key.split('/') }) });
function pageText(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(pageText).join(' ');
  if (isValidElement<{ children?: ReactNode }>(node)) return pageText(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

describe.skipIf(!enabled)('route authorization against isolated PostgreSQL', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const [business, otherBusiness] = await db
      .insert(businesses)
      .values([{ name: 'Route security' }, { name: 'Foreign route security' }])
      .returning();
    if (!business || !otherBusiness) throw new Error('fixture failed');
    tenants.push(business.id, otherBusiness.id);
    const rows = await db
      .insert(stores)
      .values([
        { businessId: business.id, name: 'Assigned' },
        { businessId: business.id, name: 'Other' },
        { businessId: otherBusiness.id, name: 'Foreign' },
      ])
      .returning();
    assigned = rows[0]!.id;
    other = rows[1]!.id;
    foreign = rows[2]!.id;
    const id = randomUUID();
    await db.insert(user).values({
      id,
      name: 'Scoped tester',
      email: `${id}@example.invalid`,
      businessId: business.id,
      role: 'custom',
    });
    state.current = {
      id,
      businessId: business.id,
      name: 'Scoped tester',
      email: `${id}@example.invalid`,
      role: 'custom',
      storeId: null,
      empId: null,
      emailVerified: true,
      mustChangePassword: false,
    };
    await db
      .insert(userRoles)
      .values({ userId: id, businessId: business.id, role: 'sales', storeId: assigned });
    for (const [index, store] of rows.entries()) {
      await db.insert(sales).values({
        businessId: store.businessId,
        storeId: store.id,
        billNo: `VISIBLE-${index}`,
        subtotal: '1',
        total: '1',
        paymentMethod: 'cash',
        billImageKey: `bills/${store.businessId}/sale-${index}.pdf`,
      });
      await db.insert(products).values({
        businessId: store.businessId,
        storeId: store.id,
        name: `PRODUCT-${index}`,
        unitType: 'piece',
        unitSymbol: 'pc',
        price: '1',
      });
    }
  });
  afterAll(async () => {
    try {
      for (const businessId of tenants) {
        await db.delete(userRoles).where(eq(userRoles.businessId, businessId));
        await db.delete(businesses).where(eq(businesses.id, businessId));
      }
    } finally {
      await (db as unknown as { $client?: { end: () => Promise<void> } }).$client?.end();
    }
  });
  it('rejects direct business-wide report and product page access for scoped sales staff', async () => {
    const { default: ReportsPage } = await import('../../app/(app)/reports/page');
    const { default: ProductsPage } = await import('../../app/(app)/products/page');
    await expect(ReportsPage()).rejects.toThrow('Permission denied');
    await expect(ProductsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'Permission denied',
    );
  });
  it('serves scoped POS and sales pages with only authorized store data', async () => {
    // Next supplies the JSX runtime in production; Vitest's TSX transform uses React.
    vi.stubGlobal('React', await import('react'));
    try {
      const { default: NewSalePage } = await import('../../app/(app)/sales/new/page');
      const { default: SalesPage } = await import('../../app/(app)/sales/page');
      const pos = await NewSalePage();
      expect(pos.props.stores.map((store: { id: string }) => store.id)).toEqual([assigned]);
      expect(pos.props.products.map((product: { name: string }) => product.name)).toEqual([
        'PRODUCT-0',
      ]);
      expect(pos.props.customers).toEqual([]);
      const salesPage = await SalesPage({ searchParams: Promise.resolve({}) });
      const rendered = pageText(salesPage);
      expect(rendered).toContain('VISIBLE-0');
      expect(rendered).not.toContain('VISIBLE-1');
      expect(rendered).not.toContain('VISIBLE-2');
      await expect(
        SalesPage({ searchParams: Promise.resolve({ storeId: other }) }),
      ).rejects.toThrow('Permission denied');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('serves assigned-store inventory pages and images without exposing other stores', async () => {
    await db
      .update(userRoles)
      .set({ role: 'inventory' })
      .where(eq(userRoles.userId, state.current!.id));
    const businessId = state.current!.businessId;
    await db.insert(categories).values([
      { businessId, name: 'Assigned category', storeId: assigned },
      { businessId, name: 'Other category', storeId: other },
    ]);
    const productRows = await db.select().from(products).where(eq(products.businessId, businessId));
    const ownProduct = productRows.find((product) => product.storeId === assigned)!;
    const otherProduct = productRows.find((product) => product.storeId === other)!;
    vi.stubGlobal('React', await import('react'));
    try {
      const { default: ProductsPage } = await import('../../app/(app)/products/page');
      const { default: NewProductPage } = await import('../../app/(app)/products/new/page');
      const { default: EditProductPage } = await import('../../app/(app)/products/[id]/edit/page');
      const page = await ProductsPage({ searchParams: Promise.resolve({}) });
      expect(pageText(page)).toContain('PRODUCT-0');
      expect(pageText(page)).not.toContain('PRODUCT-1');
      expect(pageText(page)).not.toContain('PRODUCT-2');
      await expect(
        ProductsPage({ searchParams: Promise.resolve({ storeId: other }) }),
      ).rejects.toThrow('Permission denied');
      const form = (await NewProductPage()).props.children;
      expect(form.props.stores.map((store: { id: string }) => store.id)).toEqual([assigned]);
      expect(form.props.categories.map((category: { name: string }) => category.name)).toEqual([
        'Assigned category',
      ]);
      const edit = (await EditProductPage({ params: Promise.resolve({ id: ownProduct.id }) })).props
        .children;
      expect(edit.props.initial.id).toBe(ownProduct.id);
      await expect(
        EditProductPage({ params: Promise.resolve({ id: otherProduct.id }) }),
      ).rejects.toThrow('Permission denied');
    } finally {
      vi.unstubAllGlobals();
    }
    for (const product of productRows) {
      const key = `products/${businessId}/${product.id}.png`;
      await db.update(products).set({ imageKey: key }).where(eq(products.id, product.id));
      expect((await file(key)).status).toBe(product.storeId === assigned ? 200 : 403);
    }
    expect(storage.get).toHaveBeenCalledOnce();
  });
  it('denies onboarding pages and their demo-product side effect to non-administrators', async () => {
    const { default: OnboardingPage } = await import('../../app/(app)/onboarding/page');
    const { default: StorePage } = await import('../../app/(app)/onboarding/store/page');
    const { default: DemoPage } = await import('../../app/(app)/onboarding/demo-sale/page');
    for (const page of [OnboardingPage, StorePage, DemoPage])
      await expect(page()).rejects.toThrow('Permission denied');
    expect(
      await db.select().from(products).where(eq(products.businessId, state.current!.businessId)),
    ).toHaveLength(2);
  });
  it('exports only an authorized store and rejects omitted, other-store and foreign scopes', async () => {
    const response = await exportSales(request(`/api/sales/export?storeId=${assigned}`));
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain('VISIBLE-0');
    expect(csv).not.toContain('VISIBLE-1');
    expect(csv).not.toContain('VISIBLE-2');
    for (const query of ['', `?storeId=${other}`, `?storeId=${foreign}`]) {
      expect((await exportSales(request(`/api/sales/export${query}`))).status).toBe(403);
    }
  });
  it('limits business-wide report export to an unscoped report grant and the current business', async () => {
    expect((await exportInventory(request())).status).toBe(403);
    await db
      .update(userRoles)
      .set({ role: 'accounts' })
      .where(eq(userRoles.userId, state.current!.id));
    expect((await exportInventory(request())).status).toBe(403);
    await db
      .update(userRoles)
      .set({ storeId: null })
      .where(eq(userRoles.userId, state.current!.id));
    const response = await exportInventory(request());
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain('PRODUCT-0');
    expect(csv).toContain('PRODUCT-1');
    expect(csv).not.toContain('PRODUCT-2');
  });
  it('rechecks role revocation, locked and inactive accounts at export time', async () => {
    const req = request(`/api/sales/export?storeId=${assigned}`);
    expect((await exportSales(req)).status).toBe(200);
    await db.update(user).set({ lockedAt: new Date() }).where(eq(user.id, state.current!.id));
    expect((await exportSales(req)).status).toBe(403);
    await db
      .update(user)
      .set({ lockedAt: null, active: false })
      .where(eq(user.id, state.current!.id));
    expect((await exportSales(req)).status).toBe(403);
    await db.update(user).set({ active: true }).where(eq(user.id, state.current!.id));
    await db.delete(userRoles).where(eq(userRoles.userId, state.current!.id));
    expect((await exportSales(req)).status).toBe(403);
  });
  it('authorizes bill files using their persisted store and rejects cross-tenant paths before storage', async () => {
    const businessId = state.current!.businessId;
    const response = await file(`bills/${businessId}/sale-0.pdf`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await file(`bills/${businessId}/sale-1.pdf`)).status).toBe(403);
    expect((await file(`bills/${tenants[tenants.length - 1]}/sale-2.pdf`)).status).toBe(404);
    expect((await file(`bills/${businessId}/missing.pdf`)).status).toBe(404);
    expect(storage.get).toHaveBeenCalledTimes(1);
  });
  it('authorizes invoice PDFs by the persisted sale store', async () => {
    const businessId = state.current!.businessId;
    for (const storeId of [assigned, other]) {
      const [sale] = await db
        .select()
        .from(sales)
        .where(and(eq(sales.businessId, businessId), eq(sales.storeId, storeId)));
      const key = `invoices/${businessId}/${sale!.id}.pdf`;
      await db.insert(invoices).values({
        businessId,
        saleId: sale!.id,
        invoiceNo: randomUUID(),
        subtotal: '1',
        total: '1',
        pdfKey: key,
      });
      expect((await file(key)).status).toBe(storeId === assigned ? 200 : 403);
    }
    expect(storage.get).toHaveBeenCalledOnce();
  });
  it('denies file access after revocation and requires inventory permission for catalogue files', async () => {
    const businessId = state.current!.businessId;
    expect((await file(`catalogues/${businessId}/catalogue.pdf`)).status).toBe(403);
    await db
      .update(userRoles)
      .set({ role: 'inventory', storeId: null })
      .where(eq(userRoles.userId, state.current!.id));
    expect((await file(`catalogues/${businessId}/catalogue.pdf`)).status).toBe(200);
    await db.delete(userRoles).where(eq(userRoles.userId, state.current!.id));
    expect((await file(`catalogues/${businessId}/catalogue.pdf`)).status).toBe(403);
  });
  it('denies temporary-password and unauthenticated access to exports and files', async () => {
    const key = `bills/${state.current!.businessId}/sale-0.pdf`;
    state.current!.mustChangePassword = true;
    expect((await exportSales(request(`/api/sales/export?storeId=${assigned}`))).status).toBe(403);
    expect((await file(key)).status).toBe(403);
    state.current = null;
    expect((await exportSales(request())).status).toBe(401);
    expect((await exportInventory(request())).status).toBe(401);
    expect((await file(key)).status).toBe(401);
  });
});
