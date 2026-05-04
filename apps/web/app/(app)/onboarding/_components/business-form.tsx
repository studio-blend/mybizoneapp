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
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { updateBusinessSetupAction } from '../actions';

interface Props {
  initial: { gstEnabled: boolean; gstin: string };
}

export function OnboardingBusinessForm({ initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [gstEnabled, setGstEnabled] = useState(initial.gstEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const result = await updateBusinessSetupAction({
      gstEnabled: gstEnabled ? 'on' : 'off',
      gstin: fd.get('gstin') ?? '',
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({ title: 'Business saved' });
    router.push('/onboarding/store');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1: Business setup</CardTitle>
        <CardDescription>
          Toggle GST if you bill registered customers; otherwise keep it off and skip the GSTIN. You
          can change this later in settings.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={gstEnabled}
              onChange={(e) => setGstEnabled(e.target.checked)}
            />
            Enable GST billing
          </label>
          {gstEnabled && (
            <div className="space-y-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                name="gstin"
                required
                maxLength={20}
                defaultValue={initial.gstin}
                placeholder="27AAAPL1234C1Z5"
                style={{ textTransform: 'uppercase' }}
              />
              <p className="text-xs text-muted-foreground">
                15-character format: state(2) + PAN(10) + entity(1) + Z + check(1).
              </p>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Saving…' : 'Continue'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
