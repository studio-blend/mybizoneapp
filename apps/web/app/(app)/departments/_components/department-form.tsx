'use client';

import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createDepartmentAction } from '../actions';

interface Store {
  id: string;
  name: string;
}

export function DepartmentForm({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [storeId, setStoreId] = useState('');
  const [description, setDescription] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    const result = await createDepartmentAction({ name: name.trim(), storeId, description });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Department created' });
    setName('');
    setStoreId('');
    setDescription('');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="dept-name">Name *</Label>
        <Input
          id="dept-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Electronics, Ground Floor"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dept-store">Store (optional)</Label>
        <Select
          id="dept-store"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          <option value="">All stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dept-desc">Description (optional)</Label>
        <Input
          id="dept-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create Department'}
      </Button>
    </form>
  );
}
