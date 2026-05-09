/**
 * Called by docker-entrypoint.sh when LAN_MODE=true.
 * Exits 0 if valid, 1 if invalid/missing.
 */
import { verifyLicenseKey } from '@mybizone/auth-config/license';

const token = process.env.LICENSE_KEY;

if (!token) {
  console.error('[license] LICENSE_KEY not set. Set it in your .env or docker-compose.');
  process.exit(1);
}

const result = verifyLicenseKey(token);

if (!result.valid) {
  console.error(`[license] Invalid license: ${result.reason}`);
  console.error('[license] Purchase a license at https://mybizone.in or contact support.');
  process.exit(1);
}

console.log(`[license] Valid — plan=${result.payload.plan}, expires=${new Date(result.payload.exp * 1000).toLocaleDateString('en-IN')}`);
