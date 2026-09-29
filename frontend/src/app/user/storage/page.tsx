'use client';

import { useEffect, useState } from 'react';
import { HardDrive, CheckCircle2 } from 'lucide-react';
import { fetchOrganizationData, saveStorage, OrganizationData, errorMessage, type StorageConfig } from '@/lib/api';
import type {  } from '@/lib/types';

export default function UserStoragePage() {
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [storageProvider, setStorageProvider] = useState<'AWS_S3' | 'CLOUDFLARE_R2' | 'GOOGLE_CLOUD'>('GOOGLE_CLOUD');
  const [bucketName, setBucketName] = useState('');
  const [region, setRegion] = useState('asia-south1');
  const [endpoint, setEndpoint] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [gcsServiceAccountJson, setGcsServiceAccountJson] = useState('');
  const [storageSuccess, setStorageSuccess] = useState(false);

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

  const handleSaveStorage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    try {
      await saveStorage(selectedProject.id, {
        provider: storageProvider,
        bucketName,
        region,
        endpoint: storageProvider === 'CLOUDFLARE_R2' ? endpoint : undefined,
        accessKey: storageProvider !== 'GOOGLE_CLOUD' ? accessKey : undefined,
        secretKey: storageProvider !== 'GOOGLE_CLOUD' ? secretKey : undefined,
        gcsServiceAccountJson: storageProvider === 'GOOGLE_CLOUD' ? gcsServiceAccountJson : undefined,
      });
      setStorageSuccess(true);
      setTimeout(() => setStorageSuccess(false), 3000);
      fetchOrganizationData().then((d) => setOrgData(d));
    } catch (err) {
      alert(errorMessage(err,'Failed to save storage'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border border-line shadow-sm space-y-6">
        <div>
          <h2 className="font-bold text-ink text-lg flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-accent" />
            Bring Your Own Storage (BYOS)
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Recordings are encrypted in-transit and streamed directly to your cloud bucket. Nexora never stores your customer audio/video files at rest.
          </p>
        </div>

        {storageSuccess && (
          <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Storage credentials encrypted and verified successfully!
          </div>
        )}

        <form onSubmit={handleSaveStorage} className="space-y-4 max-w-xl text-xs">
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
            <label className="block font-semibold text-ink mb-1">Storage Provider</label>
            <select
              value={storageProvider}
              onChange={(e) => setStorageProvider(e.target.value as typeof storageProvider)}
              className="w-full px-3 py-2 bg-paper border border-line rounded-md font-medium"
            >
              <option value="GOOGLE_CLOUD">Google Cloud Storage (GCS Bucket)</option>
              <option value="AWS_S3">Amazon Web Services (AWS S3)</option>
              <option value="CLOUDFLARE_R2">Cloudflare R2 (S3-Compatible)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">Bucket Name</label>
            <input
              type="text"
              placeholder="e.g. nexora-recordings-prod"
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
              className="w-full px-3 py-2 bg-paper border border-line rounded-md"
              required
            />
          </div>

          {storageProvider === 'GOOGLE_CLOUD' ? (
            <div>
              <label className="block font-semibold text-ink mb-1">
                GCS Service Account JSON Key (gcs-key.json)
              </label>
              <textarea
                rows={4}
                placeholder='{"type": "service_account", "project_id": "...", "private_key": "..."}'
                value={gcsServiceAccountJson}
                onChange={(e) => setGcsServiceAccountJson(e.target.value)}
                className="w-full px-3 py-2 bg-paper border border-line rounded-md font-mono text-[11px]"
                required
              />
              <span className="text-[10px] text-slate-400">
                Encrypted via AES-256-GCM. Used strictly by LiveKit Egress workers to upload recording files.
              </span>
            </div>
          ) : (
            <>
              <div>
                <label className="block font-semibold text-ink mb-1">Region</label>
                <input
                  type="text"
                  placeholder="ap-south-1"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-line rounded-md"
                  required
                />
              </div>

              {storageProvider === 'CLOUDFLARE_R2' && (
                <div>
                  <label className="block font-semibold text-ink mb-1">Custom S3 Endpoint URL</label>
                  <input
                    type="url"
                    placeholder="https://<accountid>.r2.cloudflarestorage.com"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-line rounded-md"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">Access Key ID</label>
                  <input
                    type="text"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-line rounded-md font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-ink mb-1">Secret Access Key</label>
                  <input
                    type="password"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-line rounded-md font-mono"
                    required
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            className="px-6 py-2.5 bg-accent hover:bg-accent-deep text-white font-bold rounded-md text-xs shadow-sm transition-all cursor-pointer"
          >
            Verify & Save {storageProvider === 'GOOGLE_CLOUD' ? 'GCS Bucket' : 'Storage'}
          </button>
        </form>

        {/* Dynamic Configured BYOS Buckets from DB */}
        <div className="pt-6 border-t border-line space-y-3">
          <span className="font-bold text-xs text-ink">Active Configured Storage Buckets (BYOS)</span>
          <div className="space-y-2">
            {orgData?.projects.flatMap((p) => p.storageConfigs || []).length === 0 ? (
              <div className="p-4 rounded-md bg-paper border border-line text-slate-400 text-xs text-center">
                No BYOS buckets configured yet. Save a bucket above to enable direct egress recording uploads.
              </div>
            ) : (
              orgData?.projects.flatMap((p) => p.storageConfigs || []).map((cfg: StorageConfig) => (
                <div key={cfg.id} className="p-3.5 rounded-md border border-line bg-paper/50 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-ink flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent/10 text-accent-deep border border-accent/30">
                        {cfg.provider}
                      </span>
                      <span className="font-mono text-ink">{cfg.bucketName}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Region: {cfg.region || 'global'} • Encryption: AES-256-GCM
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Connected
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
