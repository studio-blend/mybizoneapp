import { createVerify } from 'node:crypto';
import { LICENSE_PUBLIC_KEY } from './license-public-key';

export interface LicensePayload {
  sub: string;   // businessId
  plan: 'pro';
  iss: 'mybizone-license';
  iat: number;
  exp: number;
}

export type LicenseResult =
  | { valid: true; payload: LicensePayload }
  | { valid: false; reason: string };

function base64UrlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - (s.length % 4)) % 4, '=');
  return Buffer.from(padded, 'base64');
}

export function verifyLicenseKey(token: string): LicenseResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed token' };

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let payload: LicensePayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as LicensePayload;
  } catch {
    return { valid: false, reason: 'invalid payload' };
  }

  try {
    const verify = createVerify('RSA-SHA256');
    verify.update(`${headerB64}.${payloadB64}`);
    const valid = verify.verify(LICENSE_PUBLIC_KEY, base64UrlDecode(signatureB64));
    if (!valid) return { valid: false, reason: 'invalid signature' };
  } catch {
    return { valid: false, reason: 'signature verification error' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return { valid: false, reason: `expired ${new Date(payload.exp * 1000).toLocaleDateString('en-IN')}` };
  }
  if (payload.iss !== 'mybizone-license') {
    return { valid: false, reason: 'invalid issuer' };
  }

  return { valid: true, payload };
}
