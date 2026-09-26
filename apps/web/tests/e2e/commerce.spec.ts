import { expect, test } from '@playwright/test';
import { createOwnerAndStore } from './helpers';

test('GST business issues an invoice for a paid sale', async ({ page }) => {
  test.setTimeout(process.env.RELEASE_E2E_DEV === 'true' ? 240_000 : 120_000);
  await createOwnerAndStore(page, { gst: true });
  const product = `Taxed widget ${Date.now()}`;
  await page.goto('/products/new');
  await page.locator('#name').fill(product);
  await page.locator('#storeId').selectOption({ label: 'Main Shop' });
  await page.locator('#price').fill('100');
  await page.locator('#inventory').fill('3');
  await page.getByLabel('GST rate %', { exact: true }).fill('18');
  await page.getByRole('button', { name: 'Create product', exact: true }).click();
  await expect(page).toHaveURL(/\/products$/);
  await page.goto('/sales/new');
  await page.getByLabel('Bill type', { exact: true }).selectOption('gst_bill');
  await page.getByPlaceholder('Name, SKU, or barcode').fill(product);
  await page.getByRole('button', { name: new RegExp(product) }).click();
  await page.getByRole('button', { name: 'Save bill (F2)', exact: true }).click();
  await expect(page).toHaveURL(/\/sales$/);
  await expect(page.getByRole('row').filter({ hasText: 'cash' })).toContainText('118.00');
  await page.getByRole('link', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Generate GST invoice', exact: true }).click();
  const pdf = page.getByRole('link', { name: 'Download PDF', exact: true });
  await expect(pdf).toBeVisible({ timeout: 20_000 });
  const response = await page.request.get((await pdf.getAttribute('href'))!);
  expect(response.status()).toBe(200);
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('non-GST purchase, paid sale, persisted receipt and bounded return', async ({
  page,
  browser,
}) => {
  test.setTimeout(process.env.RELEASE_E2E_DEV === 'true' ? 240_000 : 120_000);
  await createOwnerAndStore(page);
  const product = `Acceptance widget ${Date.now()}`;
  await page.goto('/products/new');
  await page.locator('#name').fill(product);
  await page.locator('#storeId').selectOption({ label: 'Main Shop' });
  await page.locator('#price').fill('100');
  await page.locator('#costPrice').fill('60');
  await page.locator('#inventory').fill('0');
  const imageBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  );
  await page
    .locator('#image')
    .setInputFiles({ name: 'widget.png', mimeType: 'image/png', buffer: imageBytes });
  await page.getByRole('button', { name: 'Create product', exact: true }).click();
  await expect(page).toHaveURL(/\/products$/);

  const imageUrl = await page
    .getByRole('row')
    .filter({ hasText: product })
    .locator('img')
    .getAttribute('src');
  expect(imageUrl).toBeTruthy();
  expect(await (await page.request.get(imageUrl!)).body()).toEqual(imageBytes);
  await page.goto('/purchases/new');
  await page.getByLabel('Supplier name', { exact: true }).fill('Disposable supplier');
  await page
    .locator('select')
    .filter({ has: page.locator('option', { hasText: product }) })
    .selectOption({ label: product });
  const productId = await page
    .locator('select')
    .filter({ has: page.locator('option', { hasText: product }) })
    .inputValue();
  await page.getByPlaceholder(/^Qty/).fill('5');
  await page.getByPlaceholder('Unit price', { exact: true }).fill('60');
  await page.getByRole('button', { name: 'Create purchase bill' }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  await expect(page.getByRole('row').filter({ hasText: 'Disposable supplier' })).toContainText(
    '300.00',
  );
  const purchaseBillNo = (
    await page
      .getByRole('row')
      .filter({ hasText: 'Disposable supplier' })
      .getByRole('cell')
      .first()
      .innerText()
  ).trim();
  await page.goto('/products');
  await expect(page.getByRole('row').filter({ hasText: product })).toContainText('5.000');

  await page.goto('/sales/new');
  await page.getByLabel('Bill type', { exact: true }).selectOption('non_gst_bill');
  await page.getByPlaceholder('Name, SKU, or barcode').fill(product);
  await page.getByRole('button', { name: new RegExp(product) }).click();
  await page.getByRole('row').filter({ hasText: product }).locator('input').first().fill('2');
  await page.getByLabel('Customer name', { exact: true }).fill('Disposable buyer');
  await page.getByLabel('Payment', { exact: true }).selectOption('upi');
  await page.getByLabel('UPI Ref', { exact: true }).fill('LOCAL-TEST-ONLY');
  await page.getByRole('button', { name: 'Save bill (F2)', exact: true }).click();
  await expect(page).toHaveURL(/\/sales$/);
  const saleRow = page.getByRole('row').filter({ hasText: 'Disposable buyer' });
  await expect(saleRow).toContainText('200.00');
  await expect(saleRow).toContainText('upi');
  const billNo = (await saleRow.getByRole('cell').first().innerText()).trim();
  await saleRow.getByRole('link', { name: 'View', exact: true }).click();
  await expect(page).toHaveURL(/\/sales\/[0-9a-f-]+$/);
  const saleUrl = page.url();
  await page.getByRole('button', { name: 'Generate receipt', exact: true }).click();
  const pdf = page.getByRole('link', { name: 'Download PDF', exact: true });
  await expect(pdf).toBeVisible({ timeout: 20_000 });
  const pdfUrl = await pdf.getAttribute('href');
  expect(pdfUrl).toBeTruthy();
  const response = await page.request.get(pdfUrl!);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await page.reload();
  await expect(pdf).toHaveAttribute('href', pdfUrl!);
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(pdfUrl!)).status()).toBe(401);
  await anonymous.close();

  await page.goto('/returns/new');
  await page.getByLabel('Original bill number', { exact: true }).fill(billNo);
  await page.getByLabel('Product', { exact: true }).selectOption(productId);
  await page.getByLabel('Qty', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Create return', exact: true }).click();
  await expect(page).toHaveURL(/\/returns$/);
  await page.goto('/products');
  await expect(page.getByRole('row').filter({ hasText: product })).toContainText('4.000');
  await page.goto('/returns/new');
  await page.getByLabel('Original bill number', { exact: true }).fill(billNo);
  await page.getByLabel('Product', { exact: true }).selectOption(productId);
  await page.getByLabel('Qty', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Create return', exact: true }).click();
  await expect(
    page.getByText('return quantity exceeds remaining quantity on original bill', { exact: true }),
  ).toBeVisible();
  await page.goto('/products');
  await expect(page.getByRole('row').filter({ hasText: product })).toContainText('4.000');
  await page.goto(saleUrl);
  await expect(pdf).toHaveAttribute('href', pdfUrl!);
  await page.goto('/purchase-returns/new');
  await page.getByLabel('Original purchase bill number', { exact: true }).fill(purchaseBillNo);
  await page.getByLabel('Product', { exact: true }).selectOption(productId);
  await page.getByLabel('Qty', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Create purchase return', exact: true }).click();
  await expect(page).toHaveURL(/\/purchase-returns$/);
  await page.goto('/products');
  await expect(page.getByRole('row').filter({ hasText: product })).toContainText('3.000');
  expect(await (await page.request.get(imageUrl!)).body()).toEqual(imageBytes);
});
