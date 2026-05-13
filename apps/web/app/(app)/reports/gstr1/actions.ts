'use server';

import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { customers, saleItems, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { round2 } from '@mybizone/domain/money';
import { isInterstate } from '@mybizone/domain/gst';
import { and, eq, gte, isNotNull, lte, ne, sql, sum } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { z } from 'zod';

const paramsSchema = z.object({
  financialYear: z.string(),   // '2025-26'
  fromDate: z.string(),
  toDate: z.string(),
  businessGstin: z.string().optional(),
});

type Params = z.infer<typeof paramsSchema>;

function formatGstnDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

async function fetchGstr1Data(params: Params, businessId: string) {
  const fromDate = new Date(`${params.fromDate}T00:00:00`);
  const toDate = new Date(`${params.toDate}T23:59:59`);

  return withTenant(db, businessId, async (tx) => {
    // B2B sales: buyer has a GSTIN
    const b2bSales = await tx
      .select({
        saleId: sales.id,
        billNo: sales.billNo,
        createdAt: sales.createdAt,
        customerGstin: sales.customerGstin,
        customerName: sales.customerName,
        total: sales.total,
        taxTotal: sales.taxTotal,
        subtotal: sales.subtotal,
        customerId: sales.customerId,
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, businessId),
          eq(sales.status, 'completed'),
          ne(sales.billType, 'estimate'),
          isNotNull(sales.customerGstin),
          gte(sales.createdAt, fromDate),
          lte(sales.createdAt, toDate),
        ),
      );

    // B2CS sales: buyer has no GSTIN
    const b2csSales = await tx
      .select({
        total: sql<string>`sum(${sales.total}::numeric)`.as('total'),
        taxTotal: sql<string>`sum(${sales.taxTotal}::numeric)`.as('tax_total'),
        subtotal: sql<string>`sum(${sales.subtotal}::numeric)`.as('subtotal'),
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, businessId),
          eq(sales.status, 'completed'),
          ne(sales.billType, 'estimate'),
          sql`${sales.customerGstin} IS NULL`,
          gte(sales.createdAt, fromDate),
          lte(sales.createdAt, toDate),
        ),
      );

    // HSN summary
    const hsnSummary = await tx
      .select({
        hsnCode: saleItems.hsnCode,
        productName: sql<string>`max(${saleItems.productName})`.as('product_name'),
        unitSymbol: sql<string>`max(${saleItems.unitSymbol})`.as('unit_symbol'),
        totalQty: sum(saleItems.qty),
        totalValue: sum(saleItems.lineTotal),
        taxableValue: sql<string>`sum(${saleItems.lineTotal}::numeric - ${saleItems.gstAmount}::numeric)`.as('taxable_value'),
        totalGst: sum(saleItems.gstAmount),
        gstRate: sql<string>`max(${saleItems.gstRate}::text)`.as('gst_rate'),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(saleItems.businessId, businessId),
          eq(sales.status, 'completed'),
          ne(sales.billType, 'estimate'),
          eq(saleItems.isFreeItem, false),
          gte(sales.createdAt, fromDate),
          lte(sales.createdAt, toDate),
        ),
      )
      .groupBy(saleItems.hsnCode)
      .orderBy(saleItems.hsnCode);

    // Get items for each B2B sale
    const saleIds = b2bSales.map((s) => s.saleId);
    let b2bItems: Array<{
      saleId: string;
      gstRate: string | null;
      taxableValue: string;
      gstAmount: string;
    }> = [];

    if (saleIds.length > 0) {
      b2bItems = await tx
        .select({
          saleId: saleItems.saleId,
          gstRate: saleItems.gstRate,
          taxableValue: sql<string>`sum(${saleItems.lineTotal}::numeric - ${saleItems.gstAmount}::numeric)`.as('taxable_value'),
          gstAmount: sql<string>`sum(${saleItems.gstAmount}::numeric)`.as('gst_amount'),
        })
        .from(saleItems)
        .where(
          and(
            eq(saleItems.businessId, businessId),
            eq(saleItems.isFreeItem, false),
            sql`${saleItems.saleId} = ANY(ARRAY[${sql.raw(saleIds.map((id) => `'${id}'::uuid`).join(','))}])`,
          ),
        )
        .groupBy(saleItems.saleId, saleItems.gstRate);
    }

    return { b2bSales, b2csSales, hsnSummary, b2bItems };
  });
}

export async function downloadGstr1ExcelAction(rawParams: Params): Promise<{
  data: string;
  filename: string;
  mimeType: string;
} | { error: string }> {
  try {
    const user = await requireUser();
    const params = paramsSchema.parse(rawParams);
    const { b2bSales, b2csSales, hsnSummary, b2bItems } = await fetchGstr1Data(params, user.businessId);

    const bizGstin = params.businessGstin ?? '';

    // Group b2bItems by saleId
    const itemsBySale = b2bItems.reduce<Record<string, typeof b2bItems>>((acc, item) => {
      if (!acc[item.saleId]) acc[item.saleId] = [];
      (acc[item.saleId] as typeof b2bItems).push(item);
      return acc;
    }, {});

    // B2B sheet
    const b2bRows: (string | number)[][] = [
      ['GSTIN of Buyer', 'Receiver Name', 'Invoice Number', 'Invoice Date', 'Invoice Value', 'Taxable Value', 'CGST Rate', 'CGST Amount', 'SGST Rate', 'SGST Amount', 'IGST Rate', 'IGST Amount'],
    ];
    for (const sale of b2bSales) {
      const interstate = isInterstate(bizGstin, sale.customerGstin ?? '') ?? false;
      const saleItemList = itemsBySale[sale.saleId] ?? [];
      for (const item of saleItemList) {
        const rate = Number(item.gstRate ?? 0);
        const taxable = Number(item.taxableValue);
        const gst = Number(item.gstAmount);
        const cgst = interstate ? 0 : round2(gst / 2);
        const sgst = interstate ? 0 : round2(gst / 2);
        const igst = interstate ? gst : 0;
        b2bRows.push([
          sale.customerGstin ?? '',
          sale.customerName ?? '',
          sale.billNo,
          formatGstnDate(sale.createdAt),
          Number(sale.total),
          taxable,
          interstate ? 0 : rate / 2,
          cgst,
          interstate ? 0 : rate / 2,
          sgst,
          interstate ? rate : 0,
          igst,
        ]);
      }
    }

    // B2CS sheet
    const b2csTotal = Number(b2csSales[0]?.total ?? 0);
    const b2csTax = Number(b2csSales[0]?.taxTotal ?? 0);
    const b2csTaxable = Number(b2csSales[0]?.subtotal ?? 0);
    const b2csRows: (string | number)[][] = [
      ['State', 'Rate', 'Taxable Amount', 'CGST', 'SGST', 'IGST'],
      ['33', 'Various', b2csTaxable, round2(b2csTax / 2), round2(b2csTax / 2), 0],
    ];

    // HSN sheet
    const hsnRows: (string | number)[][] = [
      ['HSN Code', 'Description', 'UOM', 'Total Qty', 'Total Value', 'Taxable Value', 'Rate', 'IGST', 'CGST', 'SGST'],
    ];
    for (const row of hsnSummary) {
      const gst = Number(row.totalGst ?? 0);
      const rate = Number(row.gstRate ?? 0);
      hsnRows.push([
        row.hsnCode ?? '',
        row.productName ?? '',
        row.unitSymbol ?? 'NOS',
        Number(row.totalQty ?? 0),
        Number(row.totalValue ?? 0),
        Number(row.taxableValue ?? 0),
        rate,
        0,
        round2(gst / 2),
        round2(gst / 2),
      ]);
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b2bRows), 'B2B');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b2csRows), 'B2CS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hsnRows), 'HSN Summary');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const filename = `GSTR1_${params.financialYear.replace('-', '_')}_${params.fromDate}_${params.toDate}.xlsx`;

    return {
      data: Buffer.from(buffer).toString('base64'),
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function downloadGstr1JsonAction(rawParams: Params): Promise<{
  data: string;
  filename: string;
  mimeType: string;
} | { error: string }> {
  try {
    const user = await requireUser();
    const params = paramsSchema.parse(rawParams);
    const { b2bSales, b2csSales, hsnSummary, b2bItems } = await fetchGstr1Data(params, user.businessId);

    const bizGstin = params.businessGstin ?? '';

    // Group b2bItems by saleId
    const itemsBySale = b2bItems.reduce<Record<string, typeof b2bItems>>((acc, item) => {
      if (!acc[item.saleId]) acc[item.saleId] = [];
      (acc[item.saleId] as typeof b2bItems).push(item);
      return acc;
    }, {});

    // Build B2B section
    const b2bMap: Record<string, { ctin: string; inv: unknown[] }> = {};
    for (const sale of b2bSales) {
      const gstin = sale.customerGstin ?? '';
      if (!b2bMap[gstin]) {
        b2bMap[gstin] = { ctin: gstin, inv: [] };
      }
      const interstate = isInterstate(bizGstin, gstin) ?? false;
      const saleItemList = itemsBySale[sale.saleId] ?? [];
      b2bMap[gstin].inv.push({
        inum: sale.billNo,
        idt: formatGstnDate(sale.createdAt),
        val: Number(sale.total),
        pos: '33',
        rchrg: 'N',
        itms: saleItemList.map((item, idx) => {
          const gst = Number(item.gstAmount);
          const taxval = Number(item.taxableValue);
          const rate = Number(item.gstRate ?? 0);
          return {
            num: idx + 1,
            itm_det: {
              txval: taxval,
              rt: rate,
              camt: interstate ? 0 : round2(gst / 2),
              samt: interstate ? 0 : round2(gst / 2),
              iamt: interstate ? gst : 0,
              csamt: 0,
            },
          };
        }),
      });
    }

    const b2csTax = Number(b2csSales[0]?.taxTotal ?? 0);
    const b2csJson = [
      {
        sply_ty: 'INTRA',
        rt: 18,
        pos: '33',
        txval: Number(b2csSales[0]?.subtotal ?? 0),
        camt: round2(b2csTax / 2),
        samt: round2(b2csTax / 2),
        iamt: 0,
        csamt: 0,
      },
    ];

    const hsnJson = {
      data: hsnSummary.map((row, idx) => {
        const gst = Number(row.totalGst ?? 0);
        return {
          num: idx + 1,
          hsn_sc: row.hsnCode ?? '',
          desc: row.productName ?? '',
          uqc: 'NOS',
          qty: Number(row.totalQty ?? 0),
          val: Number(row.totalValue ?? 0),
          txval: Number(row.taxableValue ?? 0),
          iamt: 0,
          camt: round2(gst / 2),
          samt: round2(gst / 2),
          csamt: 0,
        };
      }),
    };

    // Fiscal period: MMYYYY
    const [fyStart] = params.financialYear.split('-');
    const fp = `04${fyStart}`;

    const payload = {
      gstin: bizGstin,
      fp,
      b2b: Object.values(b2bMap),
      b2cs: b2csJson,
      hsn: hsnJson,
    };

    const json = JSON.stringify(payload, null, 2);
    const filename = `GSTR1_${params.financialYear.replace('-', '_')}.json`;

    return {
      data: Buffer.from(json).toString('base64'),
      filename,
      mimeType: 'application/json',
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
