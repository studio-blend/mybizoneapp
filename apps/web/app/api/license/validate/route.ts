import { verifyLicenseKey } from '@mybizone/auth-config/license';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/license/validate
 * Called by docker-entrypoint.sh on container start (LAN_MODE=true).
 * Reads LICENSE_KEY env var, verifies the RSA signature offline.
 * Returns 200 {valid:true} or 403 {valid:false, reason}.
 */
export async function GET() {
  const token = process.env.LICENSE_KEY;

  if (!token) {
    return NextResponse.json(
      { valid: false, reason: 'LICENSE_KEY env var not set' },
      { status: 403 },
    );
  }

  const result = verifyLicenseKey(token);

  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: result.reason }, { status: 403 });
  }

  return NextResponse.json({
    valid: true,
    plan: result.payload.plan,
    expiresAt: new Date(result.payload.exp * 1000).toISOString(),
    businessId: result.payload.sub,
  });
}
