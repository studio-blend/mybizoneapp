'use client';

import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createCatalogueAction } from '../actions';

interface Props {
  brands: { id: string; name: string }[];
  stores: { id: string; name: string }[];
}

export function CatalogueUploadForm({ brands, stores }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    setPending(true);
    const result = await createCatalogueAction(new FormData(formRef.current));
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Upload failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Catalogue uploaded', description: result.data.name });
    router.push('/catalogues');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload catalogue</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={200}
              placeholder="Summer 2025 catalogue"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="file">File (PDF or image, max 20 MB)</Label>
            <Input id="file" name="file" type="file" accept=".pdf,image/*" required />
          </div>

          {brands.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="brandId">Brand (optional)</Label>
              <Select id="brandId" name="brandId" defaultValue="">
                <option value="">Any brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {stores.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="storeId">Store (optional)</Label>
              <Select id="storeId" name="storeId" defaultValue="">
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Uploading…' : 'Upload'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
