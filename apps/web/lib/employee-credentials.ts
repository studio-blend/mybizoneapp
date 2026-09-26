import { createHmac } from 'node:crypto';
import { compare } from 'bcryptjs';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

export function signSessionToken(token: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  return encodeURIComponent(`${token}.${signature}`);
}

export async function verifyCredential(password: string, passwordHash: string): Promise<boolean> {
  try {
    if (passwordHash.startsWith('$2')) return await compare(password, passwordHash);
    return await verifyPassword({ password, hash: passwordHash });
  } catch {
    return false;
  }
}

export async function hashCredential(password: string): Promise<string> {
  return hashPassword(password);
}
