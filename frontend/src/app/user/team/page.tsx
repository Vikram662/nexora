'use client';

import { useEffect, useState } from 'react';
import { Users2, Plus, Mail, Shield } from 'lucide-react';
import { fetchTeamMembers, inviteMember } from '@/lib/api';

export default function UserTeamPage() {
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
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
    } catch (err: any) {
      setActionError(err.message || 'Failed to invite team member');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <Users2 className="h-5 w-5 text-blue-600" />
              Team Members & Role-Based Access Control (RBAC)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Invite frontend developers, backend engineers, and finance managers with scoped permissions.
            </p>
          </div>
        </div>

        {actionSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold animate-in fade-in">
            {actionSuccess}
          </div>
        )}

        {actionError && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold animate-in fade-in">
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
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
            required
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
          >
            <option value="DEVELOPER">Developer (API & Rooms)</option>
            <option value="ADMIN">Admin (Full Access)</option>
            <option value="BILLING">Billing (Wallet & Invoices)</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm"
          >
            Invite Member
          </button>
        </form>

        {/* Members Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
          <div className="p-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 flex justify-between uppercase text-[10px]">
            <span>Member Email</span>
            <span>Role</span>
            <span>Status</span>
          </div>

          <div className="divide-y divide-slate-100">
            <div className="p-3.5 flex justify-between items-center hover:bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                  ND
                </div>
                <div>
                  <span className="font-bold text-slate-900 block">developer@company.com</span>
                  <span className="text-[10px] text-slate-400">Owner Access</span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-[10px]">
                OWNER
              </span>
              <span className="text-emerald-600 font-bold text-[10px]">Active</span>
            </div>

            {teamMembers.map((m) => (
              <div key={m.id} className="p-3.5 flex justify-between items-center hover:bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">
                    {m.user?.email ? m.user.email[0].toUpperCase() : 'U'}
                  </div>
                  <span className="font-bold text-slate-900">{m.user?.email || 'Invited User'}</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px]">
                  {m.role}
                </span>
                <span className="text-slate-500 font-medium text-[10px]">
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
