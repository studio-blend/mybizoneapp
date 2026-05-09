'use client';

import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mybizone-tour-dismissed';

interface Step {
  label: string;
  done: boolean;
  href: string;
  cta: string;
}

interface Props {
  hasProducts: boolean;
  hasSales: boolean;
  hasInvoices: boolean;
}

export function GuidedTour({ hasProducts, hasSales, hasInvoices }: Props) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  const steps: Step[] = [
    { label: 'Add your first product', done: hasProducts, href: '/products/new', cta: 'Add product' },
    { label: 'Record your first sale', done: hasSales, href: '/sales/new', cta: 'New sale' },
    { label: 'Generate your first GST invoice', done: hasInvoices, href: '/invoices/new', cta: 'New invoice' },
  ];

  const allDone = steps.every((s) => s.done);

  if (dismissed || allDone) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Get started — 3 quick steps</CardTitle>
        <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground">
          Dismiss
        </Button>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={step.href} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  step.done
                    ? 'bg-green-100 text-green-700'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step.done ? '✓' : i + 1}
              </span>
              <span className={step.done ? 'line-through text-muted-foreground' : ''}>
                {step.label}
              </span>
              {!step.done && (
                <Button asChild size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs">
                  <Link href={step.href}>{step.cta}</Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
