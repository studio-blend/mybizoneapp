'use client';

import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Textarea } from '@mybizone/ui/textarea';
import { useState, useTransition } from 'react';
import { launchCampaignAction, markCampaignSentAction } from '../../actions';

interface CustomerPreview {
  id: string;
  name: string;
  phone: string | null;
  outstandingBalance: string;
  lastPurchaseAt: string | null;
}

function renderPreview(
  template: string,
  customer: CustomerPreview,
  storeName: string,
): string {
  const lastPurchase = customer.lastPurchaseAt
    ? new Date(customer.lastPurchaseAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'N/A';
  return template
    .replace(/{name}/g, customer.name)
    .replace(/{last_purchase}/g, lastPurchase)
    .replace(
      /{balance}/g,
      `₹${Number(customer.outstandingBalance).toLocaleString('en-IN')}`,
    )
    .replace(/{store_name}/g, storeName);
}

export function CampaignComposer({
  customers,
  storeName,
}: {
  customers: CustomerPreview[];
  storeName: string;
}) {
  const [campaignName, setCampaignName] = useState('');
  const [template, setTemplate] = useState(
    `Hi {name},\n\nThank you for shopping at {store_name}.\n\nYour outstanding balance is {balance}.\n\nLast purchase: {last_purchase}\n\nWe look forward to seeing you again!`,
  );
  const [status, setStatus] = useState<'idle' | 'launching' | 'opening' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const preview3 = customers.slice(0, 3);

  async function handleLaunch() {
    if (!campaignName.trim()) {
      setError('Campaign name is required');
      return;
    }
    setError(null);
    setStatus('launching');

    const res = await launchCampaignAction({
      campaignName: campaignName.trim(),
      messageTemplate: template,
      customerIds: customers.map((c) => c.id),
      storeName,
    });

    if (!res.ok) {
      setError(res.error);
      setStatus('idle');
      return;
    }

    const { campaignId, recipients } = res.data;
    setStatus('opening');

    // Open WhatsApp for each recipient with 500ms delay
    let opened = 0;
    for (const r of recipients) {
      const url = `https://wa.me/${r.phone.replace(/\D/g, '')}?text=${encodeURIComponent(r.message)}`;
      window.open(url, '_blank');
      opened++;
      setProgress(Math.round((opened / recipients.length) * 100));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Mark sent
    await markCampaignSentAction({ campaignId, count: recipients.length });
    setStatus('done');
  }

  return (
    <div className="space-y-6">
      {/* Composer */}
      <Card>
        <CardHeader>
          <CardTitle>Compose campaign</CardTitle>
          <CardDescription>
            Recipients: {customers.length} customers ({customers.filter((c) => c.phone).length}{' '}
            with phone). Variables: <code className="text-xs">{'{name}'}</code>,{' '}
            <code className="text-xs">{'{last_purchase}'}</code>,{' '}
            <code className="text-xs">{'{balance}'}</code>,{' '}
            <code className="text-xs">{'{store_name}'}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input
              id="campaign-name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g. Diwali Offer 2026"
              maxLength={200}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="message">Message template</Label>
            <Textarea
              id="message"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={8}
              className="font-mono text-sm"
              maxLength={5000}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {status === 'idle' && (
            <Button onClick={handleLaunch} disabled={isPending}>
              Launch campaign — open WhatsApp for {customers.filter((c) => c.phone).length} customers
            </Button>
          )}
          {status === 'launching' && (
            <p className="text-sm text-muted-foreground">Creating campaign records...</p>
          )}
          {status === 'opening' && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Opening WhatsApp... {progress}%
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          {status === 'done' && (
            <p className="text-sm font-medium text-green-700">
              Campaign launched! Check your browser tabs for WhatsApp.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      {preview3.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Message preview</CardTitle>
            <CardDescription>First {preview3.length} customers with variables filled in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview3.map((c) => (
              <div key={c.id} className="rounded-md border p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {c.name} {c.phone ? `· ${c.phone}` : '(no phone)'}
                </p>
                <p className="whitespace-pre-wrap text-sm">
                  {renderPreview(template, c, storeName)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
