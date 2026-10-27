import * as crypto from 'crypto';

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET must be set (32+ characters) to sign invitation links.');
  }
  return value;
}

function mac(inviteId: string): string {
  return crypto.createHmac('sha256', secret()).update(`team-invite:${inviteId}`).digest('hex');
}

/** The value in the emailed link. It is derived from the invite id, so it never has to be stored. */
export function signInviteToken(inviteId: string): string {
  return `${inviteId}.${mac(inviteId)}`;
}

/** Returns the invite id if the token is genuine, otherwise null. */
export function verifyInviteToken(token: string): string | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const inviteId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'utf8');
  const expected = Buffer.from(mac(inviteId), 'utf8');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return inviteId;
}
