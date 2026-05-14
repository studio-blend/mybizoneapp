'use client';

import { useEffect, useRef, useState } from 'react';
import { triggerBackupAction, restoreBackupAction } from './actions';

type BackupStatus = { lastBackup: string | null; count: number };
type BackupResult = { success?: boolean; filename?: string; error?: string } | null;
type RestoreResult = { success?: boolean; error?: string } | null;

export function BackupSection() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [backupPending, setBackupPending] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult>(null);
  const [restorePending, setRestorePending] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleBackup(e: React.FormEvent) {
    e.preventDefault();
    setBackupPending(true);
    setBackupResult(null);
    const result = await triggerBackupAction();
    setBackupResult(result);
    setBackupPending(false);
    if (result?.success) fetchStatus();
  }

  async function handleRestore(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setRestorePending(true);
    setRestoreResult(null);
    const result = await restoreBackupAction(null, formData);
    setRestoreResult(result);
    setRestorePending(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  async function fetchStatus() {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/backup/status');
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ lastBackup: null, count: 0 });
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastBackupLabel = loadingStatus
    ? 'Loading...'
    : status?.lastBackup
      ? status.lastBackup.replace('.sql.gz', '').replace(/_/g, ' ')
      : 'Never';

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Backup &amp; Restore</h2>
        <span className="text-xs text-muted-foreground">
          {status?.count != null ? `${status.count} backup(s) stored` : ''}
        </span>
      </div>

      {/* Last backup info */}
      <dl className="divide-y">
        <div className="flex items-center justify-between py-2.5 text-sm">
          <dt className="text-muted-foreground">Last backup</dt>
          <dd className="font-mono font-medium">{lastBackupLabel}</dd>
        </div>
      </dl>

      {/* Back Up Now */}
      <div className="flex items-center gap-3">
        <form onSubmit={handleBackup}>
          <button
            type="submit"
            disabled={backupPending}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {backupPending ? 'Backing up...' : 'Back Up Now'}
          </button>
        </form>
        {status?.lastBackup && (
          <a
            href="/api/backup/download"
            className="text-sm underline underline-offset-4 text-primary"
          >
            Download last backup
          </a>
        )}
      </div>

      {backupResult?.success && (
        <p className="text-xs text-green-600 dark:text-green-400">
          Backup created: {backupResult.filename}
        </p>
      )}
      {backupResult?.error && (
        <p className="text-xs text-destructive">{backupResult.error}</p>
      )}

      {/* Restore from file */}
      <div className="border-t pt-4 space-y-2">
        <p className="text-sm font-medium">Restore from backup</p>
        <p className="text-xs text-muted-foreground">
          Upload a <code>.sql.gz</code> backup file. This will overwrite the current database.
        </p>
        <form onSubmit={handleRestore} className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept=".gz,.sql.gz"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium"
            required
          />
          <button
            type="submit"
            disabled={restorePending}
            className="inline-flex items-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {restorePending ? 'Restoring...' : 'Restore'}
          </button>
        </form>
        {restoreResult?.success && (
          <p className="text-xs text-green-600 dark:text-green-400">
            Database restored successfully. Please restart the server.
          </p>
        )}
        {restoreResult?.error && (
          <p className="text-xs text-destructive">{restoreResult.error}</p>
        )}
      </div>
    </div>
  );
}
