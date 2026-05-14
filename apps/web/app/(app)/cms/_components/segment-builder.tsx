'use client';

import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { getSegmentAction, type SegmentCustomer, type SegmentFilters } from '../actions';

const ALL_TAGS = ['VIP', 'Wholesale', 'Inactive', 'Regular', 'Bulk Buyer', 'Credit Risk', 'New Customer'];

export function SegmentBuilder() {
  const [lastPurchaseDays, setLastPurchaseDays] = useState('');
  const [outstandingMin, setOutstandingMin] = useState('');
  const [lifetimeValueMin, setLifetimeValueMin] = useState('');
  const [rateCategory, setRateCategory] = useState('');
  const [hasPhone, setHasPhone] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [results, setResults] = useState<SegmentCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function applyFilters() {
    const f: SegmentFilters = {
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      lastPurchaseDays: (lastPurchaseDays || undefined) as SegmentFilters['lastPurchaseDays'],
      outstandingMin: outstandingMin || undefined,
      lifetimeValueMin: lifetimeValueMin || undefined,
      rateCategory: (rateCategory || undefined) as SegmentFilters['rateCategory'],
      hasPhone: (hasPhone || undefined) as SegmentFilters['hasPhone'],
    };
    setError(null);
    startTransition(async () => {
      const res = await getSegmentAction(f);
      if (res.ok) setResults(res.data);
      else setError(res.error);
    });
  }

  function clearFilters() {
    setLastPurchaseDays('');
    setOutstandingMin('');
    setLifetimeValueMin('');
    setRateCategory('');
    setHasPhone('');
    setSelectedTags([]);
    setResults(null);
    setError(null);
  }

  const selectedIds = results?.map((r) => r.id) ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Segment Builder</CardTitle>
          <CardDescription>
            Filter customers by tags, purchase history, balance, and more. All filters are AND logic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-background text-foreground hover:bg-muted border-input'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="last-purchase">Last purchase</Label>
              <Select
                id="last-purchase"
                value={lastPurchaseDays}
                onChange={(e) => setLastPurchaseDays(e.target.value)}
              >
                <option value="">Any time</option>
                <option value="7">Within 7 days</option>
                <option value="30">Within 30 days</option>
                <option value="60">Within 60 days</option>
                <option value="90">Within 90 days</option>
                <option value="never">Never purchased</option>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="outstanding-min">Outstanding greater than ₹</Label>
              <Input
                id="outstanding-min"
                type="number"
                min={0}
                placeholder="0"
                value={outstandingMin}
                onChange={(e) => setOutstandingMin(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="ltv-min">Lifetime value greater than ₹</Label>
              <Input
                id="ltv-min"
                type="number"
                min={0}
                placeholder="0"
                value={lifetimeValueMin}
                onChange={(e) => setLifetimeValueMin(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rate-cat">Rate category</Label>
              <Select
                id="rate-cat"
                value={rateCategory}
                onChange={(e) => setRateCategory(e.target.value)}
              >
                <option value="">Any rate</option>
                {['retail', 'wholesale', 'mrp', 'dealer', 'rate1', 'rate2', 'rate3', 'rate4'].map(
                  (r) => (
                    <option key={r} value={r} className="capitalize">
                      {r}
                    </option>
                  ),
                )}
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="has-phone">Has phone number</Label>
              <Select
                id="has-phone"
                value={hasPhone}
                onChange={(e) => setHasPhone(e.target.value)}
              >
                <option value="">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={applyFilters} disabled={isPending}>
              {isPending ? 'Searching...' : 'Apply filters'}
            </Button>
            <Button variant="outline" onClick={clearFilters} disabled={isPending}>
              Clear
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {results !== null && (
        <Card>
          <CardHeader>
            <CardTitle>
              Segment result — {results.length} customer{results.length !== 1 ? 's' : ''}
            </CardTitle>
            <CardDescription>Matching customers based on your filters.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {results.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No customers match these filters.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Last Purchase</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Lifetime Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <Link href={`/customers/${c.id}`} className="hover:underline">
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.phone ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-muted px-2 py-0.5 text-xs"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.lastPurchaseAt
                          ? new Date(c.lastPurchaseAt).toLocaleDateString('en-IN')
                          : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{Number(c.outstandingBalance).toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{Number(c.lifetimeValue).toLocaleString('en-IN')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {results !== null && results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Launch</CardTitle>
            <CardDescription>
              Send a WhatsApp message to all {results.length} customers in this segment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/cms/campaign?ids=${selectedIds.join(',')}`}>
                Compose campaign for {results.length} customer{results.length !== 1 ? 's' : ''}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
