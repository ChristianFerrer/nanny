import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PUBLIC_PATHS = ['/login'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and API routes
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Check for Supabase auth token in cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  // Get the access token from cookies (Supabase stores it as sb-<ref>-auth-token)
  const authCookieName = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const authCookie = req.cookies.get(authCookieName)?.value;

  // Also check the newer cookie format
  const accessTokenCookie = req.cookies.get(`${authCookieName}.0`)?.value;

  if (!authCookie && !accessTokenCookie) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)'],
};
