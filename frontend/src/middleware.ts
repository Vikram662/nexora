import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /user and /admin panels
  const isProtectedPath = pathname.startsWith('/user') || pathname.startsWith('/admin');

  if (isProtectedPath) {
    const authToken = request.cookies.get('nexora_auth_token')?.value;

    if (!authToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Fail closed: Must have a server-only JWT_SECRET configured. Never fall back to public secrets or unverified base64 decode.
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('FATAL: JWT_SECRET environment variable is missing in server environment. Rejecting request.');
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    let decodedPayload: Record<string, unknown> | null = null;

    try {
      const secretKey = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(authToken, secretKey);
      decodedPayload = payload as Record<string, unknown>;
    } catch {
      // Signature verification failed or expired - purge invalid session
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete('nexora_auth_token');
      response.cookies.delete('nexora_user_role');
      return response;
    }

    // Cryptographically verified role checking for /admin/*
    if (pathname.startsWith('/admin')) {
      const isStaff = Boolean(
        decodedPayload?.isStaff ||
        decodedPayload?.role === 'SUPER_ADMIN' ||
        decodedPayload?.role === 'STAFF'
      );

      if (!isStaff) {
        // Normal customer attempting to access staff operations
        const userConsoleUrl = new URL('/user', request.url);
        return NextResponse.redirect(userConsoleUrl);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/user/:path*', '/admin/:path*'],
};
