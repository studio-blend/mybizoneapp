import { webcrypto } from 'node:crypto';
import { hash } from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { hashCredential, signSessionToken, verifyCredential } from '../../lib/employee-credentials';

describe('employee credentials', () => {
  it('signs a cookie compatible with Better Auth HMAC SHA-256 verification', async () => {
    const secret = 'test-secret-that-is-never-used-in-production';
    const value = decodeURIComponent(signSessionToken('session-token', secret));
    const [token, signature] = value.split('.');
    const key = await webcrypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    expect(
      await webcrypto.subtle.verify(
        'HMAC',
        key,
        Buffer.from(signature!, 'base64'),
        new TextEncoder().encode(token),
      ),
    ).toBe(true);
    expect(
      await webcrypto.subtle.verify(
        'HMAC',
        key,
        Buffer.from(signature!, 'base64'),
        new TextEncoder().encode('tampered'),
      ),
    ).toBe(false);
  });

  it('accepts legacy employee bcrypt passwords and rejects wrong passwords', async () => {
    const passwordHash = await hash('temporary-password', 4);
    expect(await verifyCredential('temporary-password', passwordHash)).toBe(true);
    expect(await verifyCredential('wrong-password', passwordHash)).toBe(false);
  });

  it('uses Better Auth compatible hashes after a password change', async () => {
    const passwordHash = await hashCredential('a-new-secret-password');
    expect(await verifyCredential('a-new-secret-password', passwordHash)).toBe(true);
    expect(await verifyCredential('wrong-password', passwordHash)).toBe(false);
    expect(await verifyCredential('anything', 'broken-hash')).toBe(false);
  });
});
