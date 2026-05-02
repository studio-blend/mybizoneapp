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
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createCategoryAction, updateCategoryAction } from '../actions';

interface Option {
  id: string;
  name: string;
}

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
  };
}

export function CategoryForm({ mode, parentOptions, storeOptions, initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get('name'),
      parentId: fd.get('parentId') ?? '',
      storeId: fd.get('storeId') ?? '',
      sortOrder: fd.get('sortOrder') ?? '0',
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
    toast({
      title: mode === 'create' ? 'Category created' : 'Category updated',
      description: result.data.name,
    });
    router.push('/categories');
    router.refresh();
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
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={120}
              defaultValue={initial?.name ?? ''}
              placeholder="Snacks"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parentId">Parent category (optional)</Label>
            <Select id="parentId" name="parentId" defaultValue={initial?.parentId ?? ''}>
              <option value="">— none (top-level) —</option>
              {parentOptions
                .filter((o) => o.id !== initial?.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="storeId">Scope to store (optional)</Label>
            <Select id="storeId" name="storeId" defaultValue={initial?.storeId ?? ''}>
              <option value="">All stores</option>
              {storeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
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
          {error && <p className="text-sm text-destructive">{error}</p>}
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
