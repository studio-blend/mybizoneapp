import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { CustomerForm } from '../_components/customer-form';

export default async function NewCustomerPage() {
  const user = await requireUser();
  await requirePermission(user, 'manage_customers');
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">New customer</h1>
      <CustomerForm mode="create" />
    </div>
  );
}
