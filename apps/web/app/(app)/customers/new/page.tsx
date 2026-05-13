import { CustomerForm } from '../_components/customer-form';

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">New customer</h1>
      <CustomerForm mode="create" />
    </div>
  );
}
