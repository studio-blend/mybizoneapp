'use server';

import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { businesses, customers, eInvoices, saleItems, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { env } from '@/lib/env';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const generateSchema = z.object({ saleId: z.string().uuid() });
const cancelSchema = z.object({
  eInvoiceId: z.string().uuid(),
  reason: z.string().min(1),
});

function isSandbox(): boolean {
  return env.GSTN_SANDBOX === 'true' || !env.GSTN_CLIENT_ID;
}

export async function generateIrnAction(
  rawData: z.infer<typeof generateSchema>,
): Promise<{ irn: string; ackNo: string; qrCode: string | null } | { error: string }> {
  try {
    const user = await requireUser();
    const { saleId } = generateSchema.parse(rawData);

    const result = await withTenant(db, user.businessId, async (tx) => {
      // Check if already generated
      const existing = await tx
        .select({ id: eInvoices.id, status: eInvoices.status, irn: eInvoices.irn })
        .from(eInvoices)
        .where(and(eq(eInvoices.saleId, saleId), eq(eInvoices.status, 'generated')));

      if (existing.length > 0) {
        throw new Error(`IRN already generated: ${existing[0]?.irn ?? ''}`);
      }

      // Fetch sale details
      const saleRows = await tx
        .select({
          id: sales.id,
          billNo: sales.billNo,
          total: sales.total,
          subtotal: sales.subtotal,
          taxTotal: sales.taxTotal,
          customerGstin: sales.customerGstin,
          customerName: sales.customerName,
          createdAt: sales.createdAt,
          businessId: sales.businessId,
        })
        .from(sales)
        .where(eq(sales.id, saleId));

      if (!saleRows.length || !saleRows[0]) throw new Error('Sale not found');
      const sale = saleRows[0];

      const bizRows = await tx
        .select({ gstin: businesses.gstin, name: businesses.name })
        .from(businesses)
        .where(eq(businesses.id, user.businessId));
      const biz = bizRows[0];

      const itemRows = await tx
        .select({
          productName: saleItems.productName,
          hsnCode: saleItems.hsnCode,
          qty: saleItems.qty,
          unitPrice: saleItems.unitPrice,
          gstRate: saleItems.gstRate,
          gstAmount: saleItems.gstAmount,
          lineTotal: saleItems.lineTotal,
        })
        .from(saleItems)
        .where(eq(saleItems.saleId, saleId));

      let irn: string;
      let ackNo: string;
      let signedQrCode: string | null = null;

      if (isSandbox()) {
        // Mock response
        irn = `MOCK_IRN_${saleId.replace(/-/g, '').slice(0, 32)}`;
        ackNo = `MOCK_ACK_${Date.now()}`;
        signedQrCode = null;
      } else {
        // Real GSTN IRP API call
        const payload = {
          Version: '1.1',
          TranDtls: {
            TaxSch: 'GST',
            SupTyp: 'B2B',
            RegRev: 'N',
          },
          DocDtls: {
            Typ: 'INV',
            No: sale.billNo,
            Dt: sale.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
          },
          SellerDtls: {
            Gstin: biz?.gstin ?? '',
            TrdNm: biz?.name ?? '',
            Addr1: 'India',
            Loc: 'India',
            Pin: 600001,
            Stcd: biz?.gstin?.slice(0, 2) ?? '33',
          },
          BuyerDtls: {
            Gstin: sale.customerGstin ?? 'URP',
            TrdNm: sale.customerName ?? 'Consumer',
            Pos: '33',
            Addr1: 'India',
            Loc: 'India',
            Pin: 600001,
            Stcd: sale.customerGstin?.slice(0, 2) ?? '33',
          },
          ItemList: itemRows.map((item, idx) => ({
            SlNo: String(idx + 1),
            PrdDesc: item.productName,
            IsServc: 'N',
            HsnCd: item.hsnCode ?? '0000',
            Qty: Number(item.qty),
            Unit: 'NOS',
            UnitPrice: Number(item.unitPrice),
            TotAmt: Number(item.lineTotal),
            Discount: 0,
            PreTaxVal: Number(item.lineTotal) - Number(item.gstAmount),
            AssAmt: Number(item.lineTotal) - Number(item.gstAmount),
            GstRt: Number(item.gstRate ?? 0),
            IgstAmt: 0,
            CgstAmt: Number(item.gstAmount) / 2,
            SgstAmt: Number(item.gstAmount) / 2,
            CesRt: 0,
            CesAmt: 0,
            CesNonAdvlAmt: 0,
            StateCesRt: 0,
            StateCesAmt: 0,
            StateCesNonAdvlAmt: 0,
            OthChrg: 0,
            TotItemVal: Number(item.lineTotal),
          })),
          ValDtls: {
            AssVal: Number(sale.subtotal),
            CgstVal: Number(sale.taxTotal) / 2,
            SgstVal: Number(sale.taxTotal) / 2,
            IgstVal: 0,
            CesVal: 0,
            StCesVal: 0,
            Discount: 0,
            OthChrg: 0,
            RndOffAmt: 0,
            TotInvVal: Number(sale.total),
          },
        };

        const resp = await fetch('https://einv-apisandbox.nic.in/eicore/v1.03/Invoice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            user_name: env.GSTN_USERNAME ?? '',
            'e-invoice-api-secret': env.GSTN_CLIENT_SECRET ?? '',
            RequestId: `${Date.now()}`,
            version: '1.1',
            gstin: biz?.gstin ?? '',
          },
          body: JSON.stringify(payload),
        });

        const respJson = await resp.json() as { Status: number; Data?: { Irn: string; AckNo: string; SignedQRCode?: string }; ErrorDetails?: unknown[] };
        if (respJson.Status !== 1 || !respJson.Data) {
          throw new Error(`GSTN API error: ${JSON.stringify(respJson.ErrorDetails ?? respJson)}`);
        }
        irn = respJson.Data.Irn;
        ackNo = respJson.Data.AckNo;
        signedQrCode = respJson.Data.SignedQRCode ?? null;
      }

      // Upsert e_invoice record
      await tx
        .insert(eInvoices)
        .values({
          businessId: user.businessId,
          saleId,
          irn,
          ackNo,
          signedQrCode,
          status: 'generated',
        })
        .onConflictDoUpdate({
          target: eInvoices.irn,
          set: { ackNo, signedQrCode, status: 'generated', updatedAt: new Date() },
        });

      return { irn, ackNo, qrCode: signedQrCode };
    });

    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function cancelIrnAction(
  rawData: z.infer<typeof cancelSchema>,
): Promise<{ success: true } | { error: string }> {
  try {
    const user = await requireUser();
    const { eInvoiceId, reason } = cancelSchema.parse(rawData);

    await withTenant(db, user.businessId, async (tx) => {
      const rows = await tx
        .select({ id: eInvoices.id, irn: eInvoices.irn, status: eInvoices.status })
        .from(eInvoices)
        .where(and(eq(eInvoices.id, eInvoiceId), eq(eInvoices.businessId, user.businessId)));

      if (!rows.length || !rows[0]) throw new Error('E-invoice record not found');
      const inv = rows[0];
      if (inv.status === 'cancelled') throw new Error('IRN already cancelled');

      if (!isSandbox() && inv.irn && !inv.irn.startsWith('MOCK_')) {
        const bizRows = await tx
          .select({ gstin: businesses.gstin })
          .from(businesses)
          .where(eq(businesses.id, user.businessId));

        await fetch('https://einv-apisandbox.nic.in/eicore/v1.03/Invoice/Cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            user_name: env.GSTN_USERNAME ?? '',
            'e-invoice-api-secret': env.GSTN_CLIENT_SECRET ?? '',
            RequestId: `${Date.now()}`,
            version: '1.1',
            gstin: bizRows[0]?.gstin ?? '',
          },
          body: JSON.stringify({ Irn: inv.irn, CnlRsn: '1', CnlRem: reason }),
        });
      }

      await tx
        .update(eInvoices)
        .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: reason, updatedAt: new Date() })
        .where(eq(eInvoices.id, eInvoiceId));
    });

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
