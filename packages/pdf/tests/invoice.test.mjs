import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderInvoicePdf } from '../dist/invoice.js';

// Render with the actual installed font/layout/renderer stack, not a mock.
for (const isGstInvoice of [false, true]) {
  test(isGstInvoice ? 'renders a GST invoice' : 'renders a non-GST receipt', async () => {
    const bytes = await renderInvoicePdf({
      isGstInvoice,
      business: { name: 'Disposable PDF fixture', gstin: isGstInvoice ? '27AAPFU0939F1ZV' : null },
      invoice: { number: 'TEST-1', date: new Date('2026-09-25T12:00:00Z'), isInterstate: false },
      customer: { name: 'Test buyer', phone: null, gstin: null, address: null },
      lines: [
        {
          productName: 'Widget',
          hsnCode: null,
          qty: '1',
          unitSymbol: 'pc',
          unitPrice: '100.00',
          gstRate: isGstInvoice ? '18' : null,
          gstAmount: isGstInvoice ? '18.00' : '0.00',
          lineTotal: isGstInvoice ? '118.00' : '100.00',
        },
      ],
      totals: {
        subtotal: '100.00',
        discount: '0.00',
        cgst: isGstInvoice ? '9.00' : '0.00',
        sgst: isGstInvoice ? '9.00' : '0.00',
        igst: '0.00',
        total: isGstInvoice ? '118.00' : '100.00',
      },
    });
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.match(bytes.subarray(-100).toString(), /%%EOF/);
    assert.ok(bytes.length > 1000);
  });
}
