import { getSessionUser } from '@/lib/session';
import { storage } from '@/lib/storage';
import { StorageError, isValidKey, mimeFromKey } from '@mybizone/storage';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Auth-gated file serving. Tenancy is enforced by inspecting the key shape:
 * keys are `<category>/<businessId>/<filename>` and the requesting session
 * must own the businessId segment. 404 (not 403) on mismatch so we don't
 * confirm whether a key exists for someone else.
 *
 * Cache-Control is private + short — these are user-owned assets, not
 * public-static-cacheable.
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: { path: string[] } }) {
  const user = await getSessionUser();
  if (!user || !user.businessId) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const key = ctx.params.path.join('/');
  if (!isValidKey(key)) {
    return new NextResponse('not found', { status: 404 });
  }
  const segments = key.split('/');
  if (segments.length < 3 || segments[1] !== user.businessId) {
    return new NextResponse('not found', { status: 404 });
  }

  try {
    const body = await storage.get(key);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': mimeFromKey(key),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': String(body.byteLength),
      },
    });
  } catch (err) {
    if (err instanceof StorageError && err.code === 'not_found') {
      return new NextResponse('not found', { status: 404 });
    }
    throw err;
  }
}
