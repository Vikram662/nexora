import type { PublicSite } from './types';

// Server-side read of the public site config. Returns null when the API is unreachable so pages can degrade.
export async function getPublicSite(): Promise<PublicSite | null> {
  const base = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;

  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/v1/public/site`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: PublicSite };
    return json.data ?? null;
  } catch {
    return null;
  }
}
