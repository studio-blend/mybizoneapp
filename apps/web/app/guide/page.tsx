import { getPublicContact } from '@/lib/public-config';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const steps = [
  [
    'Set up your business',
    'Create your owner account and complete the business setup. Add your store before creating products. For a desktop installation, complete the first-run setup on the shop PC.',
  ],
  [
    'Build your catalogue',
    'Add categories and brands, then products with selling prices, units and opening stock. Check these values before making your first sale.',
  ],
  [
    'Record a purchase',
    'Add a supplier and enter the items received. A purchase increases stock; supplier payments can be recorded separately when settling dues.',
  ],
  [
    'Make your first sale',
    'Open New Sale, choose the store and add products. Review quantities, discounts, customer and payment details before saving. Open the saved sale to view its invoice.',
  ],
  [
    'Handle a return',
    'Use the original bill number to identify a sale or purchase return. The return uses the original item values and cannot exceed the remaining returnable quantity.',
  ],
  [
    'Close the day',
    'Review sales, payments, outstanding balances and stock reports. For a desktop installation, confirm the backup completed and copy backups and uploaded files to a separate device.',
  ],
];

export default function GuidePage() {
  const contact = getPublicContact();
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <Link href="/" className="text-sm underline">
        MyBizOne home
      </Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Getting started</h1>
        <p className="text-muted-foreground">A practical first-day checklist for your shop.</p>
      </header>
      <ol className="space-y-6">
        {steps.map(([title, body], index) => (
          <li key={title} className="rounded-lg border p-5">
            <h2 className="font-semibold">
              {index + 1}. {title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Before inviting your staff</h2>
        <p className="text-sm text-muted-foreground">
          Assign only the roles and stores each employee needs. Employees should use their own
          accounts and change temporary passwords at first login.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Need help?</h2>
        {contact.email ? (
          <p>
            <a className="underline" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Contact the person who supplied your installation or your business administrator.
          </p>
        )}
        {contact.whatsappUrl && (
          <a className="inline-block underline" href={contact.whatsappUrl}>
            Contact support on WhatsApp
          </a>
        )}
      </section>
    </main>
  );
}
