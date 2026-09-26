'use server';
import { execFile } from 'node:child_process';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { canManageInstanceBackups } from '@/lib/backup-access';

const execFileAsync = promisify(execFile);

export async function triggerBackupAction(): Promise<{
  success?: boolean;
  filename?: string;
  error?: string;
}> {
  if (!(await canManageInstanceBackups())) return { error: 'Permission denied' };
  const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), '..', '..', 'backups');
  const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
  const outPath = path.join(backupDir, filename);
  const partialPath = `${outPath}.partial`;
  try {
    if (!process.env.DATABASE_URL) return { error: 'Database not configured' };
    await mkdir(backupDir, { recursive: true });
    // argv avoids a shell; PGDATABASE keeps connection secrets out of process arguments.
    await execFileAsync('pg_dump', ['--format=custom', '--no-owner', '--file', partialPath], {
      env: { ...process.env, PGDATABASE: process.env.DATABASE_URL },
      windowsHide: true,
      timeout: 5 * 60 * 1000,
    });
    await rename(partialPath, outPath);
    return { success: true, filename };
  } catch {
    await rm(partialPath, { force: true }).catch(() => undefined);
    return { error: 'Backup failed. Check PostgreSQL backup tools and server logs.' };
  }
}

/** SQL restore is an offline operator operation, never an uploaded web action. */
export async function restoreBackupAction(
  _prevState: unknown,
  _formData: FormData,
): Promise<{ error: string }> {
  return {
    error:
      'Restore requires the server administrator to stop the application and follow the recovery guide.',
  };
}
