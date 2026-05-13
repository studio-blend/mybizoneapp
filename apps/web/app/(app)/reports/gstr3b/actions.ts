'use server';

import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { businesses, purchases, sales, suppliers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { round2 } from '@mybizone/domain/money';
import { and, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

const paramsSchema = z.object({
  fromDate: z.string(),
  toDate: z.string(),
});

type Params = z.infer<typeof paramsSchema>;

export interface Gstr3bData {
  // 3.1 Outward supplies
  outwardTaxable: { taxable: number; igst: number; cgst: number; sgst: number };
  outwardExempt: number;
  // 4. ITC eligible
  itcInward: { taxable: number; igst: number; cgst: number; sgst: number };
  // 5. Net ITC
  netItc: number;
  // 5.1 Net payable
  netPayable: number;
  periodFrom: string;
  periodTo: string;
  businessName: string;
  gstin: string;
}

export async function fetchGstr3bData(rawParams: Params): Promise<Gstr3bData | { error: string }> {
  try {
    const user = await requireUser();
    const params = paramsSchema.parse(rawParams);
    const fromDate = new Date(`${params.fromDate}T00:00:00`);
    const toDate = new Date(`${params.toDate}T23:59:59`);

    const data = await withTenant(db, user.businessId, async (tx) => {
      const bizRows = await tx
        .select({ name: businesses.name, gstin: businesses.gstin })
        .from(businesses)
        .where(eq(businesses.id, user.businessId));
      const biz = bizRows[0] ?? { name: '', gstin: '' };

      // 3.1(a) Taxable outward supplies (gst_bill)
      const outwardRows = await tx
        .select({
          subtotal: sql<string>`sum(${sales.subtotal}::numeric)`.as('subtotal'),
          taxTotal: sql<string>`sum(${sales.taxTotal}::numeric)`.as('tax_total'),
        })
        .from(sales)
        .where(
          and(
            eq(sales.businessId, user.businessId),
            eq(sales.status, 'completed'),
            eq(sales.billType, 'gst_bill'),
            gte(sales.createdAt, fromDate),
            lte(sales.createdAt, toDate),
          ),
        );

      // 3.1(c) Exempt (non_gst_bill)
      const exemptRows = await tx
        .select({ total: sql<string>`sum(${sales.total}::numeric)`.as('total') })
        .from(sales)
        .where(
          and(
            eq(sales.businessId, user.businessId),
            eq(sales.status, 'completed'),
            eq(sales.billType, 'non_gst_bill'),
            gte(sales.createdAt, fromDate),
            lte(sales.createdAt, toDate),
          ),
        );

      // 4(A) ITC from registered suppliers (with GSTIN)
      const itcRows = await tx
        .select({
          subtotal: sql<string>`sum(${purchases.subtotal}::numeric)`.as('subtotal'),
          taxTotal: sql<string>`sum(${purchases.taxTotal}::numeric)`.as('tax_total'),
        })
        .from(purchases)
        .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
        .where(
          and(
            eq(purchases.businessId, user.businessId),
            isNotNull(suppliers.gstin),
            gte(purchases.purchaseDate, fromDate),
            lte(purchases.purchaseDate, toDate),
          ),
        );

      return {
        biz,
        outward: outwardRows[0],
        exempt: exemptRows[0],
        itc: itcRows[0],
      };
    });

    const outwardTax = Number(data.outward?.taxTotal ?? 0);
    const itcTax = Number(data.itc?.taxTotal ?? 0);
    const netItc = itcTax;
    const netPayable = round2(outwardTax - netItc);

    return {
      outwardTaxable: {
        taxable: Number(data.outward?.subtotal ?? 0),
        igst: 0,
        cgst: round2(outwardTax / 2),
        sgst: round2(outwardTax / 2),
      },
      outwardExempt: Number(data.exempt?.total ?? 0),
      itcInward: {
        taxable: Number(data.itc?.subtotal ?? 0),
        igst: 0,
        cgst: round2(itcTax / 2),
        sgst: round2(itcTax / 2),
      },
      netItc,
      netPayable,
      periodFrom: params.fromDate,
      periodTo: params.toDate,
      businessName: data.biz?.name ?? '',
      gstin: data.biz?.gstin ?? '',
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function downloadGstr3bPdfAction(rawParams: Params): Promise<{
  data: string;
  filename: string;
  mimeType: string;
} | { error: string }> {
  try {
    const result = await fetchGstr3bData(rawParams);
    if ('error' in result) return result;

    // Dynamic import to keep JSX in .tsx and allow server action in .ts
    const { pdf } = await import('@react-pdf/renderer');
    const { Gstr3bPdf } = await import('./pdf-template');
    const React = await import('react');

    const doc = React.createElement(Gstr3bPdf, { data: result });
    const stream = await pdf(doc as React.ReactElement).toBuffer();
    const chunks: Buffer[] = [];
    for await (const chunk of stream as NodeJS.ReadableStream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
    }
    const buffer = Buffer.concat(chunks);
    const filename = `GSTR3B_${rawParams.fromDate}_${rawParams.toDate}.pdf`;

    return {
      data: Buffer.from(buffer).toString('base64'),
      filename,
      mimeType: 'application/pdf',
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
