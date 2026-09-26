import { randomUUID } from 'node:crypto';
import {
  brands,
  businesses,
  categories,
  customers,
  products,
  sales,
  stores,
  user,
} from '@mybizone/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const enabled =
  process.env.DATABASE_URL === 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const state = vi.hoisted(() => ({
  id: '',
  businessId: '',
  storeId: null as string | null,
  role: 'owner',
}));
vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@mybizone/db');
  return { db: createDb('postgresql://postgres@127.0.0.1:55432/mybizone_release_test') };
});
vi.mock('@/lib/session', () => ({ requireUser: async () => ({ ...state }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/storage', () => ({ uploadFile: vi.fn(async () => ({ key: 'test.pdf' })) }));
import { db } from '@/lib/db';
import { uploadFile } from '@/lib/storage';
import { createBrandAction } from '../../app/(app)/brands/actions';
import { createCatalogueAction } from '../../app/(app)/catalogues/actions';
import { createCategoryAction } from '../../app/(app)/categories/actions';
import {
  addCustomerNoteAction,
  addCustomerTagAction,
} from '../../app/(app)/customers/[id]/actions';
import { createDcAction } from '../../app/(app)/delivery-challans/actions';
import { createDepartmentAction } from '../../app/(app)/departments/actions';
import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from '../../app/(app)/products/actions';
import { createQuotationAction } from '../../app/(app)/quotations/actions';
import { cancelIrnAction, generateIrnAction } from '../../app/(app)/reports/e-invoice/actions';
import {
  downloadGstr1ExcelAction,
  downloadGstr1JsonAction,
} from '../../app/(app)/reports/gstr1/actions';
import { downloadGstr3bPdfAction, fetchGstr3bData } from '../../app/(app)/reports/gstr3b/actions';
import { createSaleAction, uploadSaleBillImageAction } from '../../app/(app)/sales/actions';

const businessIds: string[] = [];
let ownStore = '';
let otherStore = '';
let foreignStore = '';
let foreignCustomer = '';
let productId = '';
const productInput = () => ({
  name: 'Security product',
  storeId: ownStore,
  categoryId: '',
  brandId: '',
  unitType: 'piece',
  unitSymbol: 'pc',
  price: '10',
  costPrice: '',
  mrp: '',
  wholesalePrice: '',
  rate1: '',
  rate2: '',
  rate3: '',
  rate4: '',
  minStock: '',
  inventory: '4',
  gstRate: '',
});
async function role(role: string, storeId: string | null = null) {
  state.role = role;
  state.storeId = storeId;
  await db.update(user).set({ role, storeId }).where(eq(user.id, state.id));
}
describe.skipIf(!enabled)('mutation and report security boundaries on isolated PostgreSQL', () => {
  beforeAll(async () => {
    const [business] = await db
      .insert(businesses)
      .values({ name: 'Mutation security' })
      .returning();
    const [foreign] = await db
      .insert(businesses)
      .values({ name: 'Foreign mutation security' })
      .returning();
    if (!business || !foreign) throw new Error('business fixture failed');
    state.businessId = business.id;
    businessIds.push(business.id, foreign.id);
    state.id = randomUUID();
    await db.insert(user).values({
      id: state.id,
      businessId: state.businessId,
      name: 'Security user',
      email: `${state.id}@example.invalid`,
      role: 'owner',
      active: true,
    });
    const scopedStores = await db
      .insert(stores)
      .values([
        { businessId: state.businessId, name: 'Assigned' },
        { businessId: state.businessId, name: 'Unassigned' },
        { businessId: foreign.id, name: 'Foreign' },
      ])
      .returning();
    if (!scopedStores[0] || !scopedStores[1] || !scopedStores[2])
      throw new Error('store fixture failed');
    ownStore = scopedStores[0].id;
    otherStore = scopedStores[1].id;
    foreignStore = scopedStores[2].id;
    const [customer] = await db
      .insert(customers)
      .values({ businessId: foreign.id, name: 'Foreign customer' })
      .returning();
    if (!customer) throw new Error('customer fixture failed');
    foreignCustomer = customer.id;
  });
  afterAll(async () => {
    for (const id of businessIds) await db.delete(businesses).where(eq(businesses.id, id));
    await (db as unknown as { $client?: { end: () => Promise<void> } }).$client?.end();
  });
  it('allows assigned-store product changes and denies moving or deleting other-store products', async () => {
    await role('inventory', ownStore);
    const result = await createProductAction(productInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    productId = result.data.id;
    expect(
      await updateProductAction({ ...productInput(), id: productId, storeId: otherStore }),
    ).toMatchObject({ ok: false, error: 'Permission denied' });
    await role('inventory', otherStore);
    expect(await deleteProductAction({ id: productId })).toMatchObject({
      ok: false,
      error: 'Permission denied',
    });
    expect((await db.select().from(products).where(eq(products.id, productId)))[0]?.active).toBe(
      true,
    );
    await role('inventory', ownStore);
    expect(
      (await updateProductAction({ ...productInput(), id: productId, name: 'Allowed edit' })).ok,
    ).toBe(true);
  });
  it('authorizes bill uploads using the persisted sale store before writing a file', async () => {
    const [sale] = await db
      .insert(sales)
      .values({
        businessId: state.businessId,
        storeId: ownStore,
        billNo: randomUUID(),
        subtotal: '10',
        taxTotal: '0',
        total: '10',
        paymentMethod: 'cash',
      })
      .returning();
    if (!sale) throw new Error('sale fixture missing');
    const form = new FormData();
    form.set('id', sale.id);
    form.set('file', new Blob(['test'], { type: 'application/pdf' }), 'test.pdf');
    await role('employee', otherStore);
    vi.mocked(uploadFile).mockClear();
    expect(await uploadSaleBillImageAction(form)).toMatchObject({
      ok: false,
      error: 'Permission denied',
    });
    expect(uploadFile).not.toHaveBeenCalled();
    await role('employee', ownStore);
    expect((await uploadSaleBillImageAction(form)).ok).toBe(true);
    form.set('id', randomUUID());
    vi.mocked(uploadFile).mockClear();
    expect(await uploadSaleBillImageAction(form)).toMatchObject({
      ok: false,
      error: 'sale not found',
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it('allows scoped walk-in sales but denies shared customer account sales', async () => {
    const [customer] = await db
      .insert(customers)
      .values({ businessId: state.businessId, name: 'Shared customer' })
      .returning();
    if (!customer) throw new Error('customer fixture missing');
    const input = {
      storeId: ownStore,
      paymentMethod: 'cash',
      billType: 'non_gst_bill',
      discount: '0',
      lines: [{ productId, qty: '1' }],
    };
    await role('employee', ownStore);
    expect(await createSaleAction({ ...input, customerId: customer.id })).toMatchObject({
      ok: false,
      error: 'Permission denied',
    });
    expect((await createSaleAction(input)).ok).toBe(true);
    await role('billing');
    expect((await createSaleAction({ ...input, customerId: customer.id })).ok).toBe(true);
  });
  it('rejects tagging or annotating a foreign customer', async () => {
    await role('owner');
    expect(await addCustomerTagAction({ customerId: foreignCustomer, tag: 'test' })).toMatchObject({
      ok: false,
      error: 'customer not found',
    });
    expect(
      await addCustomerNoteAction({ customerId: foreignCustomer, note: 'test' }),
    ).toMatchObject({ ok: false, error: 'customer not found' });
    const [customer] = await db
      .insert(customers)
      .values({ businessId: state.businessId, name: 'Own customer' })
      .returning();
    if (!customer) throw new Error('customer fixture missing');
    expect((await addCustomerTagAction({ customerId: customer.id, tag: 'allowed' })).ok).toBe(true);
    expect((await addCustomerNoteAction({ customerId: customer.id, note: 'allowed' })).ok).toBe(
      true,
    );
  });
  it('rejects foreign-business store references even for an owner', async () => {
    await role('owner');
    expect(await createProductAction({ ...productInput(), storeId: foreignStore })).toMatchObject({
      ok: false,
      error: 'store not found',
    });
  });
  it('rejects foreign master-data references before writes or file upload', async () => {
    await role('owner');
    const foreignBusiness = businessIds[1];
    if (!foreignBusiness) throw new Error('fixture missing');
    const [brand] = await db
      .insert(brands)
      .values({ businessId: foreignBusiness, name: 'Foreign brand' })
      .returning();
    const [category] = await db
      .insert(categories)
      .values({ businessId: foreignBusiness, name: 'Foreign category' })
      .returning();
    if (!brand || !category) throw new Error('fixture missing');
    expect(await createProductAction({ ...productInput(), brandId: brand.id })).toMatchObject({
      ok: false,
      error: 'brand not found',
    });
    expect(await createProductAction({ ...productInput(), categoryId: category.id })).toMatchObject(
      { ok: false, error: 'category not found in selected store' },
    );
    expect(
      await createCategoryAction({ name: 'Child', parentId: category.id, storeId: '' }),
    ).toMatchObject({ ok: false, error: 'parent category not found' });
    expect(
      await createCategoryAction({ name: 'Category', parentId: '', storeId: foreignStore }),
    ).toMatchObject({ ok: false, error: 'store not found' });
    expect(
      await createDepartmentAction({ name: 'Department', storeId: foreignStore }),
    ).toMatchObject({ ok: false, error: 'store not found' });
    const form = new FormData();
    form.set('name', 'Foreign reference catalogue');
    form.set('brandId', brand.id);
    form.set('file', new Blob(['test'], { type: 'application/pdf' }), 'test.pdf');
    vi.mocked(uploadFile).mockClear();
    expect(await createCatalogueAction(form)).toMatchObject({
      ok: false,
      error: 'brand not found',
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it('denies scoped tenant-wide master writes and allows an unscoped inventory role', async () => {
    await role('inventory', ownStore);
    expect(await createBrandAction({ name: 'Denied brand' })).toMatchObject({
      ok: false,
      error: 'Permission denied',
    });
    await role('inventory');
    expect((await createBrandAction({ name: 'Allowed brand' })).ok).toBe(true);
  });
  it.each([
    ['quotation', createQuotationAction],
    ['delivery challan', createDcAction],
  ] as const)('rejects a foreign customer in %s', async (_name, action) => {
    await role('owner');
    expect(
      await action({
        customerId: foreignCustomer,
        items: [{ productId, qty: '1', unitPrice: '10' }],
      }),
    ).toMatchObject({ ok: false, error: 'customer not found' });
    expect((await action({ items: [{ productId, qty: '1', unitPrice: '10' }] })).ok).toBe(true);
  });
  it.each(['employee', 'scoped accounts'])(
    'denies aggregate report/export and e-invoice actions for %s',
    async (kind) => {
      await role(
        kind === 'employee' ? 'employee' : 'accounts',
        kind === 'employee' ? null : ownStore,
      );
      const params = { financialYear: '2026-27', fromDate: '2026-04-01', toDate: '2027-03-31' };
      expect(await downloadGstr1JsonAction(params)).toEqual({ error: 'Permission denied' });
      expect(await downloadGstr1ExcelAction(params)).toEqual({ error: 'Permission denied' });
      expect(await fetchGstr3bData(params)).toEqual({ error: 'Permission denied' });
      expect(await downloadGstr3bPdfAction(params)).toEqual({ error: 'Permission denied' });
      expect(await generateIrnAction({ saleId: randomUUID() })).toEqual({
        error: 'Permission denied',
      });
      expect(await cancelIrnAction({ eInvoiceId: randomUUID(), reason: 'test' })).toEqual({
        error: 'Permission denied',
      });
    },
  );
  it('allows unscoped accounts reports and rejects missing e-invoice sale lookup', async () => {
    await role('accounts');
    const params = { financialYear: '2026-27', fromDate: '2026-04-01', toDate: '2027-03-31' };
    expect(await downloadGstr1JsonAction(params)).not.toHaveProperty('error');
    expect(await downloadGstr1ExcelAction(params)).not.toHaveProperty('error');
    expect(await fetchGstr3bData(params)).not.toHaveProperty('error');
    expect(await generateIrnAction({ saleId: randomUUID() })).toHaveProperty('error');
  });
});
