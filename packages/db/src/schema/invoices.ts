import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { sales } from './sales';

// One invoice per GST-billable sale. Amounts duplicate sales.* on purpose so a frozen
// invoice document survives later edits/voids on the source sale.
// is_interstate decides between cgst+sgst (intra) vs igst (inter) per GST rules.
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    saleId: uuid('sale_id')
      .notNull()
      .unique()
      .references(() => sales.id, { onDelete: 'cascade' }),
    invoiceNo: text('invoice_no').notNull(),
    businessGstin: text('business_gstin'),
    customerGstin: text('customer_gstin'),
    customerName: text('customer_name'),
    customerAddress: text('customer_address'),
    isInterstate: boolean('is_interstate').notNull().default(false),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    cgst: numeric('cgst', { precision: 10, scale: 2 }).notNull().default('0'),
    sgst: numeric('sgst', { precision: 10, scale: 2 }).notNull().default('0'),
    igst: numeric('igst', { precision: 10, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    pdfKey: text('pdf_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('invoices_business_id_idx').on(t.businessId),
    invoiceNoUnique: unique('invoices_business_invoice_no_unique').on(t.businessId, t.invoiceNo),
  }),
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
