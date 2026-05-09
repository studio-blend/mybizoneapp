'use client';

import {
  UNIT_SYMBOLS_BY_TYPE,
  UNIT_TYPES,
  type UnitType,
  isUnitType,
} from '@mybizone/domain/catalog';
import { Button } from '@mybizone/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { Textarea } from '@mybizone/ui/textarea';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';
import { UpgradeAlert } from '@/components/upgrade-alert';
import { createProductAction, updateProductAction, uploadProductImageAction } from '../actions';

interface Option {
  id: string;
  name: string;
}

interface Initial {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  storeId: string;
  categoryId: string | null;
  brandId: string | null;
  unitType: string;
  unitSymbol: string;
  price: string;
  costPrice: string | null;
  inventory: string;
  hsnCode: string | null;
  gstRate: string | null;
  imageKey: string | null;
}

interface Props {
  mode: 'create' | 'edit';
  stores: Option[];
  categories: Option[];
  brands: Option[];
  initial?: Initial;
  gstEnabled: boolean;
}

export function ProductForm({ mode, stores, categories, brands, initial, gstEnabled }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitType, setUnitType] = useState<UnitType>(
    initial && isUnitType(initial.unitType) ? initial.unitType : 'piece',
  );

  const symbolOptions = useMemo(() => UNIT_SYMBOLS_BY_TYPE[unitType], [unitType]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get('name'),
      sku: fd.get('sku'),
      barcode: fd.get('barcode'),
      description: fd.get('description'),
      storeId: fd.get('storeId'),
      categoryId: fd.get('categoryId') ?? '',
      brandId: fd.get('brandId') ?? '',
      unitType: fd.get('unitType'),
      unitSymbol: fd.get('unitSymbol'),
      price: fd.get('price'),
      costPrice: fd.get('costPrice') ?? '',
      inventory: fd.get('inventory'),
      hsnCode: fd.get('hsnCode'),
      gstRate: fd.get('gstRate') ?? '',
    };

    const saveResult =
      mode === 'create'
        ? await createProductAction(payload)
        : await updateProductAction({ ...payload, id: initial?.id });

    if (!saveResult.ok) {
      setPending(false);
      setError(saveResult.error);
      return;
    }

    const fileInput = e.currentTarget.elements.namedItem('image');
    const fileToUpload =
      fileInput instanceof HTMLInputElement && fileInput.files?.[0] ? fileInput.files[0] : null;

    if (fileToUpload) {
      const upFd = new FormData();
      upFd.set('id', saveResult.data.id);
      upFd.set('file', fileToUpload);
      const upResult = await uploadProductImageAction(upFd);
      if (!upResult.ok) {
        setPending(false);
        setError(`Saved, but image upload failed: ${upResult.error}`);
        return;
      }
    }

    setPending(false);
    toast({
      title: mode === 'create' ? 'Product created' : 'Product updated',
      description: saveResult.data.name,
    });
    router.push('/products');
    router.refresh();
  }

  const title = mode === 'create' ? 'New product' : 'Edit product';
  const submitLabel = mode === 'create' ? 'Create product' : 'Save changes';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Track inventory by store. Use the unit type that matches how you sell — kg, pc, m, etc.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} encType="multipart/form-data">
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={200}
                defaultValue={initial?.name ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU (optional)</Label>
              <Input id="sku" name="sku" maxLength={60} defaultValue={initial?.sku ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode (optional)</Label>
              <Input
                id="barcode"
                name="barcode"
                maxLength={60}
                defaultValue={initial?.barcode ?? ''}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                name="description"
                maxLength={2000}
                defaultValue={initial?.description ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storeId">Store</Label>
              <Select id="storeId" name="storeId" required defaultValue={initial?.storeId ?? ''}>
                <option value="" disabled>
                  Select a store…
                </option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryId">Category (optional)</Label>
              <Select id="categoryId" name="categoryId" defaultValue={initial?.categoryId ?? ''}>
                <option value="">— none —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brandId">Brand (optional)</Label>
              <Select id="brandId" name="brandId" defaultValue={initial?.brandId ?? ''}>
                <option value="">— none —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitType">Unit type</Label>
              <Select
                id="unitType"
                name="unitType"
                value={unitType}
                onChange={(e) => {
                  if (isUnitType(e.target.value)) setUnitType(e.target.value);
                }}
              >
                {UNIT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitSymbol">Unit symbol</Label>
              <Select
                id="unitSymbol"
                name="unitSymbol"
                defaultValue={initial?.unitSymbol ?? symbolOptions[0]}
                key={unitType}
              >
                {symbolOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (₹ per unit)</Label>
              <Input
                id="price"
                name="price"
                type="text"
                inputMode="decimal"
                placeholder="99.50"
                required
                defaultValue={initial?.price ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="costPrice">Cost price ₹ (optional)</Label>
              <Input
                id="costPrice"
                name="costPrice"
                type="text"
                inputMode="decimal"
                placeholder="60.00"
                defaultValue={initial?.costPrice ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory">Inventory ({initial?.unitSymbol ?? 'units'})</Label>
              <Input
                id="inventory"
                name="inventory"
                type="text"
                inputMode="decimal"
                placeholder="10.000"
                required
                defaultValue={initial?.inventory ?? '0'}
              />
            </div>
            {gstEnabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="hsnCode">HSN code (optional)</Label>
                  <Input
                    id="hsnCode"
                    name="hsnCode"
                    maxLength={20}
                    defaultValue={initial?.hsnCode ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstRate">GST rate %</Label>
                  <Input
                    id="gstRate"
                    name="gstRate"
                    type="text"
                    inputMode="decimal"
                    placeholder="18.00"
                    defaultValue={initial?.gstRate ?? ''}
                  />
                </div>
              </>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="image">Image (JPEG / PNG / WebP, optional, max 10 MB)</Label>
              <Input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
              {initial?.imageKey && (
                <p className="text-xs text-muted-foreground">
                  Current image: <code>{initial.imageKey}</code>. Pick a new file to replace.
                </p>
              )}
            </div>
          </div>
          <UpgradeAlert error={error} />
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Saving…' : submitLabel}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
