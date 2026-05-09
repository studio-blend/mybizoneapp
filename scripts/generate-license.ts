/**
 * License key generator for self-hosted MyBizOne deployments.
 *
 * Usage:
 *   pnpm tsx scripts/generate-license.ts <businessId> [annual|1y|2y]
 *
 * Requires scripts/.license-private-key.pem to exist (never commit this file).
 * Output: a JWT-like token signed with RSA-SHA256.
 * The app verifies it offline using the public key baked into packages/auth-config.
 */

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , businessId, durationArg = 'annual'] = process.argv;

if (!businessId || !/^[0-9a-f-]{36}$/i.test(businessId)) {
  console.error('Usage: pnpm tsx scripts/generate-license.ts <uuid> [annual|1y|2y]');
  process.exit(1);
}

const durationYears =
  durationArg === '2y' ? 2
  : durationArg === '1y' || durationArg === 'annual' ? 1
  : 1;

const privateKeyPath = join(import.meta.dirname, '.license-private-key.pem');
let privateKey: string;
try {
  privateKey = readFileSync(privateKeyPath, 'utf8');
} catch {
  console.error(`Private key not found at ${privateKeyPath}`);
  console.error('Generate a key pair with: node -e "const {generateKeyPairSync} = require(\'crypto\'); const k = generateKeyPairSync(\'rsa\',{modulusLength:2048,publicKeyEncoding:{type:\'spki\',format:\'pem\'},privateKeyEncoding:{type:\'pkcs8\',format:\'pem\'}}); require(\'fs\').writeFileSync(\'scripts/.license-private-key.pem\',k.privateKey);"');
  process.exit(1);
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'LIC' })));
const now = Math.floor(Date.now() / 1000);
const exp = now + durationYears * 365 * 24 * 60 * 60;

const payload = base64UrlEncode(
  Buffer.from(
    JSON.stringify({
      sub: businessId,
      plan: 'pro',
      iss: 'mybizone-license',
      iat: now,
      exp,
    }),
  ),
);

const sign = createSign('RSA-SHA256');
sign.update(`${header}.${payload}`);
const signature = base64UrlEncode(sign.sign(privateKey));

const token = `${header}.${payload}.${signature}`;

console.log('License key:');
console.log(token);
console.log('');
console.log(`Business ID: ${businessId}`);
console.log(`Plan: pro`);
console.log(`Expires: ${new Date(exp * 1000).toLocaleDateString('en-IN')} (${durationYears}yr)`);
console.log('');
console.log('Set in .env or docker-compose:');
console.log(`  LICENSE_KEY=${token}`);
