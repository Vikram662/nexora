import type { CookieOptions } from 'express';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The session cookie is HttpOnly, so scripts on the page can never read it. When the API and the website are on
 * sibling hosts (api.example.com and www.example.com), set COOKIE_DOMAIN=.example.com so the browser sends the
 * cookie to both. Leave it unset when both are on one host (localhost ports share cookies).
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: DAY_MS,
    path: '/',
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

/** Options that match the ones used to set the cookie, so the browser actually removes it. */
export function clearCookieOptions(): CookieOptions {
  const { maxAge: _maxAge, ...rest } = sessionCookieOptions();
  return rest;
}
