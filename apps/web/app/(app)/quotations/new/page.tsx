import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { customers, products } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import { QuotationForm } from '../_components/quotation-form';

export const dynamic = 'force-dynamic';

export default async function NewQuotationPage() {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const ps = await tx
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        unitSymbol: products.unitSymbol,
      })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
      .orderBy(asc(products.name));

    const cs = await tx
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
      })
      .from(customers)
      .where(eq(customers.businessId, user.businessId))
      .orderBy(asc(customers.name));

    return { products: ps, customers: cs };
  });

  return (
    <div className="mx-auto max-w-2xl">
      <QuotationForm products={data.products} customers={data.customers} />
    </div>
  );
}
