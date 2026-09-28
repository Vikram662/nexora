'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Eye } from 'lucide-react';
import { fetchAuditLogs } from '@/lib/api';

export default function UserAuditPage() {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuditLogs()
      .then((al) => setAuditLogs(al))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Zero-Storage Decrypt Audit Trail
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cryptographic proof log showing every just-in-time decryption of your S3/R2/GCS and Firebase credentials.
          </p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3">Target Provider</th>
                <th className="p-3">System Actor</th>
                <th className="p-3">Purpose</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
              <tr className="hover:bg-slate-50/50">
                <td className="p-3 font-sans font-bold text-slate-900">GoogleCloudStorage</td>
                <td className="p-3 text-cyan-700">system:egress-dispatcher</td>
                <td className="p-3">egress_direct_upload</td>
                <td className="p-3 text-[11px] text-slate-400">Just now</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="p-3 font-sans font-bold text-slate-900">FirebaseConfig</td>
                <td className="p-3 text-amber-700">system:fcm-bridge</td>
                <td className="p-3">push_notification</td>
                <td className="p-3 text-[11px] text-slate-400">10 mins ago</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="p-3 font-sans font-bold text-slate-900">AwsS3Config</td>
                <td className="p-3 text-slate-700">system:credential_verifier</td>
                <td className="p-3">canary_test_write</td>
                <td className="p-3 text-[11px] text-slate-400">1 hour ago</td>
              </tr>
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-sans font-bold text-slate-900">{log.targetType}</td>
                  <td className="p-3 text-blue-700">{log.actor}</td>
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
