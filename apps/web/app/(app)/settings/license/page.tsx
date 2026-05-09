import { env } from '@/lib/env';
import { verifyLicenseKey } from '@mybizone/auth-config/license';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';

export default async function LicensePage() {
  await requireUser();

  if (!env.LAN_MODE) {
    redirect('/settings/billing');
  }

  const token = env.LICENSE_KEY;
  const result = token ? verifyLicenseKey(token) : null;

  const statusColor = result?.valid
    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">License</h1>
        <p className="text-sm text-muted-foreground">Self-hosted deployment license status</p>
      </div>

      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">License key</h2>
          <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${result ? statusColor : 'bg-muted text-muted-foreground'}`}>
            {!result ? 'Not set' : result.valid ? 'Active' : 'Invalid'}
          </span>
        </div>

        {!result && (
          <p className="text-sm text-muted-foreground">
            No LICENSE_KEY set. The app runs in free-tier mode. Contact{' '}
            <a href="https://mybizone.in" className="underline">mybizone.in</a> to purchase a license.
          </p>
        )}

        {result && !result.valid && (
          <p className="text-sm text-destructive">
            License invalid: {result.reason}. Contact support.
          </p>
        )}

        {result?.valid && (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-medium capitalize">{result.payload.plan}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="font-medium">
                {new Date(result.payload.exp * 1000).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Business ID</dt>
              <dd className="font-mono text-xs">{result.payload.sub}</dd>
            </div>
          </dl>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        License keys are validated offline using RSA cryptography — no internet connection required.
        The key is checked on container start and displayed here for status monitoring.
      </p>
    </div>
  );
}
