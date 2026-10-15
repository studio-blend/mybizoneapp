'use client';
import { updateBusinessProfileAction } from '@/app/(app)/settings/business/actions';
import { updateStoreProfileAction } from '@/app/(app)/stores/actions';
import { Button } from '@mybizone/ui/button';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { BusinessProfileFields } from './business-profile-fields';

export function BusinessProfileForm({
  initial,
  storeId,
  defaultLabel,
}: {
  initial: { businessProfile: string | null; sellingModel: string | null };
  storeId?: string;
  defaultLabel?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    try {
      const data = new FormData(event.currentTarget);
      const settings = {
        businessProfile: data.get('businessProfile'),
        sellingModel: data.get('sellingModel'),
      };
      const result = storeId
        ? await updateStoreProfileAction({
            storeId,
            businessProfile: settings.businessProfile || null,
            sellingModel: settings.sellingModel || null,
          })
        : await updateBusinessProfileAction(settings);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage('Profile saved. Dashboard priorities now use these settings.');
      router.refresh();
    } catch {
      setError('Could not save the profile. Please try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-xl border bg-card p-5 sm:p-6"
      aria-busy={pending}
    >
      <BusinessProfileFields
        initialProfile={initial.businessProfile}
        initialModel={initial.sellingModel}
        inherit={!!storeId}
        defaultLabel={defaultLabel}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && <output className="block text-sm text-emerald-700">{message}</output>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save profile'}
      </Button>
    </form>
  );
}
