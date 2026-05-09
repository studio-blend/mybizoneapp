import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: 'ok', db: 'connected' });
  } catch {
    return NextResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 });
  }
}
