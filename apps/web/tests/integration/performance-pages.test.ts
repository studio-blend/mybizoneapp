import { randomUUID } from 'node:crypto';
import { loadDashboardData } from '@/lib/dashboard-data';
import {
  businesses,
  categories,
  customerTags,
  customers,
  expenseEntries,
  products,
  saleItems,
  sales,
  stores,
  suppliers,
  user,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { eq, sql } from 'drizzle-orm';
import { type ReactNode, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const url = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const state = vi.hoisted(() => ({
  id: '',
  businessId: '',
  role: 'owner',
  storeId: null as string | null,
}));
vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@mybizone/db');
  return { db: createDb('postgresql://postgres@127.0.0.1:55432/mybizone_release_test') };
});
vi.mock('@/lib/session', () => ({ requireUser: async () => ({ ...state }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));
vi.mock('../../app/(app)/products/_components/product-filters', () => ({
  ProductFilters: () => null,
}));
vi.mock('../../app/(app)/products/_components/delete-button', () => ({
  DeleteProductButton: () => null,
}));
vi.mock('../../app/(app)/customers/_components/tag-filter', () => ({ TagFilter: () => null }));
vi.mock('../../app/(app)/customers/_components/delete-button', () => ({
  DeleteCustomerButton: () => null,
}));
vi.mock('../../app/(app)/suppliers/_components/delete-button', () => ({
  DeleteSupplierButton: () => null,
}));
import { db } from '@/lib/db';
import CustomersPage from '../../app/(app)/customers/page';
import ProductsPage from '../../app/(app)/products/page';
import SalesPage from '../../app/(app)/sales/page';
import SuppliersPage from '../../app/(app)/suppliers/page';

const businessIds: string[] = [];
let storeId = '';
let otherStoreId = '';
let categoryId = '';
let productId = '';
const now = new Date(2026, 9, 14);
const date = (month: number, day = 1) => new Date(2026, month, day);
const tableRows = (html: string) =>
  (html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1]?.match(/<tr/g) ?? []).length;

describe.skipIf(process.env.DATABASE_URL !== url)(
  'performance changes on isolated PostgreSQL',
  () => {
    beforeAll(async () => {
      const [business, foreign] = await db
        .insert(businesses)
        .values([
          { name: 'Performance fixtures', plan: 'pro' },
          { name: 'Other performance tenant' },
        ])
        .returning();
      if (!business || !foreign) throw new Error('Fixture creation failed');
      businessIds.push(business.id, foreign.id);
      state.businessId = business.id;
      state.id = randomUUID();
      await db.insert(user).values({
        id: state.id,
        businessId: business.id,
        name: 'Performance owner',
        email: `${state.id}@example.invalid`,
        emailVerified: true,
        role: 'owner',
      });
      const [store, otherStore] = await db
        .insert(stores)
        .values([
          { businessId: business.id, name: 'Performance store' },
          { businessId: business.id, name: 'Other store' },
        ])
        .returning();
      if (!store || !otherStore) throw new Error('Store creation failed');
      storeId = store.id;
      otherStoreId = otherStore.id;
      await db.insert(stores).values({ businessId: foreign.id, name: 'FOREIGN STORE' });
      const [category] = await db
        .insert(categories)
        .values({ businessId: business.id, name: 'Performance category' })
        .returning();
      if (!category) throw new Error('Category creation failed');
      categoryId = category.id;
      const ps = await db
        .insert(products)
        .values(
          Array.from({ length: 120 }, (_, i) => ({
            businessId: business.id,
            storeId,
            categoryId,
            name: `Performance product ${String(i).padStart(3, '0')}`,
            unitType: 'piece',
            unitSymbol: 'pc',
            price: '10',
          })),
        )
        .returning();
      productId = ps[0]?.id ?? '';
      const cs = await db
        .insert(customers)
        .values(
          Array.from({ length: 120 }, (_, i) => ({
            businessId: business.id,
            name: `Performance customer ${String(i).padStart(3, '0')}`,
            outstandingBalance: i === 119 ? '-20' : '10',
            createdAt: i === 119 ? date(8) : date(9),
          })),
        )
        .returning();
      await db
        .insert(customerTags)
        .values(cs.map((c) => ({ businessId: business.id, customerId: c.id, tag: 'vip' })));
      await db
        .insert(customers)
        .values({ businessId: foreign.id, name: 'FOREIGN CUSTOMER', outstandingBalance: '999999' });
      await db.insert(suppliers).values(
        Array.from({ length: 120 }, (_, i) => ({
          businessId: business.id,
          name: `Performance supplier ${String(i).padStart(3, '0')}`,
          outstandingBalance: i === 119 ? '-10' : '5',
        })),
      );
      await db
        .insert(suppliers)
        .values({ businessId: foreign.id, name: 'FOREIGN SUPPLIER', outstandingBalance: '999999' });
      await db.insert(expenseEntries).values([
        {
          businessId: business.id,
          type: 'expense',
          category: 'Test',
          amount: '20',
          description: 'Current',
          entryDate: date(9),
        },
        {
          businessId: business.id,
          type: 'expense',
          category: 'Test',
          amount: '30',
          description: 'Previous',
          entryDate: date(8),
        },
        {
          businessId: business.id,
          type: 'income',
          category: 'Test',
          amount: '999',
          description: 'Income',
          entryDate: date(9),
        },
        {
          businessId: foreign.id,
          type: 'expense',
          category: 'Test',
          amount: '999',
          description: 'Foreign',
          entryDate: date(9),
        },
      ]);
      const saleRows = await db
        .insert(sales)
        .values([
          {
            businessId: business.id,
            storeId,
            billNo: 'PERF-CURRENT',
            subtotal: '100',
            total: '100',
            paymentMethod: 'cash',
            createdAt: date(9),
          },
          {
            businessId: business.id,
            storeId,
            billNo: 'PERF-PREVIOUS',
            subtotal: '40',
            total: '40',
            paymentMethod: 'cash',
            createdAt: date(8),
          },
          {
            businessId: business.id,
            storeId,
            billNo: 'PERF-ESTIMATE',
            subtotal: '999',
            total: '999',
            paymentMethod: 'cash',
            billType: 'estimate',
            createdAt: date(9),
          },
          {
            businessId: business.id,
            storeId,
            billNo: 'PERF-VOID',
            subtotal: '999',
            total: '999',
            paymentMethod: 'cash',
            status: 'voided',
            createdAt: date(9),
          },
          {
            businessId: business.id,
            storeId,
            billNo: 'PERF-FUTURE',
            subtotal: '999',
            total: '999',
            paymentMethod: 'cash',
            createdAt: date(10),
          },
        ])
        .returning();
      for (const sale of saleRows) {
        await db.insert(saleItems).values([
          {
            businessId: business.id,
            saleId: sale.id,
            productId,
            productName: 'Snapshot product',
            qty: '2',
            unitSymbol: 'pc',
            unitPrice: '10',
            costPriceAtSale: '3',
            lineTotal: sale.total,
          },
          {
            businessId: business.id,
            saleId: sale.id,
            productId,
            productName: 'Free product',
            qty: '1',
            unitSymbol: 'pc',
            unitPrice: '10',
            costPriceAtSale: '8',
            isFreeItem: true,
            lineTotal: '0',
          },
        ]);
      }
    });

    afterAll(async () => {
      for (const id of businessIds) {
        await db.delete(user).where(eq(user.businessId, id));
        await db.delete(businesses).where(eq(businesses.id, id));
      }
      await db.$client.end({ timeout: 5 });
    });

    it('preserves financial/date/free-item and tenant rules while combining scans', async () => {
      const data = await loadDashboardData(db, state.businessId, now);
      expect(data).toMatchObject({
        revThis: 100,
        revPrev: 40,
        expThis: 20,
        expPrev: 30,
        cogsThis: 6,
        unitsSold: 3,
        custTotal: 120,
        custNew: 119,
        receivables: 1190,
        payables: 595,
        productCount: 120,
      });

      expect(data.pmtRaw).toEqual([{ method: 'cash', total: '100.00' }]);
    });

    it('enforces RLS with the combined context and resets it after commit and rollback', async () => {
      const ownRows = await withTenant(db, state.businessId, async (tx) => {
        const [context] = await tx.execute(sql`SELECT current_user AS role`);
        expect(context?.role).toBe('app_user');
        return tx.select({ businessId: stores.businessId }).from(stores);
      });
      expect(ownRows).toHaveLength(2);
      expect(ownRows.every((row) => row.businessId === state.businessId)).toBe(true);
      await expect(
        withTenant(db, state.businessId, async () => {
          throw new Error('Deliberate rollback');
        }),
      ).rejects.toThrow('Deliberate rollback');
      const [outside] = await db.execute(
        sql`SELECT current_user AS role, current_setting('app.business_id', true) AS tenant`,
      );
      expect(outside?.role).not.toBe('app_user');
      expect(outside?.tenant ?? '').toBe('');
      const foreignRows = await withTenant(db, businessIds[1] ?? '', (tx) =>
        tx.select({ businessId: stores.businessId }).from(stores),
      );
      expect(foreignRows).toHaveLength(1);
      expect(foreignRows[0]?.businessId).toBe(businessIds[1]);
    });

    it('bounds product pages without losing rows or filters', async () => {
      const filter = { categoryId, storeId, q: 'Performance' };
      const first = renderToStaticMarkup(
        await ProductsPage({ searchParams: Promise.resolve(filter) }),
      );
      const second = renderToStaticMarkup(
        await ProductsPage({ searchParams: Promise.resolve({ ...filter, page: '2' }) }),
      );
      const last = renderToStaticMarkup(
        await ProductsPage({ searchParams: Promise.resolve({ ...filter, page: '3' }) }),
      );
      expect([tableRows(first), tableRows(second), tableRows(last)]).toEqual([50, 50, 20]);
      expect(first).toContain('page=2');
      expect(first).toContain(`categoryId=${categoryId}`);
      expect(first).toContain(`storeId=${storeId}`);
      const ids = (html: string) =>
        [...html.matchAll(/\/products\/([^/]+)\/edit/g)].map((m) => m[1]);
      expect(new Set([...ids(first), ...ids(second), ...ids(last)]).size).toBe(120);
      expect(last).not.toContain('>Next</a>');
    });

    it('paginates tagged customers and preserves business-wide outstanding totals', async () => {
      const first = renderToStaticMarkup(
        await CustomersPage({ searchParams: Promise.resolve({ tag: 'vip' }) }),
      );
      const last = renderToStaticMarkup(
        await CustomersPage({ searchParams: Promise.resolve({ tag: 'vip', page: '3' }) }),
      );
      expect([tableRows(first), tableRows(last)]).toEqual([50, 20]);
      expect(first).toContain('tag=vip');
      expect(first).toContain('1170.00');
      expect(last).toContain('1170.00');
      expect(first).not.toContain('FOREIGN CUSTOMER');
      expect(
        tableRows(
          renderToStaticMarkup(
            await CustomersPage({ searchParams: Promise.resolve({ tag: 'missing' }) }),
          ),
        ),
      ).toBe(0);
    });

    it('paginates suppliers and preserves totals across all pages', async () => {
      const first = renderToStaticMarkup(
        await SuppliersPage({ searchParams: Promise.resolve({}) }),
      );
      const last = renderToStaticMarkup(
        await SuppliersPage({ searchParams: Promise.resolve({ page: '3' }) }),
      );
      expect([tableRows(first), tableRows(last)]).toEqual([50, 20]);
      expect(first).toContain('585.00');
      expect(last).toContain('585.00');
      expect(first).not.toContain('FOREIGN SUPPLIER');
    });

    it('still rejects inaccessible stores when reusing loaded roles', async () => {
      await db.update(user).set({ role: 'employee', storeId }).where(eq(user.id, state.id));
      try {
        await expect(
          ProductsPage({ searchParams: Promise.resolve({ storeId: otherStoreId }) }),
        ).rejects.toThrow('Permission denied');
        await expect(
          SalesPage({ searchParams: Promise.resolve({ storeId: otherStoreId }) }),
        ).rejects.toThrow('Permission denied');
      } finally {
        await db.update(user).set({ role: 'owner', storeId: null }).where(eq(user.id, state.id));
      }
    });
  },
);
