import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import Link from 'next/link';

const FEATURES = [
  {
    title: 'POS that fits your shop',
    body: 'Search-and-add products in one keystroke. Decimal qty for kg + metres. Atomic stock.',
  },
  {
    title: 'GST invoicing built in',
    body: 'CGST/SGST/IGST split per HSN code. PDF invoices with one click. Skip when not needed.',
  },
  {
    title: 'Inventory you can trust',
    body: 'Per-store stock, low-stock alerts, full audit log of every price + role change.',
  },
];

const PLANS = [
  {
    name: 'Self-hosted',
    price: '₹7,999 / store',
    sub: 'one-time license + ₹1,999/yr support',
    bullets: ['Runs on your shop PC', 'Data never leaves your premises', 'Works offline'],
    cta: 'Talk to us',
    href: 'https://wa.me/919999999999',
  },
  {
    name: 'Cloud (free)',
    price: '₹0',
    sub: 'free during early access',
    bullets: ['Hosted at mybizone.in', 'Mobile + desktop', 'Email support'],
    cta: 'Get started',
    href: '/signup',
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-16 px-4 py-12">
      <section className="flex flex-col items-center gap-6 pt-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">MyBizOne</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Inventory + POS + GST invoicing for Indian retail shops. Built for Bharat — works on your
          phone, hosts on your PC, and doesn't pretend to be from California.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/signup">Get started — free</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Questions? WhatsApp{' '}
          <a className="underline" href="https://wa.me/919999999999">
            +91 99999 99999
          </a>
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <CardHeader>
              <CardTitle className="text-lg">{f.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{f.body}</CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-center text-2xl font-semibold">Pick what fits</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PLANS.map((p) => (
            <Card key={p.name}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">{p.price}</span>
                  <span className="ml-2 text-xs">{p.sub}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {p.bullets.map((b) => (
                    <li key={b}>· {b}</li>
                  ))}
                </ul>
                <Button asChild className="w-full">
                  <a href={p.href}>{p.cta}</a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t pt-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MyBizOne · Made in India.
      </footer>
    </main>
  );
}
