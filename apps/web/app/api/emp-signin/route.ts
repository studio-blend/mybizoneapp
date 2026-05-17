import { db } from '@/lib/db';
import { account, user, session as sessionTable } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { compare } from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { type NextRequest } from 'next/server';

const SESSION_COOKIE = 'mybizone.session_token';
const SESSION_DURATION_SECS = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: NextRequest) {
  let body: { empId?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { empId, password } = body;
  if (!empId || !password) {
    return Response.json({ error: 'Employee ID and password are required' }, { status: 400 });
  }

  // Find employee by empId
  const [emp] = await db
    .select()
    .from(user)
    .where(eq(user.empId, empId.trim().toUpperCase()))
    .limit(1);

  if (!emp || !emp.empId) {
    // Generic message to avoid user enumeration
    return Response.json({ error: 'Invalid employee ID or password' }, { status: 401 });
  }

  if (!emp.active) {
    return Response.json({ error: 'Account deactivated. Contact your admin.' }, { status: 403 });
  }

  if (emp.lockedAt) {
    return Response.json({ error: 'Account locked after too many failed attempts. Contact your admin to unlock.' }, { status: 403 });
  }

  // Get the hashed password from the account table
  const [acct] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, emp.id), eq(account.providerId, 'credential')))
    .limit(1);

  if (!acct?.password) {
    return Response.json({ error: 'Invalid employee ID or password' }, { status: 401 });
  }

  const passwordOk = await compare(password, acct.password);

  if (!passwordOk) {
    const newAttempts = (emp.failedAttempts ?? 0) + 1;
    const shouldLock = newAttempts >= 3;
    await db.update(user)
      .set({
        failedAttempts: newAttempts,
        lockedAt: shouldLock ? new Date() : emp.lockedAt,
        updatedAt: new Date(),
      })
      .where(eq(user.id, emp.id));

    const msg = shouldLock
      ? 'Account locked after 3 failed attempts. Contact your admin.'
      : `Invalid employee ID or password. ${3 - newAttempts} attempt(s) remaining.`;
    return Response.json({ error: msg }, { status: shouldLock ? 403 : 401 });
  }

  // Success — reset failed attempts
  await db.update(user)
    .set({ failedAttempts: 0, lockedAt: null, updatedAt: new Date() })
    .where(eq(user.id, emp.id));

  // Create session directly (Better Auth reads this table via cookie lookup)
  const token = randomBytes(32).toString('hex');
  const sessionId = randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECS * 1000);

  await db.insert(sessionTable).values({
    id: sessionId,
    token,
    userId: emp.id,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: request.headers.get('x-forwarded-for') ?? request.ip ?? null,
    userAgent: request.headers.get('user-agent') ?? null,
  });

  const isSecure = request.nextUrl.protocol === 'https:';
  const cookieValue = [
    `${SESSION_COOKIE}=${token}`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Path=/`,
    `Max-Age=${SESSION_DURATION_SECS}`,
    isSecure ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  return new Response(
    JSON.stringify({ mustChangePassword: emp.mustChangePassword ?? false }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieValue,
      },
    },
  );
}
