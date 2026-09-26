import { db } from '@/lib/db';
import { hashCredential, verifyCredential } from '@/lib/employee-credentials';
import { getSessionUser } from '@/lib/session';
import { account, session, user } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('Invalid request');
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;
  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    !currentPassword ||
    !newPassword ||
    currentPassword.length > 128 ||
    newPassword.length > 128
  ) {
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

  const currentOk = await verifyCredential(currentPassword, acct.password);
  if (!currentOk) {
    return Response.json({ error: 'Current password is incorrect' }, { status: 400 });
  }

  const newHash = await hashCredential(newPassword);

  const changed = await db.transaction(async (tx) => {
    const [currentUser] = await tx
      .select()
      .from(user)
      .where(eq(user.id, sessionUser.id))
      .for('update');
    if (!currentUser?.active || currentUser.lockedAt) return false;
    const [updated] = await tx
      .update(account)
      .set({ password: newHash, updatedAt: new Date() })
      .where(and(eq(account.id, acct.id), eq(account.password, acct.password!)))
      .returning({ id: account.id });
    if (!updated) return false;
    await tx
      .update(user)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(user.id, sessionUser.id));
    await tx.delete(session).where(eq(session.userId, sessionUser.id));
    return true;
  });

  if (!changed)
    return Response.json({ error: 'Account or password changed. Sign in again.' }, { status: 409 });
  return Response.json({ ok: true });
}
