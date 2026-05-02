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
import { Textarea } from '@mybizone/ui/textarea';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBrandAction, updateBrandAction } from '../actions';

interface Props {
  mode: 'create' | 'edit';
  initial?: { id: string; name: string; description: string | null };
}

export function BrandForm({ mode, initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const payload = { name: fd.get('name'), description: fd.get('description') };
    const result =
      mode === 'create'
        ? await createBrandAction(payload)
        : await updateBrandAction({ ...payload, id: initial?.id });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({
      title: mode === 'create' ? 'Brand created' : 'Brand updated',
      description: result.data.name,
    });
    router.push('/brands');
    router.refresh();
  }

  const title = mode === 'create' ? 'New brand' : 'Edit brand';
  const submitLabel = mode === 'create' ? 'Create brand' : 'Save changes';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Tag products by manufacturer or label.</CardDescription>
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
              placeholder="Acme"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              name="description"
              maxLength={500}
              defaultValue={initial?.description ?? ''}
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
