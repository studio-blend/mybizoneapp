'use client';

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
import { useToast } from '@mybizone/ui/use-toast';
import { useState, useCallback } from 'react';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { createCategoryAction, updateCategoryAction } from '../actions';

interface Option {
  id: string;
  name: string;
}

interface Attribute {
  name: string;
  unit?: string;
}

type FieldErrors = Partial<Record<string, string>>;

interface Props {
  mode: 'create' | 'edit';
  parentOptions: Option[];
  storeOptions: Option[];
  initial?: {
    id: string;
    name: string;
    parentId: string | null;
    storeId: string | null;
    sortOrder: number;
    attributes: Attribute[];
  };
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}

function validateCategoryForm(name: string, attributes: Attribute[]): FieldErrors {
  const errors: FieldErrors = {};
  if (!name.trim()) errors.name = 'Name is required';
  else if (name.trim().length > 120) errors.name = 'Max 120 characters';

  attributes.forEach((attr, i) => {
    if (!attr.name.trim()) {
      errors[`attr_name_${i}`] = 'Attribute name is required';
    } else if (attr.name.trim().length > 60) {
      errors[`attr_name_${i}`] = 'Max 60 characters';
    }
    if (attr.unit && attr.unit.length > 20) {
      errors[`attr_unit_${i}`] = 'Max 20 characters';
    }
  });

  return errors;
}

export function CategoryForm({ mode, parentOptions, storeOptions, initial }: Props) {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isDirty, setIsDirty] = useState(false);
  const { safeNavigate } = useUnsavedChanges(isDirty && !pending);

  const [attributes, setAttributes] = useState<Attribute[]>(initial?.attributes ?? []);

  const markDirty = useCallback(() => setIsDirty(true), []);

  function addAttribute() {
    setAttributes((prev) => [...prev, { name: '', unit: undefined }]);
    markDirty();
  }

  function removeAttribute(index: number) {
    setAttributes((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  }

  function updateAttribute(index: number, field: keyof Attribute, value: string) {
    setAttributes((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    );
    markDirty();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string | null) ?? '';

    const errors = validateCategoryForm(name, attributes);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = Object.keys(errors)[0];
      document.getElementById(firstKey ?? '')?.focus();
      return;
    }
    setFieldErrors({});
    setPending(true);

    const payload = {
      name: fd.get('name'),
      parentId: fd.get('parentId') ?? '',
      storeId: fd.get('storeId') ?? '',
      sortOrder: fd.get('sortOrder') ?? '0',
      attributes: JSON.stringify(attributes.filter((a) => a.name.trim())),
    };
    const result =
      mode === 'create'
        ? await createCategoryAction(payload)
        : await updateCategoryAction({ ...payload, id: initial?.id });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setIsDirty(false);
    toast({
      title: mode === 'create' ? 'Category created' : 'Category updated',
      description: result.data.name,
    });
    safeNavigate('/categories');
  }

  const title = mode === 'create' ? 'New category' : 'Edit category';
  const submitLabel = mode === 'create' ? 'Create category' : 'Save changes';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Group products into categories. Sub-categories show under a parent.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} onChange={markDirty}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              maxLength={120}
              defaultValue={initial?.name ?? ''}
              placeholder="Air Conditioners"
              aria-invalid={!!fieldErrors.name}
            />
            <FieldError msg={fieldErrors.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentId">Parent category (optional)</Label>
            <Select id="parentId" name="parentId" defaultValue={initial?.parentId ?? ''}>
              <option value="">— none (top-level) —</option>
              {parentOptions
                .filter((o) => o.id !== initial?.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="storeId">Scope to store (optional)</Label>
            <Select id="storeId" name="storeId" defaultValue={initial?.storeId ?? ''}>
              <option value="">All stores</option>
              {storeOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sortOrder">Sort order</Label>
            <Input
              id="sortOrder"
              name="sortOrder"
              type="number"
              min={0}
              max={9999}
              defaultValue={initial?.sortOrder ?? 0}
            />
          </div>

          {/* Attribute / Dimension editor */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-sm font-medium">Dimensions / Attributes</p>
                <p className="text-xs text-muted-foreground">
                  Define optional specs for products in this category (e.g. Capacity → Ton).
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addAttribute}>
                + Add
              </Button>
            </div>
            {attributes.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
                  <span>Attribute name *</span>
                  <span>Unit (optional)</span>
                  <span />
                </div>
                {attributes.map((attr, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
                      <div>
                        <Input
                          id={`attr_name_${i}`}
                          placeholder="Capacity"
                          value={attr.name}
                          onChange={(e) => updateAttribute(i, 'name', e.target.value)}
                          maxLength={60}
                          aria-invalid={!!fieldErrors[`attr_name_${i}`]}
                        />
                        <FieldError msg={fieldErrors[`attr_name_${i}`]} />
                      </div>
                      <div>
                        <Input
                          id={`attr_unit_${i}`}
                          placeholder="Ton"
                          value={attr.unit ?? ''}
                          onChange={(e) => updateAttribute(i, 'unit', e.target.value)}
                          maxLength={20}
                          aria-invalid={!!fieldErrors[`attr_unit_${i}`]}
                        />
                        <FieldError msg={fieldErrors[`attr_unit_${i}`]} />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttribute(i)}
                        className="mt-2 text-muted-foreground hover:text-destructive transition-colors p-1"
                        aria-label="Remove attribute"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => safeNavigate('/categories')}
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
