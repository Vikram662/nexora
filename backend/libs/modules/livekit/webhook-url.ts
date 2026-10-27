import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Event names customers can subscribe to. `*` subscribes to everything. */
export const WEBHOOK_EVENTS = [
  'room.started',
  'room.finished',
  'participant.joined',
  'participant.left',
  'recording.started',
  'recording.completed',
  'recording.failed',
  'recording.updated',
] as const;

export class WebhookUrlError extends Error {}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inRange(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) >>> 0 === (ipv4ToInt(base) & mask) >>> 0;
}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata services
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 3], // multicast and reserved
];

/** True for addresses a customer must never be able to make our servers call. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const n = ipv4ToInt(address);
    return BLOCKED_V4.some(([base, bits]) => inRange(n, base, bits));
  }
  if (version === 6) {
    const a = address.toLowerCase();
    if (a === '::' || a === '::1') return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return a.startsWith('fc') || a.startsWith('fd') || /^fe[89ab]/.test(a);
  }
  return true; // not an IP at all: refuse
}

/**
 * Checks a webhook URL before we call it. Only public https addresses are allowed, so a customer cannot point us at
 * localhost, private networks or cloud metadata endpoints. Run at registration and again before every delivery,
 * because DNS can change in between. Set WEBHOOK_ALLOW_PRIVATE_URLS=true in development to call local servers.
 */
export async function assertPublicWebhookUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebhookUrlError('The webhook URL is not valid.');
  }
  const allowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE_URLS === 'true' && process.env.NODE_ENV !== 'production';
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    throw new WebhookUrlError('The webhook URL must start with https://.');
  }
  if (url.username || url.password) {
    throw new WebhookUrlError('The webhook URL cannot contain a username or password.');
  }
  if (allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((r) => r.address);
    } catch {
      throw new WebhookUrlError('The webhook host could not be found.');
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new WebhookUrlError('The webhook URL must point to a public server, not a private or local address.');
  }
  return url;
}
