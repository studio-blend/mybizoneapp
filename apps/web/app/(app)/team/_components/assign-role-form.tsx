'use client';

import { Button } from '@mybizone/ui/button';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { grantRoleAction } from '../actions';

const ASSIGNABLE_ROLES = [
  'admin',
  'shop_manager',
  'branch_manager',
  'floor_manager',
  'sales',
  'marketing',
  'inventory',
  'billing',
  'accounts',
] as const;

const SUPER_ADMIN_ROLES = ['super_admin', ...ASSIGNABLE_ROLES] as const;

interface Store {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
}

interface Props {
  userId: string;
  stores: Store[];
  departments: Department[];
  isSuperAdmin: boolean;
}

export function AssignRoleForm({ userId, stores, departments, isSuperAdmin }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState('');
  const [storeId, setStoreId] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  const roles = isSuperAdmin ? SUPER_ADMIN_ROLES : ASSIGNABLE_ROLES;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return;
    setPending(true);
    const result = await grantRoleAction({ userId, role: role as typeof roles[number], storeId, departmentId });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: `Role "${role}" assigned` });
    setRole('');
    setStoreId('');
    setDepartmentId('');
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        + Role
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 text-left">
      <div>
        <Label className="text-xs">Role</Label>
        <Select value={role} onChange={(e) => setRole(e.target.value)} required>
          <option value="">Select role…</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </div>
      {(role === 'branch_manager') && stores.length > 0 && (
        <div>
          <Label className="text-xs">Store scope (optional)</Label>
          <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Any store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      {(role === 'floor_manager') && departments.length > 0 && (
        <div>
          <Label className="text-xs">Department scope (optional)</Label>
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Any department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={pending || !role}>
          {pending ? '…' : 'Assign'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => { setOpen(false); setRole(''); }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
