import { getPublicContact } from '@/lib/public-config';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const features = [
  [
    'Billing at the counter',
    'Create bills, record cash or digital payments, and keep your sales history in one place.',
  ],
  [
    'Stock across your stores',
    'Manage products, purchases, returns and damaged stock. Check stock levels before your next order.',
  ],
  [
    'Customers and accounts',
    'Track customer dues, supplier payments and expenses alongside your daily sales.',
  ],
];

export default function LandingPage() {
  const contact = getPublicContact();
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-14 px-4 py-8 sm:py-12">
      <header className="flex items-center justify-between gap-4">
        <span className="text-lg font-semibold">MyBizOne</span>
        <nav aria-label="Main navigation" className="flex gap-4 text-sm">
          <Link href="/guide" className="underline underline-offset-4">
            Getting started
          </Link>
          <Link href="/login" className="underline underline-offset-4">
            Log in
          </Link>
        </nav>
      </header>
      <section className="space-y-6 py-6 text-center sm:py-12">
        <p className="text-sm font-medium text-muted-foreground">For Indian retail businesses</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">MyBizOne</h1>
        <p className="mx-auto max-w-2xl text-xl">Your sales, stock and accounts. Together.</p>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Keep everyday shop work organised, from the first purchase to the last bill of the day.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">Get started</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/guide">Explore the workflow</Link>
          </Button>
        </div>
      </section>
      <section aria-label="Features" className="grid gap-4 md:grid-cols-3">
        {features.map(([title, body]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
          </Card>
        ))}
      </section>
      <section className="space-y-5">
        <h2 className="text-center text-2xl font-semibold">Choose how your shop runs</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Cloud</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Use your browser on a computer or phone. An internet connection is required.</p>
              <p className="text-muted-foreground">
                Start with one store, up to 500 products and one user. Paid plans are available when
                enabled by your provider.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Windows desktop</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Run the application and database on a shop PC, with access from devices on your
                local network.
              </p>
              <p className="text-muted-foreground">
                Local billing uses the shop PC. Online payments, email and connected services
                require internet. Keep a separate backup of your shop data.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} MyBizOne</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/guide" className="underline">
            Help
          </Link>
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="underline">
              Email support
            </a>
          )}
          {contact.whatsappUrl && (
            <a href={contact.whatsappUrl} className="underline">
              WhatsApp support
            </a>
          )}
        </div>
      </footer>
    </main>
  );
}
