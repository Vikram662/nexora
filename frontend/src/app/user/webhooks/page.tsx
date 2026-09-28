'use client';

import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2 } from 'lucide-react';
import { fetchOrganizationData, addWebhookEndpoint, OrganizationData } from '@/lib/api';

export default function UserWebhooksPage() {
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSuccess, setWebhookSuccess] = useState(false);

  useEffect(() => {
    fetchOrganizationData()
      .then((data) => {
        setOrgData(data);
        if (data.projects && data.projects.length > 0) {
          setSelectedProjectId(data.projects[0].id);
        }
      })
      .catch((e) => console.error(e));
  }, []);

  const selectedProject = orgData?.projects.find((p) => p.id === selectedProjectId) || orgData?.projects[0];

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    try {
      const res = await addWebhookEndpoint(selectedProject.id, {
        url: webhookUrl,
        events: ['recording.completed', 'room_finished', 'low_balance'],
      });
      alert(`Webhook Registered Successfully!\n\nYour HMAC-SHA256 Signing Secret:\n${res.data.signingSecret}\n\nUse this secret to verify signatures in x-nexora-signature header.`);
      setWebhookSuccess(true);
      setWebhookUrl('');
      setTimeout(() => setWebhookSuccess(false), 3000);
      fetchOrganizationData().then((d) => setOrgData(d));
    } catch (err: any) {
      alert(err.message || 'Failed to add webhook');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <BellRing className="h-5 w-5 text-blue-600" />
            Outbound Webhooks (HMAC-SHA256 Signed)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Receive live event notifications when recordings are complete, rooms finish, or wallet balance hits low thresholds.
          </p>
        </div>

        {webhookSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Webhook registered with HMAC signing key!
          </div>
        )}

        <form onSubmit={handleSaveWebhook} className="space-y-4 max-w-xl text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Target Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
            >
              {orgData?.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.apiKeyPrefix})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Target Webhook Endpoint URL</label>
            <input
              type="url"
              placeholder="https://api.yourdomain.com/webhooks/nexora"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              required
            />
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1.5">
            <span className="font-bold block text-slate-800">Subscribed Events:</span>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-0.5 bg-white rounded border border-slate-200 font-mono">recording.completed</span>
              <span className="px-2 py-0.5 bg-white rounded border border-slate-200 font-mono">room_finished</span>
              <span className="px-2 py-0.5 bg-white rounded border border-slate-200 font-mono">wallet.low_balance</span>
            </div>
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all cursor-pointer"
          >
            Register Webhook Endpoint
          </button>
        </form>
      </div>
    </div>
  );
}
