import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { NewStoreForm } from './form';

export default async function NewStorePage() {
  const user = await requireUser();
  await requirePermission(user, 'manage_stores');
  return (
    <div className="mx-auto max-w-md">
      <NewStoreForm />
    </div>
  );
}
