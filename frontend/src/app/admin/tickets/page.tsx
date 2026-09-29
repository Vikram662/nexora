'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { HelpCircle, MessageSquare, Send, User, Shield } from 'lucide-react';
import { fetchAdminTickets, replyAdminTicket, errorMessage } from '@/lib/api';
import type { SupportTicket, TicketMessage } from '@/lib/types';
import { useToast } from '@/components/ToastProvider';

export default function AdminTicketsPage() {
  const { success, error: toastError } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [newStatus, setNewStatus] = useState<string>('IN_PROGRESS');
  const [replyLoading, setReplyLoading] = useState(false);

  const loadData = () => {
    fetchAdminTickets()
      .then((data) => {
        setTickets(data);
        if (selectedTicket) {
          const fresh = data.find((t: SupportTicket) => t.id === selectedTicket.id);
          if (fresh) setSelectedTicket(fresh);
        }
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    setReplyLoading(true);
    try {
      await replyAdminTicket(selectedTicket.id, replyMessage.trim(), newStatus);
      setReplyMessage('');
      success('Ticket reply sent successfully');
      loadData();
    } catch (err) {
      toastError(errorMessage(err, 'Failed to send reply'));
    } finally {
      setReplyLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight flex items-center gap-2.5">
          <HelpCircle className="h-6 w-6 text-accent" />
          <span>Support Ticket Triage & Helpdesk</span>
        </h1>
        <p className="text-xs text-muted mt-1">
          Review inbound customer inquiries, WebRTC integration issues, and reply directly as Nexora Staff.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Tickets List */}
        <div className="lg:col-span-5 bg-white rounded-lg border border-line shadow-sm overflow-hidden divide-y divide-line">
          <div className="p-4 bg-paper border-b border-line flex items-center justify-between">
            <span className="text-xs font-bold text-ink uppercase tracking-wider">
              Inbox ({tickets.length})
            </span>
            <button
              onClick={loadData}
              className="text-xs text-accent font-semibold hover:underline cursor-pointer"
            >
              Refresh
            </button>
          </div>

          <div className="divide-y divide-line max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">No support tickets found.</div>
            ) : (
              tickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTicket(t);
                      setNewStatus(t.status);
                    }}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-accent/10 border-l-4 border-accent' : 'hover:bg-paper'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-ink line-clamp-1">{t.subject}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.status === 'RESOLVED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : t.status === 'IN_PROGRESS'
                            ? 'bg-accent/10 text-accent-deep border border-accent/30'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted mt-1 line-clamp-2">{t.description}</div>
                    <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
                      <span>{t.organization?.name || 'Customer'}</span>
                      <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Ticket Chat & Reply Pane */}
        <div className="lg:col-span-7 bg-white rounded-lg border border-line shadow-sm p-6 space-y-6">
          {selectedTicket ? (
            <>
              <div className="border-b border-line pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-ink">{selectedTicket.subject}</h2>
                    <p className="text-xs text-muted mt-1">
                      From: <strong>{selectedTicket.organization?.name}</strong> ({selectedTicket.organization?.billingEmail})
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      selectedTicket.status === 'RESOLVED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-accent/10 text-accent-deep border border-accent/30'
                    }`}
                  >
                    {selectedTicket.status}
                  </span>
                </div>
              </div>

              {/* Message History */}
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-2">
                {/* Initial Description */}
                <div className="p-3.5 rounded-md bg-paper border border-line space-y-1.5 text-xs">
                  <div className="font-bold text-ink flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted" />
                    <span>Customer Original Request:</span>
                  </div>
                  <p className="text-muted leading-relaxed">{selectedTicket.description}</p>
                </div>

                {/* Follow-up messages */}
                {selectedTicket.messages && selectedTicket.messages.map((m: TicketMessage) => {
                  const isStaff = m.senderType === 'STAFF';
                  return (
                    <div
                      key={m.id}
                      className={`p-3.5 rounded-md text-xs space-y-1 ${
                        isStaff
                          ? 'bg-accent/10 border border-accent/30 ml-8 text-ink'
                          : 'bg-paper border border-line mr-8 text-ink'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="flex items-center gap-1">
                          {isStaff ? <Shield className="h-3.5 w-3.5 text-accent" /> : <User className="h-3.5 w-3.5 text-muted" />}
                          {m.senderName || (isStaff ? 'Staff Support' : 'Customer')}
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="leading-relaxed">{m.message}</p>
                    </div>
                  );
                })}
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply} className="space-y-4 pt-4 border-t border-line text-xs">
                <div>
                  <label className="block font-semibold text-ink mb-1">
                    Reply as Staff Operator
                  </label>
                  <textarea
                    rows={3}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type official response or instructions for the developer..."
                    className="w-full px-3 py-2 bg-paper border border-line rounded-md resize-none text-xs"
                    required
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-ink">Update Status:</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="px-2.5 py-1.5 bg-paper border border-line rounded-lg text-xs font-semibold"
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="IN_PROGRESS">IN_PROGRESS</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={replyLoading || !replyMessage.trim()}
                    className="px-4 py-2 bg-accent hover:bg-accent-deep text-white font-bold rounded-md shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{replyLoading ? 'Sending...' : 'Send Staff Response'}</span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="py-24 text-center text-slate-400 text-xs">
              <MessageSquare className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <p>Select a ticket from the inbox to review and respond.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
