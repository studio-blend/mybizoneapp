import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const backupDir =
    process.env.BACKUP_DIR || path.join(process.cwd(), '..', '..', 'backups');
  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.gz'))
      .sort()
      .reverse();
    const last = files[0] || null;
    return NextResponse.json({ lastBackup: last, count: files.length });
  } catch {
    return NextResponse.json({ lastBackup: null, count: 0 });
  }
}
