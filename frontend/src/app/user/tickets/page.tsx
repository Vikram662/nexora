'use client';

import { useEffect, useState } from 'react';
import { HelpCircle, CheckCircle2 } from 'lucide-react';
import { fetchSupportTickets, createSupportTicket, errorMessage } from '@/lib/api';
import type { SupportTicket } from '@/lib/types';

export default function UserTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState<'MEDIA_QUALITY' | 'RECORDING_EGRESS' | 'BILLING_WALLET' | 'API_INTEGRATION'>('API_INTEGRATION');
  const [ticketPriority, setTicketPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketSuccess, setTicketSuccess] = useState(false);
  const [, setLoading] = useState(true);

  const loadTickets = async () => {
    try {
      const tks = await fetchSupportTickets();
      setTickets(tks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadTickets);
  }, []);

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSupportTicket({
        subject: ticketSubject,
        category: ticketCategory,
        priority: ticketPriority,
        message: ticketMessage,
      });
      setTicketSuccess(true);
      setTicketSubject('');
      setTicketMessage('');
      setTimeout(() => setTicketSuccess(false), 4000);
      loadTickets();
    } catch (err) {
      alert(errorMessage(err,'Failed to submit ticket'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-line shadow-sm space-y-6">
        <div>
          <h2 className="font-bold text-ink text-lg flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-accent" />
            Developer Support & Technical Helpdesk
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Open a direct support inquiry with our WebRTC infrastructure engineers.
          </p>
        </div>

        {ticketSuccess && (
          <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Support ticket submitted successfully! Our on-call engineers are reviewing.
          </div>
        )}

        {/* Create Ticket Form */}
        <form onSubmit={handleTicketSubmit} className="space-y-4 max-w-2xl text-xs bg-paper p-5 rounded-md border border-line">
          <div className="font-bold text-ink">Open a New Ticket</div>
          <div>
            <label className="block font-semibold text-ink mb-1">Subject</label>
            <input
              type="text"
              placeholder="e.g. BYOS Cloudflare R2 recording upload timeout"
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-line rounded-md text-ink"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-ink mb-1">Category</label>
              <select
                value={ticketCategory}
                onChange={(e) => setTicketCategory(e.target.value as typeof ticketCategory)}
                className="w-full px-3 py-2 bg-white border border-line rounded-md font-semibold text-ink"
              >
                <option value="API_INTEGRATION">API & Token Integration</option>
                <option value="MEDIA_QUALITY">WebRTC SFU Quality / Latency</option>
                <option value="RECORDING_EGRESS">BYOS Recording / Egress Upload</option>
                <option value="BILLING_WALLET">Prepaid Billing & GST Invoices</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Priority</label>
              <select
                value={ticketPriority}
                onChange={(e) => setTicketPriority(e.target.value as typeof ticketPriority)}
                className="w-full px-3 py-2 bg-white border border-line rounded-md font-semibold text-ink"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent (Production Down)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">Message / Logs</label>
            <textarea
              rows={4}
              placeholder="Describe the issue, include roomName, participant identity, and error logs..."
              value={ticketMessage}
              onChange={(e) => setTicketMessage(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-line rounded-md text-ink"
              required
            />
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-accent hover:bg-accent-deep text-white font-bold rounded-md text-xs shadow-sm transition-all cursor-pointer"
          >
            Submit Ticket
          </button>
        </form>

        {/* Tickets List */}
        <div className="space-y-3">
          <div className="font-bold text-xs text-ink">Your Support Tickets</div>
          <div className="border border-line rounded-md overflow-hidden divide-y divide-line text-xs">
            <div className="p-3 bg-paper font-semibold text-muted flex justify-between uppercase text-[10px]">
              <span>Ticket # / Subject</span>
              <span>Category</span>
              <span>Status</span>
            </div>

            {tickets.length > 0 ? (
              tickets.map((tk) => (
                <div key={tk.id} className="p-3.5 flex justify-between items-center hover:bg-paper/50">
                  <div>
                    <div className="font-bold text-ink flex items-center gap-2">
                      <span className="font-mono text-accent">{tk.ticketNumber}</span>
                      <span>{tk.subject}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Priority: <strong className="text-ink">{tk.priority}</strong> • {new Date(tk.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 bg-paper-deep text-ink rounded-full font-medium text-[10px]">
                    {tk.category}
                  </span>
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[10px]">
                    {tk.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-slate-400 italic">
                No open tickets. Need help? Use the form above to reach support engineers.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
