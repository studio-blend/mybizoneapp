import { env } from '@/lib/env';
import { BackupSection } from './backup-section';

export default function SystemSettingsPage() {
  if (!env.LAN_MODE) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border p-6">
          <h2 className="font-semibold text-lg mb-2">System Settings</h2>
          <p className="text-sm text-muted-foreground">
            System settings are only available in self-hosted (LAN) mode.
          </p>
        </div>
      </div>
    );
  }

  const maskedKey = env.LICENSE_KEY
    ? env.LICENSE_KEY.slice(0, 8) + '...' + env.LICENSE_KEY.slice(-4)
    : '(none — trial mode)';

  const nodeVersion = process.version;
  const nextVersion = env.NEXT_PUBLIC_APP_VERSION;
  const port = env.PORT;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-sm text-muted-foreground">Server information for this self-hosted deployment</p>
      </div>

      {/* Server Info */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="font-semibold text-lg">Server</h2>
        <dl className="divide-y">
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-muted-foreground">Port</dt>
            <dd className="font-mono font-medium">{port}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-muted-foreground">Node.js</dt>
            <dd className="font-mono font-medium">{nodeVersion}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-muted-foreground">App Version</dt>
            <dd className="font-mono font-medium">{nextVersion}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-muted-foreground">Mode</dt>
            <dd className="font-mono font-medium">
              {env.PORTABLE_MODE ? 'Portable (desktop)' : 'Self-hosted (LAN)'}
            </dd>
          </div>
        </dl>
      </div>

      {/* License Info */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="font-semibold text-lg">License</h2>
        <dl className="divide-y">
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-muted-foreground">License Key</dt>
            <dd className="font-mono font-medium text-xs">{maskedKey}</dd>
          </div>
        </dl>
        {!env.LICENSE_KEY && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            No license key configured. Running on free plan limits.
          </p>
        )}
      </div>

      {/* Connection Status */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="font-semibold text-lg">Connection</h2>
        <dl className="divide-y">
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-muted-foreground">Network</dt>
            <dd>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm">LAN mode active</span>
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-muted-foreground">HTTPS</dt>
            <dd className="text-muted-foreground">Disabled (LAN-only)</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="text-muted-foreground">
              {env.RESEND_API_KEY ? 'Configured' : 'Disabled (LAN)'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Backup & Restore */}
      <BackupSection />
    </div>
  );
}
