import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  if (process.env.LAN_MODE !== 'true') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  const backupDir =
    process.env.BACKUP_DIR || path.join(process.cwd(), '..', '..', 'backups');

  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.gz'))
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
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${latest}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
