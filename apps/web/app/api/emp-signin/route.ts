import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { signSessionToken, verifyCredential } from '@/lib/employee-credentials';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import { account, session as sessionTable, user } from '@mybizone/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'mybizone.session_token';
const SESSION_DURATION_SECS = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: NextRequest) {
  let body: { empId?: string; password?: string };
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('Invalid request');
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { empId, password } = body;
  if (
    typeof empId !== 'string' ||
    typeof password !== 'string' ||
    !empId ||
    !password ||
    empId.length > 32 ||
    password.length > 128
  ) {
    return Response.json({ error: 'Employee ID and password are required' }, { status: 400 });
  }

  if (!rateLimit(`employee-signin:${empId.trim().toUpperCase()}`, 10, 60_000))
    return Response.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });

  // Serialize credentials, account state and session creation with administrative resets.
  return db.transaction(async (tx) => {
    // Find employee by empId
    const [emp] = await tx
      .select()
      .from(user)
      .where(eq(user.empId, empId.trim().toUpperCase()))
      .limit(1)
      .for('update');

    if (!emp || !emp.empId) {
      // Generic message to avoid user enumeration
      return Response.json({ error: 'Invalid employee ID or password' }, { status: 401 });
    }

    if (!emp.active) {
      return Response.json({ error: 'Account deactivated. Contact your admin.' }, { status: 403 });
    }

    if (emp.lockedAt) {
      return Response.json(
        { error: 'Account locked after too many failed attempts. Contact your admin to unlock.' },
        { status: 403 },
      );
    }

    // Get the hashed password from the account table
    const [acct] = await tx
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, emp.id), eq(account.providerId, 'credential')))
      .limit(1);

    if (!acct?.password) {
      return Response.json({ error: 'Invalid employee ID or password' }, { status: 401 });
    }

    const passwordOk = await verifyCredential(password, acct.password);

    if (!passwordOk) {
      // Increment in the database so parallel guesses cannot lose lockout updates.
      await tx
        .update(user)
        .set({
          failedAttempts: sql`${user.failedAttempts} + 1`,
          lockedAt: sql`CASE WHEN ${user.failedAttempts} + 1 >= 3 THEN now() ELSE ${user.lockedAt} END`,
          updatedAt: new Date(),
        })
        .where(and(eq(user.id, emp.id), eq(user.active, true), isNull(user.lockedAt)));
      return Response.json({ error: 'Invalid employee ID or password' }, { status: 401 });
    }

    // A concurrent administrator lock/deactivation must never be cleared by login.
    const [eligible] = await tx
      .update(user)
      .set({ failedAttempts: 0, updatedAt: new Date() })
      .where(and(eq(user.id, emp.id), eq(user.active, true), isNull(user.lockedAt)))
      .returning({ id: user.id });
    if (!eligible)
      return Response.json(
        { error: 'Account unavailable. Contact your administrator.' },
        { status: 403 },
      );

    // Create session directly (Better Auth reads this table via cookie lookup)
    const token = randomBytes(32).toString('hex');
    const sessionId = randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_SECS * 1000);

    await tx.insert(sessionTable).values({
      id: sessionId,
      token,
      userId: emp.id,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
    });

    const isSecure = !env.LAN_MODE && env.BETTER_AUTH_URL.startsWith('https://');
    const cookieName = isSecure ? `__Secure-${SESSION_COOKIE}` : SESSION_COOKIE;
    const cookieValue = [
      `${cookieName}=${signSessionToken(token, env.BETTER_AUTH_SECRET)}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${SESSION_DURATION_SECS}`,
      isSecure ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ');

    return new Response(JSON.stringify({ mustChangePassword: emp.mustChangePassword ?? false }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieValue,
      },
    });
  });
}
