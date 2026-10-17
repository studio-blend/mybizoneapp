'use client';
import { type PackOption, convertPack } from '@/lib/pack-policy';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
export interface PackSelection {
  packId: string;
  packCount: string;
  looseQty: string;
}
export function PackQuantityFields({
  id,
  productId,
  unit,
  packs,
  value,
  onChange,
}: {
  id: string;
  productId: string;
  unit: string;
  packs: PackOption[];
  value: PackSelection;
  onChange: (patch: PackSelection & { qty?: string }) => void;
}) {
  const options = packs.filter((p) => p.productId === productId);
  if (!options.length) return null;
  const selected = options.find((p) => p.id === value.packId);
  function change(patch: Partial<PackSelection>) {
    const next = {
      packId: value.packId,
      packCount: value.packCount,
      looseQty: value.looseQty,
      ...patch,
    };
    const pack = options.find((p) => p.id === next.packId);
    let qty = '1';
    if (pack) {
      try {
        qty = convertPack(pack, next.packCount, next.looseQty).qty;
      } catch {
        qty = '0';
      }
    }
    onChange({ ...next, qty });
  }
  let converted: string | null = null;
  if (selected) {
    try {
      converted = convertPack(selected, value.packCount, value.looseQty).qty;
    } catch {}
  }
  return (
    <div className="min-w-0 space-y-3 rounded-md border p-3">
      <div className="space-y-2">
        <Label htmlFor={`${id}-pack`}>Pack (optional)</Label>
        <Select
          id={`${id}-pack`}
          value={value.packId}
          onChange={(e) => change({ packId: e.target.value, packCount: '1', looseQty: '0' })}
        >
          <option value="">Loose / base units</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.qtyPerPack} {unit}
            </option>
          ))}
        </Select>
      </div>
      {selected && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${id}-packs`}>Number of packs</Label>
              <Input
                id={`${id}-packs`}
                type="number"
                min="0"
                step="1"
                value={value.packCount}
                onChange={(e) => change({ packCount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-loose`}>Loose quantity ({unit})</Label>
              <Input
                id={`${id}-loose`}
                type="number"
                min="0"
                step={selected.unitType === 'piece' ? 1 : 0.001}
                value={value.looseQty}
                onChange={(e) => change({ looseQty: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {converted
              ? `Stock quantity: ${converted} ${unit}. Prices are per ${unit}; pack counts do not change the pricing unit.`
              : 'Enter whole pack counts and a valid loose quantity.'}
          </p>
        </>
      )}
    </div>
  );
}
