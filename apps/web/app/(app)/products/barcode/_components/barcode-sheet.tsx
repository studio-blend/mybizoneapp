'use client';

import { useState } from 'react';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent } from '@mybizone/ui/card';

interface ProductRow {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  mrp: string | null;
  price: string;
}

interface Props {
  products: ProductRow[];
}

export function BarcodeSheet({ products }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copies, setCopies] = useState(1);

  function toggleAll() {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map(p => p.id)));
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Build the barcode value: use barcode field if set, else SKU, else the product ID short form
  function barcodeValue(p: ProductRow): string {
    return p.barcode ?? p.sku ?? p.id.slice(0, 8).toUpperCase();
  }

  function printLabels() {
    const toPrint = products.filter(p => selected.has(p.id));
    if (toPrint.length === 0) { alert('Select at least one product'); return; }

    // Generate a print window with barcode SVGs using JsBarcode from CDN
    const labelsHtml = Array.from({ length: copies }).flatMap(() =>
      toPrint.map(p => `
        <div class="label">
          <svg class="barcode" data-barcode="${barcodeValue(p)}"></svg>
          <div class="name">${p.name}</div>
          <div class="price">₹ ${p.mrp ?? p.price}</div>
        </div>
      `)
    ).join('');

    const html = `<!DOCTYPE html><html><head>
      <title>Barcode Labels</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      <style>
        @media print { @page { margin: 10mm; } }
        body { font-family: sans-serif; }
        .sheet { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; }
        .label { border: 1px solid #ccc; padding: 8px; width: 180px; text-align: center; break-inside: avoid; }
        .barcode { width: 160px; height: 60px; }
        .name { font-size: 11px; margin-top: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .price { font-size: 13px; font-weight: bold; }
      </style>
    </head><body>
      <div class="sheet">${labelsHtml}</div>
      <script>
        window.onload = function() {
          document.querySelectorAll('.barcode').forEach(function(el) {
            JsBarcode(el, el.getAttribute('data-barcode'), { format: 'CODE128', displayValue: true, fontSize: 10, height: 40 });
          });
          setTimeout(function() { window.print(); }, 500);
        };
      <\/script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={toggleAll}>
          {selected.size === products.length ? 'Deselect all' : 'Select all'}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          Copies:
          <input
            type="number"
            min={1}
            max={10}
            value={copies}
            onChange={e => setCopies(Number(e.target.value))}
            className="w-16 rounded border px-2 py-1 text-sm"
          />
        </label>
        <Button onClick={printLabels} disabled={selected.size === 0}>
          Print {selected.size} label{selected.size !== 1 ? 's' : ''}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map(p => (
          <Card
            key={p.id}
            className={`cursor-pointer transition-colors ${selected.has(p.id) ? 'ring-2 ring-primary' : ''}`}
            onClick={() => toggle(p.id)}
          >
            <CardContent className="p-3">
              <p className="truncate font-medium text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                Barcode: {barcodeValue(p)} · ₹ {p.mrp ?? p.price}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
