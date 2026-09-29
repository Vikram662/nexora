'use client';

import { useEffect, useState } from 'react';
import { Users2 } from 'lucide-react';
import { fetchTeamMembers, inviteMember, errorMessage } from '@/lib/api';
import type { TeamMember } from '@/lib/types';

export default function UserTeamPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
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
  }, []);

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionSuccess(null);
    setActionError(null);
    try {
      await inviteMember(inviteEmail, inviteRole);
      setInviteEmail('');
      const updated = await fetchTeamMembers();
      setTeamMembers(updated);
      setActionSuccess(`Invitation successfully sent to ${inviteEmail} with role ${inviteRole}!`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setActionError(errorMessage(err,'Failed to invite team member'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-line shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-ink text-lg flex items-center gap-2">
              <Users2 className="h-5 w-5 text-accent" />
              Team Members & Role-Based Access Control (RBAC)
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Invite frontend developers, backend engineers, and finance managers with scoped permissions.
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
            className="px-4 py-2 bg-accent hover:bg-accent-deep text-white font-bold rounded-md text-xs cursor-pointer shadow-sm"
          >
            Invite Member
          </button>
        </form>

        {/* Members Table */}
        <div className="border border-line rounded-md overflow-hidden text-xs">
          <div className="p-3 bg-paper border-b border-line font-semibold text-muted flex justify-between uppercase text-[10px]">
            <span>Member Email</span>
            <span>Role</span>
            <span>Status</span>
          </div>

          <div className="divide-y divide-line">
            <div className="p-3.5 flex justify-between items-center hover:bg-paper/50">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-accent/15 text-accent-deep font-bold text-xs flex items-center justify-center">
                  ND
                </div>
                <div>
                  <span className="font-bold text-ink block">developer@company.com</span>
                  <span className="text-[10px] text-slate-400">Owner Access</span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-accent/10 text-accent-deep font-semibold text-[10px]">
                OWNER
              </span>
              <span className="text-emerald-600 font-bold text-[10px]">Active</span>
            </div>

            {teamMembers.map((m) => (
              <div key={m.id} className="p-3.5 flex justify-between items-center hover:bg-paper/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-paper-deep text-ink font-bold text-xs flex items-center justify-center">
                    {m.user?.email ? m.user.email[0].toUpperCase() : 'U'}
                  </div>
                  <span className="font-bold text-ink">{m.user?.email || 'Invited User'}</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-paper-deep text-ink font-semibold text-[10px]">
                  {m.role}
                </span>
                <span className="text-muted font-medium text-[10px]">
                  {m.acceptedAt ? 'Active' : 'Invitation Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
