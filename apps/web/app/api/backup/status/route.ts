import fs from 'node:fs';
import path from 'node:path';
import { canManageInstanceBackups } from '@/lib/backup-access';
import { NextResponse } from 'next/server';

export async function GET() {
  if (!(await canManageInstanceBackups()))
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), '..', '..', 'backups');
  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => /^[a-zA-Z0-9_.-]+\.(sql\.gz|dump)$/.test(f))
      .sort()
      .reverse();
    const last = files[0] || null;
    return NextResponse.json({ lastBackup: last, count: files.length });
  } catch {
    return NextResponse.json({ lastBackup: null, count: 0 });
  }
}
