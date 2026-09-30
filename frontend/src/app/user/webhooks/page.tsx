'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchOrganizationData,
  fetchWebhookDeliveries,
  addWebhookEndpoint,
  deleteWebhookEndpoint,
  resendWebhookDelivery,
  OrganizationData,
  WebhookDeliveryInfo,
  errorMessage,
} from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

const EVENTS = [
  { name: 'room.started', detail: 'The first person joins a room' },
  { name: 'room.finished', detail: 'The last person leaves a room' },
  { name: 'participant.joined', detail: 'Someone joins a room' },
  { name: 'participant.left', detail: 'Someone leaves a room' },
  { name: 'recording.started', detail: 'A recording begins' },
  { name: 'recording.completed', detail: 'A recording is saved to your bucket' },
  { name: 'recording.failed', detail: 'A recording could not be saved' },
];

const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function statusOf(d: WebhookDeliveryInfo): { label: string; tone: string } {
  if (d.succeeded) return { label: 'Delivered', tone: 'text-emerald-700' };
  if (d.attempt === 0) return { label: 'Sending', tone: 'text-muted' };
  if (d.nextRetryAt) return { label: `Retrying ${time(d.nextRetryAt)}`, tone: 'text-amber-700' };
  return { label: `Failed after ${d.attempt} tries`, tone: 'text-red-700' };
}

export default function UserWebhooksPage() {
  const { success, error: toastError, confirm } = useToast();
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set(EVENTS.map((e) => e.name)));
  const [saving, setSaving] = useState(false);
  const [newSecret, setNewSecret] = useState<{ url: string; secret: string } | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [org, list] = await Promise.all([fetchOrganizationData(), fetchWebhookDeliveries().catch(() => [])]);
    setOrgData(org);
    setDeliveries(list);
    setSelectedProjectId((current) => current || org.projects[0]?.id || '');
  }, []);

  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch(() => toastError('Could not load your webhooks. Refresh the page to try again.'));
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endpoints = (orgData?.projects ?? []).flatMap((p) => (p.webhookEndpoints ?? []).map((e) => ({ ...e, projectName: p.name })));

  const toggle = (name: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || chosen.size === 0) return;
    setSaving(true);
    try {
      const res = await addWebhookEndpoint(selectedProjectId, {
        url: webhookUrl.trim(),
        events: chosen.size === EVENTS.length ? ['*'] : [...chosen],
      });
      setNewSecret({ url: res.data.endpoint.url, secret: res.data.signingSecret });
      setWebhookUrl('');
      await load();
    } catch (err) {
      toastError(errorMessage(err, 'Could not add the webhook'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, url: string) => {
    const ok = await confirm({
      title: 'Delete this webhook?',
      message: `${url} will stop receiving events, and its delivery history is removed.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteWebhookEndpoint(id);
      success('Webhook deleted.');
      await load();
    } catch (err) {
      toastError(errorMessage(err, 'Could not delete the webhook'));
    }
  };

  const handleResend = async (id: string) => {
    setResending(id);
    try {
      const r = await resendWebhookDelivery(id);
      if (r.succeeded) success('Delivered.');
      else toastError(r.error ?? `Your server answered ${r.responseCode}.`);
      await load();
    } catch (err) {
      toastError(errorMessage(err, 'Could not resend the delivery'));
    } finally {
      setResending(null);
    }
  };

  return (
    <div className="space-y-10">
      <section className="border-t-2 border-ink pt-5 space-y-4 max-w-2xl">
        <div>
          <h2 className="font-display text-lg font-semibold">Add a webhook</h2>
          <p className="text-xs text-muted mt-1">
            We send a signed POST to your URL when something happens in a project. If your server does not answer with a 2xx status, we try again after 1 minute, 5 minutes, 30 minutes and 2 hours.
          </p>
        </div>

        {newSecret && (
          <div className="p-4 rounded-md border border-amber-300 bg-amber-50 text-xs space-y-2" role="status">
            <div className="font-bold text-amber-900">Copy your signing secret now. It is not shown again.</div>
            <div className="text-amber-900 break-all">{newSecret.url}</div>
            <div className="font-mono text-[11px] bg-white border border-amber-200 rounded-md p-2 break-all select-all">{newSecret.secret}</div>
            <button type="button" onClick={() => setNewSecret(null)} className="text-amber-900 font-semibold underline cursor-pointer">
              I have saved it
            </button>
          </div>
        )}

        <form onSubmit={handleAdd} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-ink mb-1" htmlFor="wh-project">Project</label>
            <select
              id="wh-project"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 bg-paper border border-line rounded-md"
            >
              {orgData?.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.apiKeyPrefix})
                </option>
              ))}
            </select>
            {orgData && orgData.projects.length === 0 && <span className="block text-muted mt-1">Create a project first.</span>}
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1" htmlFor="wh-url">Endpoint URL</label>
            <input
              id="wh-url"
              type="url"
              placeholder="https://api.yourdomain.com/webhooks/nexora"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 bg-paper border border-line rounded-md"
              required
            />
            <span className="block text-muted mt-1">Must be a public https address. Local and private addresses are not allowed.</span>
          </div>

          <fieldset>
            <legend className="font-semibold text-ink mb-1">Events</legend>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {EVENTS.map((ev) => (
                <label key={ev.name} className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={chosen.has(ev.name)} onChange={() => toggle(ev.name)} className="mt-0.5" />
                  <span>
                    <span className="font-mono text-[11px] text-ink">{ev.name}</span>
                    <span className="block text-muted">{ev.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={saving || !selectedProjectId || chosen.size === 0}
            className="px-5 py-2.5 bg-accent hover:bg-accent-deep text-white font-semibold rounded-md text-xs disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Adding...' : 'Add webhook'}
          </button>
        </form>
      </section>

      <section aria-labelledby="endpoints-heading">
        <h3 id="endpoints-heading" className="font-display text-base font-semibold">Your webhooks</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">URL</th>
                <th scope="col">Project</th>
                <th scope="col">Events</th>
                <th scope="col"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((ep) => (
                <tr key={ep.id}>
                  <td className="font-mono text-xs break-all">{ep.url}</td>
                  <td>{ep.projectName}</td>
                  <td className="text-muted">{ep.events.includes('*') ? 'All events' : ep.events.join(', ')}</td>
                  <td>
                    <button onClick={() => handleDelete(ep.id, ep.url)} className="text-xs font-semibold text-red-700 hover:underline cursor-pointer">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {orgData && endpoints.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">No webhooks yet. Add one above to start receiving events.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="deliveries-heading">
        <h3 id="deliveries-heading" className="font-display text-base font-semibold">Recent deliveries</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Event</th>
                <th scope="col">Endpoint</th>
                <th scope="col">Status</th>
                <th scope="col">Response</th>
                <th scope="col"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => {
                const status = statusOf(d);
                return (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap">{time(d.createdAt)}</td>
                    <td className="font-mono text-xs">{d.eventType}</td>
                    <td className="font-mono text-xs break-all">{d.endpoint.url}</td>
                    <td className={`font-semibold ${status.tone}`}>{status.label}</td>
                    <td className="text-muted">{d.succeeded ? d.responseCode : (d.lastError ?? '-')}</td>
                    <td>
                      {!d.succeeded && d.attempt > 0 && (
                        <button
                          onClick={() => handleResend(d.id)}
                          disabled={resending === d.id}
                          className="text-xs font-semibold text-accent hover:underline disabled:opacity-50 cursor-pointer"
                        >
                          {resending === d.id ? 'Sending...' : 'Resend'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted">No deliveries yet. They appear here as events happen in your projects.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
