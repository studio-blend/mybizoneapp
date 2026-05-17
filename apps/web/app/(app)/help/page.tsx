import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';

export default function HelpPage() {
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
            <p className="text-muted-foreground">Go to Settings → Stores and create at least one store before adding products.</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">2. Add categories</p>
            <p className="text-muted-foreground">Organise products with categories and sub-categories. Go to Inventory → Categories.</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">3. Add products</p>
            <p className="text-muted-foreground">Go to Inventory → Products and click &quot;New product&quot;.</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">4. Create a sale</p>
            <p className="text-muted-foreground">Go to Billing → New Sale (POS) to make a sale and generate a bill.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Support</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p className="text-muted-foreground">For issues or questions, reach out to our support team.</p>
          <p>
            Email:{' '}
            <a href="mailto:support@mybizone.com" className="underline underline-offset-4 hover:text-primary">
              support@mybizone.com
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
