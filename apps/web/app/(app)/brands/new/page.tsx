import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { BrandForm } from '../_components/brand-form';

export default async function NewBrandPage() {
  const user = await requireUser();
  await requirePermission(user, 'manage_products');
  return (
    <div className="mx-auto max-w-md">
      <BrandForm mode="create" />
    </div>
  );
}
