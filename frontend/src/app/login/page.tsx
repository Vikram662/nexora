'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Lock } from 'lucide-react';
import { loginUser } from '@/lib/api';
import { AuthShell, AuthField, AuthError, AuthSubmit } from '@/components/AuthShell';

function resolveDestination(redirectTo: string, isStaff: boolean): string {
  // Only paths on this site: anything else (https://elsewhere, //elsewhere) would be an open redirect.
  const safe = redirectTo.startsWith('/') && !redirectTo.startsWith('//') && !redirectTo.includes('\\') ? redirectTo : '/user';
  if (isStaff) return safe.startsWith('/admin') ? safe : '/admin';
  return safe.startsWith('/admin') ? '/user' : safe;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const redirectTo = new URLSearchParams(window.location.search).get('redirect') || '/user';

    try {
      const res = await loginUser(email, password);
      if (res.data?.token) {
        document.cookie = `nexora_auth_token=${res.data.token}; path=/; max-age=86400; SameSite=Lax`;
      }
      window.location.href = resolveDestination(redirectTo, Boolean(res.data?.user?.isStaff));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-in failed. Check your email and password.');
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      lede="Project keys, storage buckets, webhooks and the wallet live in the console."
      aside={{
        heading: 'Your keys, your buckets, your media servers.',
        points: [
          'Server-side tokens keep API secrets out of client apps.',
          'Recordings are written to the bucket you connect, not ours.',
          'Top-ups are prepaid in rupees with a GST invoice for each one.',
        ],
      }}
      footer={
        <>
          New here?{' '}
          <Link href="/signup" className="font-medium text-accent hover:text-accent-deep underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      {errorMsg && <AuthError message={errorMsg} />}
      <form onSubmit={handleSubmit} className="space-y-4" suppressHydrationWarning>
        <AuthField id="email" label="Work email" type="email" value={email} onChange={setEmail} placeholder="name@company.com" icon={Mail} autoComplete="email" />
        <AuthField id="password" label="Password" type="password" value={password} onChange={setPassword} icon={Lock} autoComplete="current-password" />
        <AuthSubmit loading={loading} idle="Sign in" busy="Signing in…" />
      </form>
    </AuthShell>
  );
}
