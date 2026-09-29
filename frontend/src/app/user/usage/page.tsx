'use client';

import { useEffect, useState } from 'react';
import { Clock, HardDrive } from 'lucide-react';
import { fetchUsageAndRecordings } from '@/lib/api';
import type { UsageLogEntry, RecordingEntry } from '@/lib/types';

export default function UserUsagePage() {
  const [usageLogs, setUsageLogs] = useState<UsageLogEntry[]>([]);
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    fetchUsageAndRecordings()
      .then((res) => {
        setUsageLogs(res.usageLogs || []);
        setRecordings(res.recordings || []);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Session Usage Logs */}
      <div className="bg-white p-6 rounded-lg border border-line shadow-sm space-y-4">
        <div>
          <h2 className="font-bold text-ink text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-accent" />
            Session Usage Logs & Billing Attribution
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Per-minute participant billing derived in real-time from LiveKit SFU room webhooks.
          </p>
        </div>

        <div className="overflow-x-auto border border-line rounded-md">
          <table className="w-full text-left text-xs">
            <thead className="bg-paper border-b border-line text-muted font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3">Room Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Participant</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Rate</th>
                <th className="p-3">Deducted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-ink">
              <tr className="hover:bg-paper/50">
                <td className="p-3 font-bold text-ink font-sans">demo-room-alpha</td>
                <td className="p-3"><span className="px-2 py-0.5 rounded bg-accent/10 text-accent-deep font-sans text-[10px] font-bold">VIDEO_CALL</span></td>
                <td className="p-3">user-tester</td>
                <td className="p-3">180s (3m)</td>
                <td className="p-3">₹0.0040/m</td>
                <td className="p-3 text-emerald-600 font-bold">₹0.0120</td>
              </tr>
              {usageLogs.map((log) => (
                <tr key={log.id} className="hover:bg-paper/50">
                  <td className="p-3 font-bold text-ink font-sans">{log.roomName}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-accent/10 text-accent-deep font-sans text-[10px] font-bold">{log.roomType}</span></td>
                  <td className="p-3">{log.participantIdentity}</td>
                  <td className="p-3">{log.billableSeconds ? `${log.billableSeconds}s` : 'Active'}</td>
                  <td className="p-3">₹{log.ratePerMinute}</td>
                  <td className="p-3 text-emerald-600 font-bold">₹{log.amountDeducted || '0.00'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* BYOS Recordings */}
      <div className="bg-white p-6 rounded-lg border border-line shadow-sm space-y-4">
        <div>
          <h2 className="font-bold text-ink text-base flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-emerald-600" />
            BYOS Direct Upload Recordings
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Zero files stored on Nexora servers. Streamed straight to your encrypted S3, R2, or GCS bucket.
          </p>
        </div>

        <div className="overflow-x-auto border border-line rounded-md">
          <table className="w-full text-left text-xs">
            <thead className="bg-paper border-b border-line text-muted font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3">Room Name</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Bucket & Object Key</th>
                <th className="p-3">Status</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-ink">
              <tr className="hover:bg-paper/50">
                <td className="p-3 font-bold text-ink font-sans">telehealth-call-902</td>
                <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-sans text-[10px] font-bold">GOOGLE_CLOUD</span></td>
                <td className="p-3 text-[11px] text-muted">gs://nexora-vault/recordings/room-902.mp4</td>
                <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-sans text-[10px] font-bold">COMPLETED</span></td>
                <td className="p-3">
                  <span className="text-[11px] text-accent font-sans font-semibold">Direct in your GCS</span>
                </td>
              </tr>
              {recordings.map((rec) => (
                <tr key={rec.id} className="hover:bg-paper/50">
                  <td className="p-3 font-bold text-ink font-sans">{rec.roomName}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-sans text-[10px] font-bold">{rec.storageProvider}</span></td>
                  <td className="p-3 text-[11px] text-muted">{rec.bucketName}/{rec.objectKey}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-sans text-[10px] font-bold">{rec.status}</span></td>
                  <td className="p-3">
                    <span className="text-[11px] text-accent font-sans font-semibold">Direct in your bucket</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
