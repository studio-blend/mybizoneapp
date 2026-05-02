import { type NextRequest, NextResponse } from 'next/server';

/**
 * Edge middleware: only checks for session cookie presence. Full session validation
 * runs on the page/server-action via `requireUser()` because Better Auth needs DB access.
 *
 * Protected paths: /(app)/* — any group inside the app shell.
 * Public paths: /, /login, /signup, /verify-email, /forgot-password, /reset-password, /api/*
 */
const SESSION_COOKIE = 'mybizone.session_token';

const PROTECTED_PREFIXES = ['/dashboard', '/stores', '/onboarding'];
const SESSION_COOKIE_SECURE = '__Secure-mybizone.session_token';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  const hasSession = req.cookies.has(SESSION_COOKIE) || req.cookies.has(SESSION_COOKIE_SECURE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except static + API auth handler.
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
};
