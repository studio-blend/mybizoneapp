import { randomUUID } from 'node:crypto';
import {
  account,
  businesses,
  createDb,
  products,
  sales,
  stores,
  user,
  userRoles,
} from '@mybizone/db';
import { expect, test } from '@playwright/test';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';

const isolatedUrl = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';

test('employee login enforces role, store and tenant boundaries in the browser', async ({
  page,
}) => {
  // Fail closed: this scenario must never silently skip or seed another database.
  expect(process.env.DATABASE_URL, 'Run through the isolated release-check helper').toBe(
    isolatedUrl,
  );
  const db = createDb(isolatedUrl);
  const tenantIds: string[] = [];
  try {
    const tenants = await db
      .insert(businesses)
      .values([{ name: 'Browser permission acceptance' }, { name: 'Foreign browser acceptance' }])
      .returning();
    tenantIds.push(...tenants.map((tenant) => tenant.id));
    const businessId = tenants[0]!.id;
    const foreignId = tenants[1]!.id;
    const shops = await db
      .insert(stores)
      .values([
        { businessId, name: 'Assigned Shop' },
        { businessId, name: 'Restricted Shop' },
        { businessId: foreignId, name: 'Foreign Shop' },
      ])
      .returning();
    await db.insert(products).values(
      shops.map((shop, index) => ({
        businessId: shop.businessId,
        storeId: shop.id,
        name: `SCOPE-PRODUCT-${index}`,
        unitType: 'piece',
        unitSymbol: 'pc',
        price: '10',
        inventory: '5',
      })),
    );
    const employeeId = randomUUID();
    const empId = `EMP${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const password = 'Acceptance-password-123!';
    await db.insert(user).values({
      id: employeeId,
      businessId,
      name: 'Scoped Employee',
      email: `${employeeId}@example.invalid`,
      emailVerified: true,
      role: 'custom',
      empId,
      storeId: shops[0]!.id,
    });
    await db.insert(account).values({
      id: randomUUID(),
      accountId: employeeId,
      userId: employeeId,
      providerId: 'credential',
      password: await hashPassword(password),
    });
    await db.insert(userRoles).values({
      userId: employeeId,
      businessId,
      role: 'sales',
      storeId: shops[0]!.id,
    });
    const bills = await db
      .insert(sales)
      .values(
        shops.map((shop, index) => ({
          businessId: shop.businessId,
          storeId: shop.id,
          billNo: `SCOPE-BILL-${index}`,
          subtotal: '10',
          total: '10',
          paymentMethod: 'cash',
          billImageKey: `bills/${shop.businessId}/scope-${index}.pdf`,
        })),
      )
      .returning();

    await page.goto('/login?next=/sales');
    await page.getByRole('button', { name: 'Employee', exact: true }).click();
    await page.getByLabel('Employee ID', { exact: true }).fill(empId);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const signInResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/emp-signin') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    expect((await signInResponse).status()).toBe(200);
    await expect(page).toHaveURL((url) => url.pathname === '/sales', { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Sales', exact: true })).toBeVisible();
    await expect(page.getByText('SCOPE-BILL-0', { exact: true })).toBeVisible();
    await expect(page.getByText('SCOPE-BILL-1', { exact: true })).toHaveCount(0);
    await expect(page.getByText('SCOPE-BILL-2', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Store', { exact: true }).locator('option')).toHaveText([
      'All stores',
      'Assigned Shop',
    ]);
    await page.goto('/sales/new');
    await expect(page.getByLabel('Store', { exact: true }).locator('option')).toHaveText([
      'Assigned Shop',
    ]);
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
    await page.getByPlaceholder('Name, SKU, or barcode').fill('SCOPE-PRODUCT');
    await expect(page.getByText('SCOPE-PRODUCT-0', { exact: true })).toBeVisible();
    await expect(page.getByText('SCOPE-PRODUCT-1', { exact: true })).toHaveCount(0);
    await expect(page.getByText('SCOPE-PRODUCT-2', { exact: true })).toHaveCount(0);

    const allowedExport = await page.request.get(`/api/sales/export?storeId=${shops[0]!.id}`);
    expect(allowedExport.status()).toBe(200);
    expect(await allowedExport.text()).toContain('SCOPE-BILL-0');
    for (const shop of [shops[1]!, shops[2]!]) {
      expect((await page.request.get(`/api/sales/export?storeId=${shop.id}`)).status()).toBe(403);
    }
    expect((await page.request.get(`/api/files/${bills[1]!.billImageKey}`)).status()).toBe(403);
    expect((await page.request.get(`/api/files/${bills[2]!.billImageKey}`)).status()).toBe(404);
    expect((await page.request.get('/api/reports/inventory/export')).status()).toBe(403);

    for (const path of [
      '/products',
      '/reports',
      `/sales?storeId=${shops[1]!.id}`,
      `/sales/${bills[1]!.id}`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
      await expect(page.getByText('SCOPE-BILL-1', { exact: true })).toHaveCount(0);
    }
    // Revocation takes effect for the existing authenticated browser session.
    await db.delete(userRoles).where(eq(userRoles.userId, employeeId));
    expect((await page.request.get(`/api/sales/export?storeId=${shops[0]!.id}`)).status()).toBe(
      403,
    );
  } finally {
    for (const businessId of tenantIds) {
      await db.delete(sales).where(eq(sales.businessId, businessId));
      await db.delete(products).where(eq(products.businessId, businessId));
      await db.delete(userRoles).where(eq(userRoles.businessId, businessId));
      await db.delete(businesses).where(eq(businesses.id, businessId));
    }
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  }
});
