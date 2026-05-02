'use client';

import { signOut } from '@/lib/auth-client';
import { Button } from '@mybizone/ui/button';
import { useRouter } from 'next/navigation';

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
