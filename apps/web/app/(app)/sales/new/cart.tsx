'use client';

import { allowsFractionalQty, isUnitType } from '@mybizone/domain/catalog';
import { calculateSaleTotals } from '@mybizone/domain/sale';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { Textarea } from '@mybizone/ui/textarea';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createSaleAction, uploadSaleBillImageAction } from '../actions';

interface ProductOption {
  id: string;
  storeId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitSymbol: string;
  unitType: string;
  price: string;
  gstRate: string | null;
  inventory: string;
}

interface StoreOption {
  id: string;
  name: string;
}

interface CartLine {
  productId: string;
  qty: string;
}

interface Props {
  stores: StoreOption[];
  products: ProductOption[];
  gstEnabled: boolean;
  recentProductIds: string[];
}

export function PosCart({ stores, products, gstEnabled, recentProductIds }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'other'>('cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [isInterstate, setIsInterstate] = useState(false);
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const productsByStore = useMemo(
    () => products.filter((p) => p.storeId === storeId),
    [products, storeId],
  );
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const recentProducts = useMemo(
    () =>
      recentProductIds
        .map((id) => productById.get(id))
        .filter((p): p is ProductOption => p !== undefined && p.storeId === storeId),
    [recentProductIds, productById, storeId],
  );

  // Search filter — matches name, sku, or barcode (case-insensitive substring).
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return productsByStore
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false) ||
          (p.barcode?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8);
  }, [search, productsByStore]);

  // Live totals via the same domain calculator the server uses.
  const totals = useMemo(() => {
    if (lines.length === 0) return null;
    try {
      return calculateSaleTotals({
        gstEnabled,
        isInterstate,
        discount: Number(discount) || 0,
        lines: lines.map((l) => {
          const p = productById.get(l.productId);
          if (!p) throw new Error('product missing');
          return {
            qty: Number(l.qty) || 0,
            unitPrice: Number(p.price),
            gstRate: p.gstRate ? Number(p.gstRate) : null,
          };
        }),
      });
    } catch {
      return null;
    }
  }, [lines, discount, gstEnabled, isInterstate, productById]);

  function addLine(productId: string) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === productId ? { ...l, qty: bumpQty(l.qty, productId) } : l,
        );
      }
      return [...prev, { productId, qty: defaultQty(productId) }];
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function defaultQty(productId: string): string {
    const p = productById.get(productId);
    if (!p) return '1';
    if (isUnitType(p.unitType) && allowsFractionalQty(p.unitType)) return '1';
    return '1';
  }

  function bumpQty(qty: string, productId: string): string {
    const p = productById.get(productId);
    const n = Number(qty) || 0;
    if (p && isUnitType(p.unitType) && allowsFractionalQty(p.unitType)) {
      return (n + 1).toString();
    }
    return (n + 1).toString();
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function setQty(productId: string, qty: string) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty } : l)));
  }

  // Global keyboard shortcuts: '/' focuses search, F2 submits.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'F2') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (lines.length === 0) {
      setError('Add at least one product');
      return;
    }
    setPending(true);
    const result = await createSaleAction({
      storeId,
      customerName,
      customerPhone,
      customerGstin,
      paymentMethod,
      discount: discount || '0',
      notes,
      isInterstate,
      lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const saleId = result.data.id;
    toast({
      title: `Sale ${result.data.billNo} recorded`,
      description: `Total ₹${result.data.total}`,
    });
    router.push('/sales');
    router.refresh();

    if (billFile) {
      const upFd = new FormData();
      upFd.set('id', saleId);
      upFd.set('file', billFile);
      uploadSaleBillImageAction(upFd).then((upResult) => {
        if (!upResult.ok) {
          toast({
            title: 'Bill image upload failed',
            description: upResult.error,
            variant: 'destructive',
          });
        }
      });
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>New sale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="storeId">Store</Label>
                <Select
                  id="storeId"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  required
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              {recentProducts.length > 0 && (
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Recent</p>
                  <div className="flex flex-wrap gap-2">
                    {recentProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addLine(p.id)}
                        className="rounded-full border bg-muted px-3 py-1 text-xs hover:bg-accent"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="search">
                  Add product (press <kbd className="rounded border px-1">/</kbd>)
                </Label>
                <Input
                  ref={searchRef}
                  id="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches.length > 0 && matches[0]) {
                      e.preventDefault();
                      addLine(matches[0].id);
                    }
                  }}
                  placeholder="Name, SKU, or barcode"
                  autoComplete="off"
                />
                {search && matches.length > 0 && (
                  <ul className="mt-1 max-h-56 overflow-y-auto rounded-md border bg-background shadow-sm">
                    {matches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => addLine(p.id)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span>
                            {p.name}
                            {p.sku && (
                              <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            ₹{p.price} / {p.unitSymbol} · stock {p.inventory}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-32 text-right">Qty</TableHead>
                  <TableHead className="w-28 text-right">Price</TableHead>
                  <TableHead className="w-28 text-right">Subtotal</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Cart empty. Search above or press <kbd className="rounded border px-1">/</kbd>
                      .
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((l) => {
                    const p = productById.get(l.productId);
                    if (!p) return null;
                    const subtotal = (Number(p.price) * (Number(l.qty) || 0)).toFixed(2);
                    return (
                      <TableRow key={l.productId}>
                        <TableCell>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.unitSymbol} · stock {p.inventory}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            value={l.qty}
                            onChange={(e) => setQty(l.productId, e.target.value)}
                            inputMode="decimal"
                            className="w-24 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">{p.price}</TableCell>
                        <TableCell className="text-right">{subtotal}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(l.productId)}
                          >
                            ×
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer + notes (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer name</Label>
                <Input
                  id="customerName"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
              {gstEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="customerGstin">Customer GSTIN</Label>
                  <Input
                    id="customerGstin"
                    value={customerGstin}
                    onChange={(e) => setCustomerGstin(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-4 lg:self-start">
        <CardHeader>
          <CardTitle>Bill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Row label="Subtotal" value={totals?.subtotal.toFixed(2) ?? '—'} />
          <div className="space-y-2">
            <Label htmlFor="discount">Discount (₹)</Label>
            <Input
              id="discount"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              inputMode="decimal"
            />
          </div>
          {gstEnabled && (
            <>
              <Row label="Taxable" value={totals?.taxableAmount.toFixed(2) ?? '—'} />
              {isInterstate ? (
                <Row label="IGST" value={totals?.igst.toFixed(2) ?? '—'} />
              ) : (
                <>
                  <Row label="CGST" value={totals?.cgst.toFixed(2) ?? '—'} />
                  <Row label="SGST" value={totals?.sgst.toFixed(2) ?? '—'} />
                </>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isInterstate}
                  onChange={(e) => setIsInterstate(e.target.checked)}
                />
                Interstate sale (IGST)
              </label>
            </>
          )}
          <div className="border-t pt-3 text-base font-semibold">
            <Row label="Total" value={totals?.total.toFixed(2) ?? '—'} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="billImage">Bill image (optional)</Label>
            <Input
              id="billImage"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setBillFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment</Label>
            <Select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'cash' || v === 'upi' || v === 'card' || v === 'other') {
                  setPaymentMethod(v);
                }
              }}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending || lines.length === 0}>
            {pending ? 'Saving…' : 'Save bill (F2)'}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
