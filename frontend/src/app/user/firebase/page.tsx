'use client';

import { useEffect, useState } from 'react';
import { Flame, CheckCircle2 } from 'lucide-react';
import { fetchOrganizationData, saveFirebase, OrganizationData, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

export default function UserFirebasePage() {
  const { success, error: toastError } = useToast();
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [fbProjectId, setFbProjectId] = useState('');
  const [fbServiceAccountJson, setFbServiceAccountJson] = useState('');
  const [fbSuccess, setFbSuccess] = useState(false);

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

  const handleSaveFirebase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    try {
      await saveFirebase(selectedProject.id, {
        firebaseProjectId: fbProjectId,
        serviceAccountJson: fbServiceAccountJson,
      });
      setFbSuccess(true);
      success('Firebase configuration saved successfully');
      setTimeout(() => setFbSuccess(false), 3000);
    } catch (err) {
      toastError(errorMessage(err,'Failed to save Firebase config'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-t-2 border-ink pt-5 space-y-6">
        <div>
          <h2 className="font-bold text-ink text-lg flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500" />
            Bring Your Own Firebase (BYOF) for Call Signaling Push
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Wake backgrounded iOS/Android devices when an incoming call starts via your own Firebase Cloud Messaging (FCM).
          </p>
        </div>

        {fbSuccess && (
          <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Firebase configuration encrypted and saved!
          </div>
        )}

        <form onSubmit={handleSaveFirebase} className="space-y-4 max-w-xl text-xs">
          <div>
            <label className="block font-semibold text-ink mb-1">Target Project</label>
            <select
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
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">Firebase Project ID</label>
            <input
              type="text"
              placeholder="my-company-firebase-app"
              value={fbProjectId}
              onChange={(e) => setFbProjectId(e.target.value)}
              className="w-full px-3 py-2 bg-paper border border-line rounded-md"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">
              Firebase Admin Service Account Key (serviceAccountKey.json)
            </label>
            <textarea
              rows={4}
              placeholder='{"type": "service_account", "project_id": "...", "private_key": "..."}'
              value={fbServiceAccountJson}
              onChange={(e) => setFbServiceAccountJson(e.target.value)}
              className="w-full px-3 py-2 bg-paper border border-line rounded-md font-mono text-[11px]"
              required
            />
            <span className="text-[10px] text-slate-400">
              Encrypted with AES-256-GCM. Used strictly for incoming-call push signals.
            </span>
          </div>

          <button
            type="submit"
            className="px-6 py-2.5 bg-accent hover:bg-accent-deep text-white font-bold rounded-md text-xs transition-all cursor-pointer"
          >
            Save Firebase Config
          </button>
        </form>
      </div>
    </div>
  );
}
