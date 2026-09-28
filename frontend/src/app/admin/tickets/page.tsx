'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import {
  HelpCircle,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  User,
  Shield,
} from 'lucide-react';
import { fetchAdminTickets, replyAdminTicket } from '@/lib/api';

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [newStatus, setNewStatus] = useState<string>('IN_PROGRESS');
  const [replyLoading, setReplyLoading] = useState(false);

  const loadData = () => {
    setLoading(true);
    fetchAdminTickets()
      .then((data) => {
        setTickets(data);
        if (selectedTicket) {
          const fresh = data.find((t: any) => t.id === selectedTicket.id);
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
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to send reply');
    } finally {
      setReplyLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
          <HelpCircle className="h-6 w-6 text-blue-600" />
          <span>Support Ticket Triage & Helpdesk</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Review inbound customer inquiries, WebRTC integration issues, and reply directly as Nexora Staff.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Tickets List */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Inbox ({tickets.length})
            </span>
            <button
              onClick={loadData}
              className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
            >
              Refresh
            </button>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
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
                      isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 line-clamp-1">{t.subject}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.status === 'RESOLVED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : t.status === 'IN_PROGRESS'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{t.description}</div>
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
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          {selectedTicket ? (
            <>
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{selectedTicket.subject}</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      From: <strong>{selectedTicket.organization?.name}</strong> ({selectedTicket.organization?.billingEmail})
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      selectedTicket.status === 'RESOLVED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {selectedTicket.status}
                  </span>
                </div>
              </div>

              {/* Message History */}
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-2">
                {/* Initial Description */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs">
                  <div className="font-bold text-slate-700 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-slate-500" />
                    <span>Customer Original Request:</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{selectedTicket.description}</p>
                </div>

                {/* Follow-up messages */}
                {selectedTicket.messages && selectedTicket.messages.map((m: any) => {
                  const isStaff = m.senderType === 'STAFF';
                  return (
                    <div
                      key={m.id}
                      className={`p-3.5 rounded-xl text-xs space-y-1 ${
                        isStaff
                          ? 'bg-blue-50 border border-blue-200 ml-8 text-blue-950'
                          : 'bg-slate-50 border border-slate-200 mr-8 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="flex items-center gap-1">
                          {isStaff ? <Shield className="h-3.5 w-3.5 text-blue-600" /> : <User className="h-3.5 w-3.5 text-slate-500" />}
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
              <form onSubmit={handleSendReply} className="space-y-4 pt-4 border-t border-slate-100 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Reply as Staff Operator
                  </label>
                  <textarea
                    rows={3}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type official response or instructions for the developer..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl resize-none text-xs"
                    required
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-slate-700">Update Status:</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
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
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
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
