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
  const [, setLoading] = useState(true);
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
        <form onSubmit={handleInviteMember} className="flex gap-2 max-w-xl text-xs">
          <input
            type="email"
            placeholder="colleague@yourcompany.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 px-3 py-2 bg-paper border border-line rounded-md"
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
        <div className="border border-line rounded-md overflow-hidden text-xs">
          <div className="p-3 bg-paper border-b border-line font-semibold text-muted flex justify-between text-[10px]">
            <span>Member Email</span>
            <span>Role</span>
            <span>Status</span>
          </div>

          <div className="divide-y divide-line">
            {teamMembers.map((m) => (
              <div key={m.id} className="p-3.5 flex justify-between items-center hover:bg-paper/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-paper-deep text-ink font-bold text-xs flex items-center justify-center">
                    {m.user?.email ? m.user.email[0].toUpperCase() : 'U'}
                  </div>
                  <span className="font-bold text-ink">{m.user?.email || 'Invited User'}</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-sm bg-paper-deep text-ink font-semibold text-[10px]">
                  {m.role}
                </span>
                <span className="text-muted font-medium text-[10px]">
                  {m.acceptedAt ? 'Active' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {pendingInvites.length > 0 && (
          <section aria-labelledby="pending-heading" className="pt-2">
            <h3 id="pending-heading" className="font-display text-base font-semibold">Pending invitations</h3>
            <table className="ledger mt-2">
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
                    <td className="font-semibold text-ink">{inv.email}</td>
                    <td>{inv.role}</td>
                    <td className="text-muted">{new Date(inv.expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                    <td>
                      <button onClick={() => handleCopy(inv.token)} className="text-xs font-semibold text-accent hover:underline cursor-pointer mr-4">
                        Copy link
                      </button>
                      <button onClick={() => handleRevoke(inv.id)} className="text-xs font-semibold text-red-700 hover:underline cursor-pointer">
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
