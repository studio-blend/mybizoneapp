'use client';

import { Button } from '@mybizone/ui/button';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      Log out
    </Button>
  );
}
