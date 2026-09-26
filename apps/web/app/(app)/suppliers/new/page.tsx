import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { SupplierForm } from '../_components/supplier-form';

export default async function NewSupplierPage() {
  const user = await requireUser();
  await requirePermission(user, 'manage_suppliers');
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">New supplier</h1>
      <SupplierForm mode="create" />
    </div>
  );
}
