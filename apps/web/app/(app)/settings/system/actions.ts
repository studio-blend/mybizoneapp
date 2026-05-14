'use server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

function getBackupDir(): string {
  return (
    process.env.BACKUP_DIR || path.join(process.cwd(), '..', '..', 'backups')
  );
}

export async function triggerBackupAction(): Promise<{
  success?: boolean;
  filename?: string;
  error?: string;
}> {
  if (process.env.LAN_MODE !== 'true') {
    return { error: 'Not available' };
  }
  const backupDir = getBackupDir();
  const filename =
    new Date().toISOString().replace(/[:.]/g, '-') + '.sql.gz';
  const outPath = path.join(backupDir, filename);
  fs.mkdirSync(backupDir, { recursive: true });
  const dbUrl = process.env.DATABASE_URL!;
  try {
    await execAsync(`pg_dump "${dbUrl}" | gzip > "${outPath}"`);
    return { success: true, filename };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

export async function restoreBackupAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  if (process.env.LAN_MODE !== 'true') {
    return { error: 'Not available' };
  }
  const file = formData.get('file') as File | null;
  if (!file) {
    return { error: 'No file provided' };
  }
  const backupDir = getBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });
  const destPath = path.join(backupDir, `restore-${Date.now()}.sql.gz`);
  const arrayBuffer = await file.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
  const dbUrl = process.env.DATABASE_URL!;
  try {
    await execAsync(`gunzip -c "${destPath}" | psql "${dbUrl}"`);
    fs.unlinkSync(destPath);
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}
