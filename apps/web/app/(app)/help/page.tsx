import { getPublicContact } from '@/lib/public-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import Link from 'next/link';

export default function HelpPage() {
  const contact = getPublicContact();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Help &amp; Support</h1>
        <p className="text-sm text-muted-foreground">Get help with MyBizOne</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
          <CardDescription>Common tasks to get you started</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <p className="font-medium">1. Set up your store</p>
            <p className="text-muted-foreground">
              Go to Settings → Stores and create at least one store before adding products.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">2. Add categories</p>
            <p className="text-muted-foreground">
              Organise products with categories and sub-categories. Go to Inventory → Categories.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">3. Add products</p>
            <p className="text-muted-foreground">
              Go to Inventory → Products and click &quot;New product&quot;.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">4. Create a sale</p>
            <p className="text-muted-foreground">
              Go to Billing → New Sale (POS) to make a sale and generate a bill.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Support</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <Link href="/guide" className="underline">
            Read the getting started guide
          </Link>
          {contact.email ? (
            <p>
              <a href={`mailto:${contact.email}`} className="underline">
                {contact.email}
              </a>
            </p>
          ) : (
            <p className="text-muted-foreground">
              Contact your business administrator or the person who supplied your installation.
            </p>
          )}
          {contact.whatsappUrl && (
            <p>
              <a href={contact.whatsappUrl} className="underline">
                WhatsApp support
              </a>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
