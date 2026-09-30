'use client';

import { useEffect, useState } from 'react';
import { fetchUsageAndRecordings } from '@/lib/api';
import type { UsageLogEntry, RecordingEntry } from '@/lib/types';

const ROOM_TYPE_LABEL: Record<string, string> = {
  VIDEO_CALL: 'Video call',
  AUDIO_CALL: 'Voice call',
  LIVE_BROADCAST: 'Live broadcast',
};

export default function UserUsagePage() {
  const [usageLogs, setUsageLogs] = useState<UsageLogEntry[]>([]);
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchUsageAndRecordings()
      .then((res) => {
        setUsageLogs(res.usageLogs || []);
        setRecordings(res.recordings || []);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const emptyRow = (message: string, cols: number) =>
    !loading && (
      <tr>
        <td colSpan={cols} className="text-muted">
          {failed ? 'Could not load this list. Refresh the page to try again.' : message}
        </td>
      </tr>
    );

  return (
    <div className="space-y-10">
      <section aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" className="font-display text-lg font-semibold">Sessions</h2>
        <p className="text-xs text-muted mt-0.5 max-w-xl">
          Each row is one participant. Billing is per started minute, settled when the participant leaves.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Room</th>
                <th scope="col">Type</th>
                <th scope="col">Participant</th>
                <th scope="col">Duration</th>
                <th scope="col">Rate per minute</th>
                <th scope="col">Charged</th>
              </tr>
            </thead>
            <tbody>
              {usageLogs.map((log) => (
                <tr key={log.id}>
                  <td className="font-semibold text-ink">{log.roomName}</td>
                  <td>{(log.roomType && ROOM_TYPE_LABEL[log.roomType]) || log.roomType || '-'}</td>
                  <td className="font-mono text-xs">{log.participantIdentity}</td>
                  <td>
                    {log.billableSeconds ? (
                      `${log.billableSeconds}s`
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="onair-dot" aria-hidden="true" /> Live
                      </span>
                    )}
                  </td>
                  <td>₹{log.ratePerMinute}</td>
                  <td className="font-semibold">₹{log.amountDeducted || '0.00'}</td>
                </tr>
              ))}
              {usageLogs.length === 0 && emptyRow('No sessions yet. Charges appear here after a participant joins a production room.', 6)}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="recordings-heading">
        <h2 id="recordings-heading" className="font-display text-lg font-semibold">Recordings</h2>
        <p className="text-xs text-muted mt-0.5 max-w-xl">
          Files are written straight to your own bucket. Nexora keeps only the record of where they are.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Room</th>
                <th scope="col">Storage</th>
                <th scope="col">Location</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((rec) => (
                <tr key={rec.id}>
                  <td className="font-semibold text-ink">{rec.roomName}</td>
                  <td>{rec.storageProvider}</td>
                  <td className="font-mono text-xs text-muted break-all">
                    {rec.bucketName}/{rec.objectKey}
                  </td>
                  <td>{rec.status}</td>
                </tr>
              ))}
              {recordings.length === 0 && emptyRow('No recordings yet. Connect a bucket in Recording storage, then start a recording from a room.', 4)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
