'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Building } from 'lucide-react';
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
      title="Create an account"
      lede="Create the account, then add a project in the console to get API keys. The wallet starts at ₹0."
      aside={{
        heading: 'Sandbox first, production once the wallet is funded.',
        points: [
          'Sandbox and production projects get separate keys.',
          'Connect S3, R2 or GCS in the console before you record.',
          'Production calls draw from a prepaid wallet; each top-up gets a GST invoice.',
        ],
      }}
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent hover:text-accent-deep underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      {errorMsg && <AuthError message={errorMsg} />}
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField id="org" label="Company name" type="text" value={orgName} onChange={setOrgName} placeholder="Acme Health" icon={Building} autoComplete="organization" />
        <AuthField id="email" label="Work email" type="email" value={email} onChange={setEmail} placeholder="name@company.com" icon={Mail} autoComplete="email" />
        <AuthField id="password" label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" icon={Lock} autoComplete="new-password" minLength={8} />
        <AuthSubmit loading={loading} idle="Create account" busy="Creating…" />
      </form>
    </AuthShell>
  );
}
