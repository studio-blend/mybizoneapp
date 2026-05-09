import { type NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'mybizone.session_token';
const SESSION_COOKIE_SECURE = '__Secure-mybizone.session_token';
const PROTECTED_PREFIXES = ['/dashboard', '/stores', '/onboarding'];

function buildCsp(): string {
  const isProd = process.env.NODE_ENV === 'production';
  const isLAN = process.env.LAN_MODE === 'true';
  // LAN_MODE: relax script-src so Next.js inline hydration scripts work without
  // wiring nonces. Acceptable for private-network deployments; for public
  // internet-facing deploys we should switch to nonce-based CSP.
  const allowInlineScript = !isProd || isLAN;
  return [
    "default-src 'self'",
    `script-src 'self'${allowInlineScript ? " 'unsafe-eval' 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.sentry.io https://*.posthog.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  const isLAN = process.env.LAN_MODE === 'true';
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.headers.set('Content-Security-Policy', buildCsp());
  if (!isLAN) {
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return applySecurityHeaders(NextResponse.next());

  const hasSession = req.cookies.has(SESSION_COOKIE) || req.cookies.has(SESSION_COOKIE_SECURE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return applySecurityHeaders(NextResponse.redirect(url));
  }
  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
