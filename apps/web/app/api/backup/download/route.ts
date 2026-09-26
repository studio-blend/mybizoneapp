import fs from 'node:fs';
import path from 'node:path';
import { canManageInstanceBackups } from '@/lib/backup-access';
import { NextResponse } from 'next/server';

export async function GET() {
  if (!(await canManageInstanceBackups()))
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  if (process.env.LAN_MODE !== 'true') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), '..', '..', 'backups');

  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => /^[a-zA-Z0-9_.-]+\.(sql\.gz|dump)$/.test(f))
      .sort()
      .reverse();

    if (files.length === 0) {
      return NextResponse.json({ error: 'No backups found' }, { status: 404 });
    }

    const latest = files[0]!;
    const filePath = path.join(backupDir, latest);
    const buffer = fs.readFileSync(filePath);

    return new NextResponse(buffer as Buffer, {
      headers: {
        'Content-Type': latest.endsWith('.dump') ? 'application/octet-stream' : 'application/gzip',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${latest}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
