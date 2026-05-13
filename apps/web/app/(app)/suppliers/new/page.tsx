import { SupplierForm } from '../_components/supplier-form';

export default function NewSupplierPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">New supplier</h1>
      <SupplierForm mode="create" />
    </div>
  );
}
