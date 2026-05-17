import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { account, user } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { hash, compare } from 'bcryptjs';
import { type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    return Response.json({ error: 'Both current and new password are required' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return Response.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  // Get current password hash from account table
  const [acct] = await db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(and(eq(account.userId, sessionUser.id), eq(account.providerId, 'credential')))
    .limit(1);

  if (!acct?.password) {
    return Response.json({ error: 'No password set for this account' }, { status: 400 });
  }

  const currentOk = await compare(currentPassword, acct.password);
  if (!currentOk) {
    return Response.json({ error: 'Current password is incorrect' }, { status: 400 });
  }

  const newHash = await hash(newPassword, 10);

  await Promise.all([
    db.update(account)
      .set({ password: newHash, updatedAt: new Date() })
      .where(eq(account.id, acct.id)),
    db.update(user)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(user.id, sessionUser.id)),
  ]);

  return Response.json({ ok: true });
}
