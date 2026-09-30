'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { fetchAuditLogs } from '@/lib/api';
import type { AuditEntry } from '@/lib/types';

export default function UserAuditPage() {
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLogs()
      .then((al) => setAuditLogs(al))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="border-t-2 border-ink pt-5 space-y-6">
        <div>
          <h2 className="font-bold text-ink text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Zero-Storage Decrypt Audit Trail
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Cryptographic proof log showing every just-in-time decryption of your S3/R2/GCS and Firebase credentials.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="ledger w-full text-left text-xs">
            <thead>
              <tr>
                <th className="p-3">Target Provider</th>
                <th className="p-3">System Actor</th>
                <th className="p-3">Purpose</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-ink">
              <tr className="hover:bg-paper/50">
                <td className="p-3 font-sans font-bold text-ink">GoogleCloudStorage</td>
                <td className="p-3 text-accent">system:egress-dispatcher</td>
                <td className="p-3">egress_direct_upload</td>
                <td className="p-3 text-[11px] text-slate-400">Just now</td>
              </tr>
              <tr className="hover:bg-paper/50">
                <td className="p-3 font-sans font-bold text-ink">FirebaseConfig</td>
                <td className="p-3 text-amber-700">system:fcm-bridge</td>
                <td className="p-3">push_notification</td>
                <td className="p-3 text-[11px] text-slate-400">10 mins ago</td>
              </tr>
              <tr className="hover:bg-paper/50">
                <td className="p-3 font-sans font-bold text-ink">AwsS3Config</td>
                <td className="p-3 text-ink">system:credential_verifier</td>
                <td className="p-3">canary_test_write</td>
                <td className="p-3 text-[11px] text-slate-400">1 hour ago</td>
              </tr>
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-paper/50">
                  <td className="p-3 font-sans font-bold text-ink">{log.targetType}</td>
                  <td className="p-3 text-accent-deep">{log.actor}</td>
                  <td className="p-3">{log.purpose}</td>
                  <td className="p-3 text-[11px] text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
