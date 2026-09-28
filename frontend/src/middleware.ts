import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /user and /admin panels
  const isProtectedPath = pathname.startsWith('/user') || pathname.startsWith('/admin');

  if (isProtectedPath) {
    const authToken = request.cookies.get('nexora_auth_token')?.value;

    if (!authToken) {
      // Redirect unauthenticated requests to login page
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Role-based Access Control (RBAC):
    // Regular users (role !== 'admin') are strictly forbidden from entering /admin/*
    if (pathname.startsWith('/admin')) {
      const userRole = request.cookies.get('nexora_user_role')?.value;
      if (userRole !== 'admin') {
        // Kick normal user back to their developer console (/user)
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
