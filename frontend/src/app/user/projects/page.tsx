'use client';

import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Copy, Check, AlertCircle, Shield, Globe, Save } from 'lucide-react';
import {
  fetchOrganizationData,
  createNewProject,
  rotateProjectSecret,
  updateProjectIpAllowlist,
  OrganizationData, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

export default function UserProjectsPage() {
  const { success, error: toastError, info, confirm } = useToast();
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // New Project Modal State
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectEnv, setNewProjectEnv] = useState<'PRODUCTION' | 'SANDBOX'>('PRODUCTION');
  const [createdSecretAlert, setCreatedSecretAlert] = useState<{ key: string; secret: string } | null>(null);
  const [ipInputs, setIpInputs] = useState<{ [projectId: string]: string }>({});
  const [savingIp, setSavingIp] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const data = await fetchOrganizationData();
      setOrgData(data);
      const initialIps: { [id: string]: string } = {};
      data?.projects?.forEach((p) => {
        const ips = Array.isArray(p.ipAllowlist) ? p.ipAllowlist : [];
        initialIps[p.id] = ips.join(', ');
      });
      setIpInputs(initialIps);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, []);

  const handleSaveIpAllowlist = async (projectId: string) => {
    setSavingIp(projectId);
    try {
      const raw = ipInputs[projectId] || '';
      const list = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await updateProjectIpAllowlist(projectId, list);
      success('Security IP allowlist updated successfully');
      loadData();
    } catch (err) {
      toastError(errorMessage(err,'Failed to update IP allowlist'));
    } finally {
      setSavingIp(null);
    }
  };

  const handleCopy = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(identifier);
    success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createNewProject(newProjectName, newProjectEnv);
      setCreatedSecretAlert({
        key: res.project.apiKeyPrefix,
        secret: res.rawSecret,
      });
      setShowNewProjectModal(false);
      setNewProjectName('');
      success('New project created successfully');
      loadData();
    } catch (err) {
      toastError(errorMessage(err,'Failed to create project'));
    }
  };

  const handleRotateSecret = async (projectId: string) => {
    const ok = await confirm({
      title: 'Rotate API secret?',
      message: 'The previous secret will continue working for a 24-hour grace window.',
      confirmLabel: 'Rotate',
    });
    if (!ok) return;
    try {
      const res = await rotateProjectSecret(projectId);
      setCreatedSecretAlert({
        key: 'Rotated Secret',
        secret: res.newSecret,
      });
      info(`New Secret Generated. Previous secret expires at ${new Date(res.graceWindowExpiresAt).toLocaleString()}`);
      loadData();
    } catch (err) {
      toastError(errorMessage(err,'Failed to rotate secret'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-ink text-lg">Your RTC Projects</h2>
          <p className="text-xs text-muted">Each project has isolated API keys, storage configs, and room quotas.</p>
        </div>
        <button
          onClick={() => setShowNewProjectModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-deep text-white font-bold text-xs rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Create New Project
        </button>
      </div>

      {createdSecretAlert && (
        <div className="p-5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 space-y-2">
          <div className="font-bold flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            Save Your API Secret Now (It will not be displayed again):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 bg-white rounded-lg border border-amber-200">
              <span className="text-slate-400 block text-[10px]">API Key:</span>
              {createdSecretAlert.key}
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-amber-200 font-bold text-amber-800">
              <span className="text-slate-400 block text-[10px]">API Secret:</span>
              {createdSecretAlert.secret}
            </div>
          </div>
          <button
            onClick={() => setCreatedSecretAlert(null)}
            className="text-xs font-bold text-amber-800 hover:underline pt-1 cursor-pointer"
          >
            I have saved these credentials safely ✕
          </button>
        </div>
      )}

      {/* Projects List */}
      <div className="space-y-4">
        {orgData?.projects.map((proj) => (
          <div key={proj.id} className="border-t-2 border-ink pt-5 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <div className="font-bold text-ink text-sm flex items-center gap-2">
                  <span>{proj.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    proj.environment === 'PRODUCTION' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {proj.environment}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Project ID: {proj.id}</div>
              </div>

              <button
                onClick={() => handleRotateSecret(proj.id)}
                className="px-3 py-1.5 bg-paper-deep hover:bg-line text-ink font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Rotate Secret (24h Grace)
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3.5 bg-paper rounded-md border border-line flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-sans font-semibold text-slate-400">x-api-key</div>
                  <div className="text-ink font-bold mt-0.5">{proj.apiKeyPrefix}</div>
                </div>
                <button
                  onClick={() => handleCopy(proj.apiKeyPrefix, `${proj.id}-key`)}
                  className="p-1.5 hover:bg-line rounded-lg text-muted hover:text-ink cursor-pointer"
                >
                  {copiedKey === `${proj.id}-key` ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              <div className="p-3.5 bg-paper rounded-md border border-line flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-sans font-semibold text-slate-400">x-api-secret</div>
                  <div className="text-muted italic mt-0.5">•••••••••••••••••••••••• (Hashed)</div>
                </div>
                <div className="text-[11px] font-sans text-slate-400">
                  {proj.previousSecretExpiresAt ? 'Grace Active' : 'Active'}
                </div>
              </div>
            </div>

            {/* IP Allowlist / Whitelist Security */}
            <div className="p-4 rounded-md bg-paper/80 border border-line space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                  <Shield className="h-3.5 w-3.5 text-accent" />
                  <span>Origin Security IP Allowlist (Whitelist)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-sans">
                  Comma-separated CIDRs / IPs (e.g. 192.168.1.1, 10.0.0.0/24)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Globe className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Leave blank to allow all server IPs, or enter: 203.0.113.19, 198.51.100.4"
                    value={ipInputs[proj.id] ?? ''}
                    onChange={(e) => setIpInputs({ ...ipInputs, [proj.id]: e.target.value })}
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-line rounded-lg text-xs font-mono text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <button
                  onClick={() => handleSaveIpAllowlist(proj.id)}
                  disabled={savingIp === proj.id}
                  className="px-3 py-1.5 bg-accent hover:bg-accent-deep text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <Save className="h-3 w-3" />
                  {savingIp === proj.id ? 'Saving...' : 'Save IPs'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CREATE NEW PROJECT MODAL */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-console/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4 border border-line">
            <h3 className="font-bold text-ink text-base">Create New Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">Project Name</label>
                <input
                  type="text"
                  placeholder="e.g. Telehealth Mobile App"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-line rounded-md text-ink"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Environment</label>
                <select
                  value={newProjectEnv}
                  onChange={(e) => setNewProjectEnv(e.target.value as typeof newProjectEnv)}
                  className="w-full px-3 py-2 bg-paper border border-line rounded-md text-ink"
                >
                  <option value="PRODUCTION">Production</option>
                  <option value="SANDBOX">Sandbox</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="px-4 py-2 bg-paper-deep hover:bg-line text-ink rounded-md font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent hover:bg-accent-deep text-white rounded-md font-bold cursor-pointer"
                >
                  Generate Project & Keys
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
