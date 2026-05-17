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
import { type FormEvent, useMemo, useState, useCallback } from 'react';
import { UpgradeAlert } from '@/components/upgrade-alert';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { createProductAction, updateProductAction, uploadProductImageAction } from '../actions';

interface Option {
  id: string;
  name: string;
}

interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  attributes: { name: string; unit?: string }[] | null;
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
  mrp: string | null;
  wholesalePrice: string | null;
  rate1: string | null;
  rate2: string | null;
  rate3: string | null;
  rate4: string | null;
  minStock: string | null;
  inventory: string;
  hsnCode: string | null;
  gstRate: string | null;
  imageKey: string | null;
  specs: Record<string, string> | null;
}

interface Props {
  mode: 'create' | 'edit';
  stores: Option[];
  categories: CategoryNode[];
  brands: Option[];
  initial?: Initial;
  gstEnabled: boolean;
}

type FieldErrors = Partial<Record<string, string>>;

const DECIMAL_RE = /^\d+(\.\d+)?$/;
const PRICE_RE = /^\d{1,8}(\.\d{1,2})?$/;
const INVENTORY_RE = /^\d{1,9}(\.\d{1,3})?$/;

function validateDecimalField(value: string, label: string, re: RegExp): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (!re.test(v)) return `${label} must be a valid number`;
  return undefined;
}

function validateForm(
  fd: FormData,
  effectiveCategoryId: string,
  unitType: string,
  unitSymbol: string,
): FieldErrors {
  const errors: FieldErrors = {};

  const name = (fd.get('name') as string | null)?.trim() ?? '';
  if (!name) errors.name = 'Name is required';
  else if (name.length > 200) errors.name = 'Max 200 characters';

  const storeId = (fd.get('storeId') as string | null) ?? '';
  if (!storeId) errors.storeId = 'Store is required';

  const price = (fd.get('price') as string | null)?.trim() ?? '';
  if (!price) errors.price = 'Price is required';
  else if (!PRICE_RE.test(price)) errors.price = 'Enter a valid price (e.g. 99.50)';

  const inventory = (fd.get('inventory') as string | null)?.trim() ?? '';
  if (!inventory) errors.inventory = 'Inventory is required';
  else if (!INVENTORY_RE.test(inventory)) errors.inventory = 'Enter a valid quantity (e.g. 10.000)';

  for (const [key, label] of [
    ['costPrice', 'Cost price'],
    ['mrp', 'MRP'],
    ['wholesalePrice', 'Wholesale price'],
    ['rate1', 'Rate 1'],
    ['rate2', 'Rate 2'],
    ['rate3', 'Rate 3'],
    ['rate4', 'Rate 4'],
    ['minStock', 'Min stock'],
  ] as const) {
    const v = (fd.get(key) as string | null)?.trim() ?? '';
    const err = validateDecimalField(v, label, PRICE_RE);
    if (err) errors[key] = err;
  }

  const gstRate = (fd.get('gstRate') as string | null)?.trim() ?? '';
  if (gstRate && !/^\d{1,3}(\.\d{1,2})?$/.test(gstRate)) {
    errors.gstRate = 'Enter a valid GST rate (e.g. 18.00)';
  }

  if (!unitType) errors.unitType = 'Unit type is required';
  if (!unitSymbol) errors.unitSymbol = 'Unit symbol is required';

  return errors;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}

function deriveSelected(categories: CategoryNode[], categoryId: string | null) {
  if (!categoryId) return { topLevelId: '', subId: '' };
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return { topLevelId: '', subId: '' };
  if (cat.parentId) return { topLevelId: cat.parentId, subId: cat.id };
  return { topLevelId: cat.id, subId: '' };
}

export function ProductForm({ mode, stores, categories, brands, initial, gstEnabled }: Props) {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isDirty, setIsDirty] = useState(false);
  const { safeNavigate } = useUnsavedChanges(isDirty && !pending);

  const [unitType, setUnitType] = useState<UnitType>(
    initial && isUnitType(initial.unitType) ? initial.unitType : 'piece',
  );

  const topLevelCats = useMemo(() => categories.filter((c) => !c.parentId), [categories]);
  const { topLevelId: initTopId, subId: initSubId } = useMemo(
    () => deriveSelected(categories, initial?.categoryId ?? null),
    [categories, initial?.categoryId],
  );
  const [selectedTopId, setSelectedTopId] = useState(initTopId);
  const [selectedSubId, setSelectedSubId] = useState(initSubId);

  const subCategories = useMemo(
    () => categories.filter((c) => c.parentId === selectedTopId),
    [categories, selectedTopId],
  );
  const hasSubcategories = subCategories.length > 0;
  const effectiveCategoryId = hasSubcategories ? selectedSubId : selectedTopId;

  const effectiveCat = useMemo(
    () => categories.find((c) => c.id === (hasSubcategories ? selectedSubId : selectedTopId)),
    [categories, hasSubcategories, selectedSubId, selectedTopId],
  );
  const attrDefs = effectiveCat?.attributes ?? [];
  const [specs, setSpecs] = useState<Record<string, string>>(initial?.specs ?? {});

  const symbolOptions = useMemo(() => UNIT_SYMBOLS_BY_TYPE[unitType], [unitType]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    const fd = new FormData(e.currentTarget);
    const errors = validateForm(fd, effectiveCategoryId, unitType, symbolOptions[0] ?? '');
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = Object.keys(errors)[0];
      document.getElementById(firstKey ?? '')?.focus();
      return;
    }
    setFieldErrors({});
    setPending(true);

    const specsPayload: Record<string, string> = {};
    for (const attr of attrDefs) {
      const val = specs[attr.name] ?? '';
      if (val.trim()) specsPayload[attr.name] = val.trim();
    }

    const payload = {
      name: fd.get('name'),
      sku: fd.get('sku'),
      barcode: fd.get('barcode'),
      description: fd.get('description'),
      storeId: fd.get('storeId'),
      categoryId: effectiveCategoryId || '',
      brandId: fd.get('brandId') ?? '',
      unitType: fd.get('unitType'),
      unitSymbol: fd.get('unitSymbol'),
      price: fd.get('price'),
      costPrice: fd.get('costPrice') ?? '',
      mrp: fd.get('mrp') ?? '',
      wholesalePrice: fd.get('wholesalePrice') ?? '',
      rate1: fd.get('rate1') ?? '',
      rate2: fd.get('rate2') ?? '',
      rate3: fd.get('rate3') ?? '',
      rate4: fd.get('rate4') ?? '',
      minStock: fd.get('minStock') ?? '',
      inventory: fd.get('inventory'),
      hsnCode: fd.get('hsnCode'),
      gstRate: fd.get('gstRate') ?? '',
      specs: JSON.stringify(specsPayload),
    };

    const saveResult =
      mode === 'create'
        ? await createProductAction(payload)
        : await updateProductAction({ ...payload, id: initial?.id });

    if (!saveResult.ok) {
      setPending(false);
      setServerError(saveResult.error);
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
        setServerError(`Saved, but image upload failed: ${upResult.error}`);
        return;
      }
    }

    setIsDirty(false);
    setPending(false);
    toast({
      title: mode === 'create' ? 'Product created' : 'Product updated',
      description: saveResult.data.name,
    });
    safeNavigate('/products');
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
      <form onSubmit={onSubmit} encType="multipart/form-data" onChange={markDirty}>
        <CardContent className="space-y-6">

          {/* Basic info */}
          <div className="rounded-md border p-4 space-y-4">
            <p className="text-sm font-medium">Basic Info</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  maxLength={200}
                  defaultValue={initial?.name ?? ''}
                  aria-invalid={!!fieldErrors.name}
                />
                <FieldError msg={fieldErrors.name} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku">SKU (optional)</Label>
                <Input id="sku" name="sku" maxLength={60} defaultValue={initial?.sku ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="barcode">Barcode (optional)</Label>
                <Input id="barcode" name="barcode" maxLength={60} defaultValue={initial?.barcode ?? ''} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea id="description" name="description" maxLength={2000} defaultValue={initial?.description ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="storeId">
                  Store <span className="text-destructive">*</span>
                </Label>
                <Select
                  id="storeId"
                  name="storeId"
                  defaultValue={initial?.storeId ?? ''}
                  aria-invalid={!!fieldErrors.storeId}
                >
                  <option value="" disabled>Select a store…</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                <FieldError msg={fieldErrors.storeId} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brandId">Brand (optional)</Label>
                <Select id="brandId" name="brandId" defaultValue={initial?.brandId ?? ''}>
                  <option value="">— none —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="rounded-md border p-4 space-y-4">
            <p className="text-sm font-medium">Category</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={selectedTopId}
                  onChange={(e) => {
                    setSelectedTopId(e.target.value);
                    setSelectedSubId('');
                    setSpecs({});
                    markDirty();
                  }}
                >
                  <option value="">— none —</option>
                  {topLevelCats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
              {selectedTopId && hasSubcategories && (
                <div className="space-y-1.5">
                  <Label>
                    Sub-category <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedSubId}
                    onChange={(e) => {
                      setSelectedSubId(e.target.value);
                      setSpecs({});
                      markDirty();
                    }}
                  >
                    <option value="">— select sub-category —</option>
                    {subCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                  {hasSubcategories && !selectedSubId && (
                    <p className="text-xs text-amber-600">Select a sub-category to assign this product correctly.</p>
                  )}
                </div>
              )}
            </div>

            {attrDefs.length > 0 && (
              <div className="space-y-3 pt-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Dimensions &amp; Specs
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {attrDefs.map((attr) => (
                    <div key={attr.name} className="space-y-1.5">
                      <Label>
                        {attr.name}
                        {attr.unit && (
                          <span className="ml-1 text-muted-foreground font-normal">({attr.unit})</span>
                        )}
                      </Label>
                      <Input
                        placeholder={attr.unit ?? attr.name}
                        value={specs[attr.name] ?? ''}
                        onChange={(e) => {
                          setSpecs((p) => ({ ...p, [attr.name]: e.target.value }));
                          markDirty();
                        }}
                        maxLength={80}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Units */}
          <div className="rounded-md border p-4 space-y-4">
            <p className="text-sm font-medium">Unit</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="unitType">
                  Unit type <span className="text-destructive">*</span>
                </Label>
                <Select
                  id="unitType"
                  name="unitType"
                  value={unitType}
                  onChange={(e) => {
                    if (isUnitType(e.target.value)) setUnitType(e.target.value);
                    markDirty();
                  }}
                  aria-invalid={!!fieldErrors.unitType}
                >
                  {UNIT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
                <FieldError msg={fieldErrors.unitType} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitSymbol">
                  Unit symbol <span className="text-destructive">*</span>
                </Label>
                <Select
                  id="unitSymbol"
                  name="unitSymbol"
                  defaultValue={initial?.unitSymbol ?? symbolOptions[0]}
                  key={unitType}
                  aria-invalid={!!fieldErrors.unitSymbol}
                >
                  {symbolOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
                <FieldError msg={fieldErrors.unitSymbol} />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-md border p-4 space-y-4">
            <p className="text-sm font-medium">Pricing</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="price">
                  Price ₹ per unit <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="price"
                  name="price"
                  type="text"
                  inputMode="decimal"
                  placeholder="99.50"
                  defaultValue={initial?.price ?? ''}
                  aria-invalid={!!fieldErrors.price}
                />
                <FieldError msg={fieldErrors.price} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="costPrice">Cost price ₹ (optional)</Label>
                <Input
                  id="costPrice"
                  name="costPrice"
                  type="text"
                  inputMode="decimal"
                  placeholder="60.00"
                  defaultValue={initial?.costPrice ?? ''}
                  aria-invalid={!!fieldErrors.costPrice}
                />
                <FieldError msg={fieldErrors.costPrice} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-xs text-muted-foreground">
                  Pricing tiers (optional) — leave blank to use the main Price above.
                </p>
              </div>
              {([
                ['mrp', 'MRP ₹', '120.00'],
                ['wholesalePrice', 'Wholesale ₹', '80.00'],
                ['rate1', 'Rate 1 ₹', ''],
                ['rate2', 'Rate 2 ₹', ''],
                ['rate3', 'Rate 3 ₹', ''],
                ['rate4', 'Rate 4 ₹', ''],
              ] as const).map(([key, label, ph]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    name={key}
                    type="text"
                    inputMode="decimal"
                    placeholder={ph}
                    defaultValue={(initial as Record<string, string | null> | undefined)?.[key] ?? ''}
                    aria-invalid={!!fieldErrors[key]}
                  />
                  <FieldError msg={fieldErrors[key]} />
                </div>
              ))}
            </div>
          </div>

          {/* Stock */}
          <div className="rounded-md border p-4 space-y-4">
            <p className="text-sm font-medium">Stock</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="minStock">Min stock (reorder level, optional)</Label>
                <Input
                  id="minStock"
                  name="minStock"
                  type="text"
                  inputMode="decimal"
                  placeholder="5.000"
                  defaultValue={initial?.minStock ?? ''}
                  aria-invalid={!!fieldErrors.minStock}
                />
                <FieldError msg={fieldErrors.minStock} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inventory">
                  Opening stock ({initial?.unitSymbol ?? 'units'}){' '}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="inventory"
                  name="inventory"
                  type="text"
                  inputMode="decimal"
                  placeholder="10.000"
                  defaultValue={initial?.inventory ?? '0'}
                  aria-invalid={!!fieldErrors.inventory}
                />
                <FieldError msg={fieldErrors.inventory} />
              </div>
            </div>
          </div>

          {/* GST */}
          {gstEnabled && (
            <div className="rounded-md border p-4 space-y-4">
              <p className="text-sm font-medium">GST</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="hsnCode">HSN code (optional)</Label>
                  <Input id="hsnCode" name="hsnCode" maxLength={20} defaultValue={initial?.hsnCode ?? ''} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gstRate">GST rate %</Label>
                  <Input
                    id="gstRate"
                    name="gstRate"
                    type="text"
                    inputMode="decimal"
                    placeholder="18.00"
                    defaultValue={initial?.gstRate ?? ''}
                    aria-invalid={!!fieldErrors.gstRate}
                  />
                  <FieldError msg={fieldErrors.gstRate} />
                </div>
              </div>
            </div>
          )}

          {/* Image */}
          <div className="space-y-1.5">
            <Label htmlFor="image">Image (JPEG / PNG / WebP, optional, max 10 MB)</Label>
            <Input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
            {initial?.imageKey && (
              <p className="text-xs text-muted-foreground">
                Current image: <code>{initial.imageKey}</code>. Pick a new file to replace.
              </p>
            )}
          </div>

          <UpgradeAlert error={serverError} />
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => safeNavigate('/products')}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? 'Saving…' : submitLabel}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
