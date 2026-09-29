'use client';

import { useEffect, useState } from 'react';
import { Video, Terminal, Activity, Zap, Radio } from 'lucide-react';

import { fetchOrganizationData, mintRtcToken, OrganizationData } from '@/lib/api';
import ActiveCallRoom from '@/components/ActiveCallRoom';

export default function UserSandboxPage() {
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [roomName, setRoomName] = useState('demo-room-alpha');
  const [identity, setIdentity] = useState(() => `user-${Math.floor(100 + Math.random() * 900)}`);
  const [mintLoading, setMintLoading] = useState(false);
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState(() => process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880');
  const [inCall, setInCall] = useState(false);
  const [callMode, setCallMode] = useState<'video' | 'audio' | 'broadcast'>('video');
  const [broadcastRole, setBroadcastRole] = useState<'host' | 'audience'>('host');




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

  const [apiSecret, setApiSecret] = useState('sk_live_supersecret123');
  const [showSecret, setShowSecret] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleMintToken = async (e?: any) => {
    if (e && e.preventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }
    const apiKeyToUse = selectedProject?.apiKeyPrefix || 'pk_live_nexora_test';
    setErrorMessage(null);
    setMintLoading(true);
    try {
      const res = await mintRtcToken({
        apiKey: apiKeyToUse,

        apiSecret: (apiSecret || 'sk_live_supersecret123').trim(),
        roomName: (roomName || 'demo-room-alpha').trim(),
        participantIdentity: (identity || 'user-tester').trim(),
      });

      if (res && res.data && res.data.token) {
        setMintedToken(res.data.token);
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
        const serverUrl = `ws://${currentHost}:7880`;
        setLivekitUrl(serverUrl);
      } else {
        throw new Error('Token not returned from server');
      }
    } catch (err: any) {
      console.error('Mint token error:', err);
      const msg = err?.message || 'Token generation failed. Check API secret or network.';
      setErrorMessage(msg);
    } finally {
      setMintLoading(false);
    }
  };




  return (
    <div className="space-y-6">
      {inCall && mintedToken ? (
        <ActiveCallRoom
          token={mintedToken}
          livekitUrl={livekitUrl}
          roomName={roomName}
          callMode={callMode}
          isHost={broadcastRole === 'host'}
          onLeave={() => {
            setInCall(false);
            setMintedToken(null);
            // Generate a fresh identity for the next call so page reload is not needed
            setIdentity(`user-${Math.floor(100 + Math.random() * 900)}`);
          }}
          onError={(msg) => {
            setInCall(false);
            setMintedToken(null);
            setErrorMessage(msg);
            setIdentity(`user-${Math.floor(100 + Math.random() * 900)}`);
          }}
        />


      ) : (

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Token Issue Form */}
          <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div>
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Video className="h-5 w-5 text-blue-600" />
                LiveKit Room Generator
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Issue authentic WebRTC tokens and start an in-browser audio/video call.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-start gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500 mt-1 shrink-0"></span>
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleMintToken} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Project</label>
                <select
                  value={selectedProjectId || orgData?.projects?.[0]?.id || 'seed_project'}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                >
                  {orgData?.projects && orgData.projects.length > 0 ? (
                    orgData.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.apiKeyPrefix})
                      </option>
                    ))
                  ) : (
                    <option value="seed_project">Default Test Project (pk_live_nexora_test)</option>
                  )}
                </select>
              </div>

              {/* Call Type Mode (Video vs Audio Call vs Live Broadcasting) */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">WebRTC Streaming Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCallMode('video')}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      callMode === 'video'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Video className="h-3.5 w-3.5" />
                    Video Call
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallMode('audio')}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      callMode === 'audio'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Activity className="h-3.5 w-3.5" />
                    Voice Call
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallMode('broadcast')}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      callMode === 'broadcast'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Radio className="h-3.5 w-3.5 animate-pulse" />
                    Live Broadcast
                  </button>
                </div>

                {callMode === 'broadcast' && (
                  <div className="mt-2 p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1.5">
                    <div className="text-[11px] font-bold text-indigo-950 flex items-center justify-between">
                      <span>Broadcast Role:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setBroadcastRole('host')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            broadcastRole === 'host'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          Host (Streamer)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBroadcastRole('audience')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            broadcastRole === 'audience'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          Audience (Viewer)
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-indigo-800">
                      {broadcastRole === 'host'
                        ? 'Host transmits HD video & audio to unlimited concurrent viewers.'
                        : 'Audience receives ultra-low latency (<200ms) live stream without sharing camera/mic.'}
                    </p>
                  </div>
                )}
              </div>



              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Project API Secret</label>
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="text-[11px] text-blue-600 hover:underline font-semibold"
                  >
                    {showSecret ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="sk_live_..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px]"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Seed key: <code className="text-slate-600 font-mono">sk_live_supersecret123</code>
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Room Name</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Participant Identity</label>
                <input
                  type="text"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  required
                />
              </div>

              <button
                type="button"
                onClick={(e) => handleMintToken(e)}
                disabled={mintLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {mintLoading ? 'Generating WebRTC Token...' : 'Generate Room Token'}
              </button>
            </form>

          </div>


          {/* Sandbox Live Tester View */}
          <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-emerald-600" />
                  Live Testing Console
                </span>
                <span className="text-[11px] font-mono text-slate-400">{livekitUrl}</span>
              </div>

              {mintedToken ? (
                <div className="mt-4 space-y-4">
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                    <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-emerald-600 fill-emerald-600" />
                      LiveKit JWT Token Generated & Ready!
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200 font-mono text-[10px] break-all text-slate-700 max-h-24 overflow-y-auto">
                      {mintedToken}
                    </div>
                  </div>

                  <button
                    onClick={() => setInCall(true)}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Video className="h-4 w-4" />
                    Enter Live Interactive Call Room
                  </button>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-xl mt-4">
                  <Video className="h-8 w-8 text-slate-300 mb-2" />
                  <div className="text-xs font-bold text-slate-600">No Active Token Generated</div>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                    Fill the form on the left to mint an authentic signed LiveKit token and test WebRTC video calling.
                  </p>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500">
              💡 <strong>Developer Tip:</strong> Multiple browser tabs can join the same Room Name to test multi-party audio, video, broadcast streaming, and <strong>in-room real-time text chat (P2P Data Channel)</strong> simultaneously!
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
