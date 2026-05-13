import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sales } from './sales';

export const eInvoices = pgTable('e_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id),
  irn: text('irn').unique(),
  ackNo: text('ack_no'),
  ackDate: timestamp('ack_date'),
  signedInvoice: text('signed_invoice'),
  signedQrCode: text('signed_qr_code'),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type EInvoice = typeof eInvoices.$inferSelect;
export type NewEInvoice = typeof eInvoices.$inferInsert;
