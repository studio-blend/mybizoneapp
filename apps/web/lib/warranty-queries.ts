import { type Database, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { eq, sql } from 'drizzle-orm';
import type { DashboardGrant } from './dashboard-policy';
import { serialCode } from './serial-policy';
import { indiaToday } from './stock-batch-policy';

export interface WarrantyRow extends Record<string, unknown> {
  id: string;
  code: string;
  product: string;
  store: string;
  saleId: string;
  billNo: string;
  soldAt: string;
  customer: string | null;
  months: number;
  endsOn: string | null;
  issuer: string | null;
  returned: boolean;
}
export async function loadWarranties(
  db: Database,
  businessId: string,
  roles: DashboardGrant[],
  search = '',
  page = 1,
) {
  let code: string | undefined;
  if (search.trim()) code = serialCode(search);
  return withTenant(db, businessId, async (tx) => {
    const catalog = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.businessId, businessId));
    const allowed = catalog
      .filter((store) => hasPermission(roles, 'view_sales', { storeId: store.id }))
      .map((store) => store.id);
    if (!allowed.length) throw new Error('Permission denied');
    const predicate = sql`e.business_id=${businessId}::uuid AND e.kind='sale' AND s.business_id=e.business_id
      AND s.status='completed' AND s.bill_type<>'estimate'
      AND s.store_id=p.store_id AND p.store_id IN (${sql.join(
        allowed.map((id) => sql`${id}::uuid`),
        sql`,`,
      )})
      ${code ? sql`AND u.code=${code}` : sql``}`;
    const rows = await tx.execute<WarrantyRow>(sql`SELECT e.id,u.code,
      COALESCE((SELECT max(si.product_name) FROM sale_items si WHERE si.sale_id=s.id AND si.business_id=e.business_id AND si.product_id=p.id),p.name) AS product,
      st.name AS store,s.id AS "saleId",s.bill_no AS "billNo",s.created_at::text AS "soldAt",s.customer_name AS customer,
      e.warranty_months AS months,e.warranty_ends_on::text AS "endsOn",e.warranty_issuer AS issuer,
      EXISTS(SELECT 1 FROM stock_serial_events r WHERE r.business_id=e.business_id AND r.serial_id=e.serial_id AND r.kind='sales_return' AND r.related_sale_id=s.id) AS returned
      FROM stock_serial_events e JOIN stock_serials u ON u.id=e.serial_id AND u.business_id=e.business_id
      JOIN products p ON p.id=u.product_id AND p.business_id=u.business_id
      JOIN sales s ON s.id=e.document_id JOIN stores st ON st.id=p.store_id AND st.business_id=p.business_id
      WHERE ${predicate} ORDER BY e.created_at DESC,e.id DESC LIMIT 50 OFFSET ${(Math.max(1, Math.min(10000, page)) - 1) * 50}`);
    return { rows: Array.from(rows), today: indiaToday(), page };
  });
}
