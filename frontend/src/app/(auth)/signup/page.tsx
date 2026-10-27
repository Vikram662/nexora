'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signupUser } from '@/lib/api';
import { AuthShell, AuthField, AuthError, AuthSubmit } from '@/components/AuthShell';

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      await signupUser(email, orgName, password);
      router.push('/user');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not create the account.');
      setLoading(false);
    }
  };

  return (
    <AuthShell
      image="signUp"
      side="right"
      title="Create an account"
      lede="Create the account, then add a project in the console to get API keys. The wallet starts at ₹0."
      aside={{
        heading: 'Sandbox first, production once the wallet is funded.',
        points: [
          'Each project gets its own API key and secret.',
          'Connect your own storage bucket for recordings.',
          'Top up in rupees when you are ready to go live.',
        ],
      }}
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-moss underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      {errorMsg && <AuthError message={errorMsg} />}
      <form onSubmit={handleSubmit} className="space-y-[18px]">
        <AuthField
          id="org"
          label="Company name"
          type="text"
          value={orgName}
          onChange={setOrgName}
          placeholder="Acme Health"
          autoComplete="organization"
        />
        <AuthField
          id="email"
          label="Work email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="name@company.com"
          autoComplete="email"
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
        />
        <AuthSubmit loading={loading} idle="Create account" busy="Creating…" />
        <p className="text-[13px] leading-relaxed text-bark-muted">
          By creating an account you agree to the{' '}
          <Link href="/terms" className="underline underline-offset-[3px] hover:text-bark">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-[3px] hover:text-bark">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}
