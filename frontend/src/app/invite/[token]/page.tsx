'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Lock, User } from 'lucide-react';
import { acceptInvite, acceptInviteExisting, fetchInvitePreview, errorMessage, type InvitePreview } from '@/lib/api';
import { AuthShell, AuthField, AuthError, AuthSubmit } from '@/components/AuthShell';

const ASIDE = {
  heading: 'Join your team on Nexora.',
  points: [
    'The link works once and expires 7 days after it was sent.',
    'Your role decides what you can change in the console.',
  ],
};

type Stage = { kind: 'loading' } | { kind: 'invalid'; message: string } | { kind: 'ready'; invite: InvitePreview };

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params.token);
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  useEffect(() => {
    fetchInvitePreview(token)
      .then((invite) => setStage({ kind: 'ready', invite }))
      .catch((err) => setStage({ kind: 'invalid', message: errorMessage(err, 'This invitation link is not valid.') }));
  }, [token]);

  const roleLabel = (role: string) => role.charAt(0) + role.slice(1).toLowerCase();

  const finish = () => {
    // A full load so the console starts with the new session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/user';
  };

  const handleNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await acceptInvite(token, password, name);
      finish();
    } catch (err) {
      setError(errorMessage(err, 'Could not accept the invitation.'));
      setBusy(false);
    }
  };

  const handleExisting = async () => {
    setBusy(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      await acceptInviteExisting(token);
      finish();
    } catch (err) {
      if (err instanceof Error && err.message === 'SIGN_IN_REQUIRED') setNeedsSignIn(true);
      else setError(errorMessage(err, 'Could not accept the invitation.'));
      setBusy(false);
    }
  };

  if (stage.kind === 'loading') {
    return (
      <AuthShell title="Invitation" lede="Checking your invitation link." aside={ASIDE} footer={null}>
        <p className="text-sm text-muted" role="status">Loading...</p>
      </AuthShell>
    );
  }

  if (stage.kind === 'invalid') {
    return (
      <AuthShell
        title="This link cannot be used"
        lede={stage.message}
        aside={ASIDE}
        footer={
          <Link href="/login" className="font-medium text-accent hover:text-accent-deep underline underline-offset-4">
            Go to sign in
          </Link>
        }
      >
        <p className="text-sm text-muted">Ask the person who invited you to send a new invitation.</p>
      </AuthShell>
    );
  }

  const { invite } = stage;

  return (
    <AuthShell
      title={`Join ${invite.organizationName}`}
      lede={`You were invited as ${roleLabel(invite.role)} with ${invite.email}.`}
      aside={ASIDE}
      footer={null}
    >
      {error && <AuthError message={error} />}

      {invite.hasAccount ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {invite.email} already has an account. Sign in with it, then accept the invitation.
          </p>
          <button
            type="button"
            onClick={handleExisting}
            disabled={busy}
            className="w-full py-2.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-deep transition-colors disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'Accepting…' : `Accept as ${invite.email}`}
          </button>
          {needsSignIn && (
            <p role="alert" className="text-sm text-ink">
              You are not signed in.{' '}
              <Link href={`/login?redirect=${encodeURIComponent(`/invite/${encodeURIComponent(token)}`)}`} className="font-medium text-accent underline underline-offset-4">
                Sign in
              </Link>{' '}
              and you will come back here.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleNewAccount} className="space-y-4">
          <AuthField id="name" label="Your name" type="text" value={name} onChange={setName} placeholder="Riya Kapoor" icon={User} autoComplete="name" />
          <AuthField id="password" label="Choose a password" type="password" value={password} onChange={setPassword} icon={Lock} autoComplete="new-password" minLength={8} />
          <p className="text-xs text-muted">At least 8 characters.</p>
          <AuthSubmit loading={busy} idle="Create account and join" busy="Joining…" />
        </form>
      )}
    </AuthShell>
  );
}
