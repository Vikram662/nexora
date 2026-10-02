'use client';

import { useEffect, useState } from 'react';
import { Users2 } from 'lucide-react';
import { fetchTeamMembers, fetchTeamInvites, inviteMember, revokeTeamInvite, errorMessage, type PendingInvite } from '@/lib/api';
import type { TeamMember } from '@/lib/types';

export default function UserTeamPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'DEVELOPER' | 'BILLING'>('DEVELOPER');
  const [loading, setLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchTeamMembers()
      .then((tm) => setTeamMembers(tm))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
    fetchTeamInvites()
      .then(setPendingInvites)
      .catch(() => setPendingInvites([]));
  }, []);

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
      setActionError(null);
      setActionSuccess('Invitation link copied.');
    } catch {
      setActionError('Could not copy the link. Your browser blocked clipboard access.');
    }
  };

  const handleRevoke = async (id: string) => {
    setActionSuccess(null);
    setActionError(null);
    try {
      await revokeTeamInvite(id);
      setPendingInvites(await fetchTeamInvites());
      setActionSuccess('Invitation cancelled. Its link no longer works.');
    } catch (err) {
      setActionError(errorMessage(err, 'Could not cancel the invitation'));
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionSuccess(null);
    setActionError(null);
    try {
      await inviteMember(inviteEmail, inviteRole);
      setPendingInvites(await fetchTeamInvites());
      setActionSuccess(`Invitation sent to ${inviteEmail}. The link works once and expires in 7 days. If the email does not arrive, copy the link from Pending invitations below.`);
      setInviteEmail('');
    } catch (err) {
      setActionError(errorMessage(err,'Failed to invite team member'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-t-2 border-ink pt-5 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-ink text-lg flex items-center gap-2">
              <Users2 className="h-5 w-5 text-accent" />
              Team and roles
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Invite people by email. They get a one-time link to set a password and join.
            </p>
          </div>
        </div>

        {actionSuccess && (
          <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold animate-in fade-in">
            {actionSuccess}
          </div>
        )}

        {actionError && (
          <div className="p-3.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-semibold animate-in fade-in">
            {actionError}
          </div>
        )}

        {/* Invite Form */}
        <form onSubmit={handleInviteMember} className="flex flex-col sm:flex-row gap-2 max-w-xl text-xs">
          <input
            type="email"
            placeholder="colleague@yourcompany.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 bg-paper border border-line rounded-md"
            required
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
            className="px-3 py-2 bg-paper border border-line rounded-md font-medium"
          >
            <option value="DEVELOPER">Developer (API & Rooms)</option>
            <option value="ADMIN">Admin (Full Access)</option>
            <option value="BILLING">Billing (Wallet & Invoices)</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-accent hover:bg-accent-deep text-white font-bold rounded-md text-xs cursor-pointer"
          >
            Send invitation
          </button>
        </form>

        {/* Members Table */}
        <div className="overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Role</th>
                <th scope="col" className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((m) => (
                <tr key={m.id}>
                  <td>
                    <span className="flex items-center gap-2.5">
                      <span className="h-7 w-7 shrink-0 rounded-full bg-paper-deep text-ink font-bold text-xs flex items-center justify-center">
                        {m.user?.email ? m.user.email[0].toUpperCase() : 'U'}
                      </span>
                      <span className="font-semibold text-ink break-all">{m.user?.email || 'Invited User'}</span>
                    </span>
                  </td>
                  <td>
                    <span className="px-2.5 py-0.5 rounded-sm bg-paper-deep text-ink font-semibold text-[10px]">
                      {m.role}
                    </span>
                  </td>
                  <td className={`text-right text-[11px] font-semibold ${m.acceptedAt ? 'text-emerald-700' : 'text-muted'}`}>
                    {m.acceptedAt ? 'Active' : 'Pending'}
                  </td>
                </tr>
              ))}
              {!loading && teamMembers.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-muted text-xs">
                    No team members yet. Invite someone above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pendingInvites.length > 0 && (
          <section aria-labelledby="pending-heading" className="pt-2">
            <h3 id="pending-heading" className="font-display text-base font-semibold">Pending invitations</h3>
            <div className="overflow-x-auto mt-2">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Expires</th>
                    <th scope="col"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites.map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-semibold text-ink break-all">{inv.email}</td>
                      <td>{inv.role}</td>
                      <td className="text-muted">{new Date(inv.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                      <td>
                        <span className="flex flex-col items-start gap-1.5 sm:flex-row sm:gap-4">
                          <button onClick={() => handleCopy(inv.token)} className="whitespace-nowrap text-xs font-semibold text-accent hover:underline cursor-pointer">
                            Copy link
                          </button>
                          <button onClick={() => handleRevoke(inv.id)} className="whitespace-nowrap text-xs font-semibold text-red-700 hover:underline cursor-pointer">
                            Cancel
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
