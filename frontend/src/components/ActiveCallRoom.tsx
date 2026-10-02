'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, VideoPresets, type RemoteParticipant } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, Radio, Shield, Clock, MessageSquare, Send, X } from 'lucide-react';
import { errorMessage } from '@/lib/api';

interface ActiveRoomProps {
  token: string;
  livekitUrl: string;
  roomName: string;
  callMode?: 'video' | 'audio' | 'broadcast';
  isHost?: boolean;
  onLeave: () => void;
  onError?: (errorMessage: string) => void;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isSelf: boolean;
}

export default function ActiveCallRoom({
  token,
  livekitUrl,
  roomName,
  callMode = 'video',
  isHost = true,
  onLeave,
  onError,
}: ActiveRoomProps) {
  const isAudioOnly = callMode === 'audio';
  const isBroadcastAudience = callMode === 'broadcast' && !isHost;
  const [room, setRoom] = useState<Room | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(isAudioOnly || isBroadcastAudience);

  // In-Room Real-time Data Messaging State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [participantCount, setParticipantCount] = useState(1);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [durationSeconds, setDurationSeconds] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteContainerRef = useRef<HTMLDivElement>(null);

  // Latest callbacks live in refs so the connection effect only reconnects when the token or server changes.
  const onLeaveRef = useRef(onLeave);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onLeaveRef.current = onLeave;
    onErrorRef.current = onError;
  });

  const durationRef = useRef(0);
  useEffect(() => {
    durationRef.current = durationSeconds;
  }, [durationSeconds]);

  // Live Call Timer:
  // In video/audio call: Only starts counting when BOTH participants are connected (participantCount >= 2).
  // In broadcast: Host counts from when they go live, and syncs this timestamp with all late-joining viewers!
  const isCallActive = callMode === 'broadcast' 
    ? (status === 'connected') 
    : (status === 'connected' && participantCount >= 2);

  useEffect(() => {
    if (!isCallActive) return;
    const timer = setInterval(() => {
      setDurationSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isCallActive]);

  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) {
      const remMins = mins % 60;
      return `${hrs.toString().padStart(2, '0')}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let currentRoom: Room;
    let syncInterval: ReturnType<typeof setInterval> | null = null;

    const connectToLiveKit = async () => {
      try {
        currentRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: {
            resolution: VideoPresets.h720.resolution,
          },
        });

        let isConnecting = true;

        const updateParticipants = () => {
          // Accurate count: Local participant (1) + remote participants count
          const remotes = currentRoom.remoteParticipants.size;
          const total = remotes + 1;
          setParticipantCount(total);

          // In 1-on-1 calls: If we have at least 1 remote peer and no timer started yet, send CALL_START
          if (callMode !== 'broadcast' && remotes >= 1 && durationRef.current === 0) {
            try {
              const startMsg = new TextEncoder().encode(JSON.stringify({ 
                type: 'CALL_START_TIME', 
                timestamp: Date.now() 
              }));
              currentRoom.localParticipant.publishData(startMsg, { reliable: true }).catch(() => {});
            } catch (_) {}
          }
        };

        currentRoom.on(RoomEvent.Connected, () => {
          isConnecting = false;
          setStatus('connected');
          updateParticipants();

          // If current participant is Broadcast Host, broadcast live heartbeat timer every 3s
          if (callMode === 'broadcast' && isHost) {
            const hostStartTime = Date.now() - (durationRef.current * 1000);
            const sendSync = () => {
              try {
                const msg = new TextEncoder().encode(JSON.stringify({ 
                  type: 'HOST_START_TIME', 
                  timestamp: hostStartTime 
                }));
                currentRoom.localParticipant.publishData(msg, { reliable: true }).catch(() => {});
              } catch (_) {}
            };
            sendSync();
            syncInterval = setInterval(sendSync, 3000);
          } else if (callMode === 'broadcast' && !isHost) {
            // Viewer asks Host for broadcast started time immediately upon connecting
            try {
              const reqMsg = new TextEncoder().encode(JSON.stringify({ type: 'REQUEST_SYNC' }));
              currentRoom.localParticipant.publishData(reqMsg, { reliable: true }).catch(() => {});
            } catch (_) {}
          }
        });

        // When a participant connects
        currentRoom.on(RoomEvent.ParticipantConnected, () => {
          updateParticipants();
          if (callMode === 'broadcast' && isHost) {
            try {
              const hostStartTime = Date.now() - (durationRef.current * 1000);
              const msg = new TextEncoder().encode(JSON.stringify({ 
                type: 'HOST_START_TIME', 
                timestamp: hostStartTime 
              }));
              currentRoom.localParticipant.publishData(msg, { reliable: true }).catch(() => {});
            } catch (_) {}
          }
        });

        // Listen for Data packets
        currentRoom.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
          try {
            const dataStr = new TextDecoder().decode(payload);
            const data = JSON.parse(dataStr);
            if (data.type === 'CHAT_MESSAGE') {
              const newMsg: ChatMessage = {
                id: data.id || `msg-${Date.now()}-${Math.random()}`,
                sender: data.sender || participant?.identity || 'Remote Peer',
                text: data.text || '',
                timestamp: data.timestamp || Date.now(),
                isSelf: false,
              };
              setMessages((prev) => [...prev, newMsg]);
              setUnreadCount((prev) => (isChatOpen ? 0 : prev + 1));
            } else if (data.type === 'HOST_START_TIME' && data.timestamp) {
              const elapsedSeconds = Math.max(0, Math.floor((Date.now() - data.timestamp) / 1000));
              setDurationSeconds(elapsedSeconds);
            } else if (data.type === 'CALL_START_TIME' && data.timestamp && callMode !== 'broadcast') {
              // 1-on-1 Call: Synchronize start time so both phones/tabs show identical duration!
              const elapsed = Math.max(0, Math.floor((Date.now() - data.timestamp) / 1000));
              setDurationSeconds(elapsed);
            } else if (data.type === 'REQUEST_SYNC' && isHost) {
              const hostStartTime = Date.now() - (durationRef.current * 1000);
              const msg = new TextEncoder().encode(JSON.stringify({ 
                type: 'HOST_START_TIME', 
                timestamp: hostStartTime 
              }));
              currentRoom.localParticipant.publishData(msg, { reliable: true }).catch(() => {});
            } else if (data.type === 'CALL_ENDED' && callMode !== 'broadcast') {
              // 1-on-1 audio/video call: Peer ended the call
              if (currentRoom) {
                currentRoom.disconnect().catch(() => {});
              }
              onLeaveRef.current();
            } else if (data.type === 'BROADCAST_ENDED' && callMode === 'broadcast' && !isHost) {
              // Broadcast Host ended the live stream: Viewers get disconnected
              if (currentRoom) {
                currentRoom.disconnect().catch(() => {});
              }
              onLeaveRef.current();
            }
          } catch (_) {}
        });

        currentRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
          updateParticipants();
          
          if (callMode !== 'broadcast') {
            // In 1-on-1 video or audio calls, if the other person leaves, automatically disconnect this peer too!
            if (currentRoom) {
              currentRoom.disconnect().catch(() => {});
            }
            onLeaveRef.current();
          } else if (callMode === 'broadcast' && !isHost) {
            // In Live Broadcast: If the Host leaves, goes back, or closes the tab, end stream for all viewers!
            const wasPublisher = participant.trackPublications.size > 0 || participant.identity.includes('host') || currentRoom.remoteParticipants.size === 0;
            if (wasPublisher) {
              if (currentRoom) {
                currentRoom.disconnect().catch(() => {});
              }
              onLeaveRef.current();
            }
          }
        });

        currentRoom.on(RoomEvent.Disconnected, () => {
          setStatus('disconnected');
          setDurationSeconds(0);
          if (!isConnecting) {
            onLeaveRef.current();
          }
        });


        // Track subscribed from remote participants
        currentRoom.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === 'video' || track.kind === 'audio') {
            const el = track.attach();
            el.className = 'w-full h-full object-cover rounded-md';
            if (remoteContainerRef.current) {
              remoteContainerRef.current.appendChild(el);
            }
          }
        });

        // Connect over WSS to Media Node
        await currentRoom.connect(livekitUrl, token);

        if (isBroadcastAudience) {
          // Audience in Live Broadcast: Viewer only (No mic or camera publish)
          console.log('Joined live broadcast room as viewer/audience');
        } else if (isAudioOnly) {
          // Audio Call Mode: Only enable microphone
          await currentRoom.localParticipant.setMicrophoneEnabled(true);
        } else {
          // Video Call Mode: Turn on both camera and microphone
          await currentRoom.localParticipant.enableCameraAndMicrophone();
          const videoTrack = currentRoom.localParticipant.videoTrackPublications.values().next().value?.videoTrack;
          if (videoTrack && localVideoRef.current) {
            videoTrack.attach(localVideoRef.current);
          }
        }

        setRoom(currentRoom);


      } catch (err) {
        const isAbort = err instanceof Error && (err.message.includes('Client initiated disconnect') || err.name === 'AbortError');
        if (isAbort) {
          // Ignore StrictMode unmount cleanup aborts
          return;
        }
        console.error('Failed to connect to LiveKit SFU:', err);
        setStatus('disconnected');
        const detailedError = errorMessage(err,`Could not connect to LiveKit media node (${livekitUrl})`);
        if (onErrorRef.current) {
          onErrorRef.current?.(`Connection Error: ${detailedError}. Please verify that the LiveKit RTC service is reachable.`);
        }
        onLeaveRef.current();
      }
    };

    connectToLiveKit();

    return () => {
      if (syncInterval) {
        clearInterval(syncInterval);
      }
      // Only disconnect if room has already connected, don't abort in-flight connection
      if (currentRoom) {
        currentRoom.disconnect().catch(() => {});
      }
    };
  // Mode and role are fixed for the lifetime of a token, so they must not trigger a reconnect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, livekitUrl]);


  const toggleMic = async () => {
    if (!room) return;
    const enabled = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!enabled);
    setIsAudioMuted(enabled);
  };

  const toggleCamera = async () => {
    if (!room) return;
    const enabled = room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(!enabled);
    setIsVideoMuted(enabled);
  };

  const handleDisconnect = async () => {
    if (room) {
      try {
        if (callMode !== 'broadcast') {
          // 1-on-1 Audio/Video Call: Tell peer that call ended
          const msg = new TextEncoder().encode(JSON.stringify({ type: 'CALL_ENDED' }));
          await room.localParticipant.publishData(msg, { reliable: true });
        } else if (isHost) {
          // Broadcast Host only: Tell viewers the live stream ended
          const msg = new TextEncoder().encode(JSON.stringify({ type: 'BROADCAST_ENDED' }));
          await room.localParticipant.publishData(msg, { reliable: true });
        }
        // Notice: If a Viewer leaves in Broadcast Mode, NO signal is sent! Host continues broadcasting!
      } catch (_) {}
      room.disconnect();
    }
    setDurationSeconds(0);
    onLeave();
  };

  // Send In-Room Real-time Chat Message via WebRTC DataChannel
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = chatInput.trim();
    if (!textToSend || !room) return;

    const selfIdentity = room.localParticipant.identity || 'You';
    const msgPayload = {
      type: 'CHAT_MESSAGE',
      id: `msg-${Date.now()}-${Math.random()}`,
      sender: selfIdentity,
      text: textToSend,
      timestamp: Date.now(),
    };

    try {
      const encoded = new TextEncoder().encode(JSON.stringify(msgPayload));
      await room.localParticipant.publishData(encoded, { reliable: true });

      // Add to local message list
      setMessages((prev) => [
        ...prev,
        {
          id: msgPayload.id,
          sender: 'You',
          text: textToSend,
          timestamp: msgPayload.timestamp,
          isSelf: true,
        },
      ]);
      setChatInput('');
    } catch (err) {
      console.error('Failed to publish data channel message:', err);
    }
  };

  useEffect(() => {
    if (isChatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatOpen]);

  return (
    <div className="bg-white rounded-lg border border-line p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-ping"></div>
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <span>Room: {roomName}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent-deep border border-accent/30">
                P2P SFU Mesh
              </span>
            </h2>
            <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
              <span>Status: <strong className="text-emerald-600 capitalize">{status}</strong></span>
              <span>•</span>
              <span className={`flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md border text-xs ${
                isCallActive 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                <Clock className={`h-3 w-3 ${isCallActive ? 'text-emerald-600' : 'text-amber-600 animate-spin'}`} />
                {isCallActive ? formatDuration(durationSeconds) : 'Waiting for Peer...'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {participantCount} in call</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleDisconnect}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-md flex items-center gap-1.5 transition-colors"
        >
          <PhoneOff className="h-3.5 w-3.5" /> Leave Room
        </button>
      </div>

      {/* Video / Audio Grid / Stage */}
      {isBroadcastAudience ? (
        /* Audience / Viewer Stage: Fullscreen Host Stream without empty local tile */
        <div className="relative aspect-video w-full max-w-4xl mx-auto bg-console rounded-lg overflow-hidden border border-console-line flex items-center justify-center">
          <div ref={remoteContainerRef} className="w-full h-full flex items-center justify-center">
            {participantCount <= 1 && (
              <div className="text-center p-8 space-y-2 text-slate-400">
                <Radio className="h-10 w-10 mx-auto text-indigo-300 animate-pulse" />
                <div className="text-sm font-bold text-white">Live Broadcast Starting Soon...</div>
                <p className="text-xs text-slate-400">Waiting for the Host to go live in room: <strong>{roomName}</strong></p>
              </div>
            )}
          </div>
          <div className="absolute top-4 left-4 bg-onair text-white text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white animate-ping"></span>
            Live Stream
          </div>
          <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-md text-white text-xs font-semibold flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-indigo-300" /> {participantCount} Viewers
          </div>
        </div>
      ) : callMode === 'broadcast' && isHost ? (
        /* Broadcast Host Stage: Single Large Full-Width Studio Screen (Host Video Only) */
        <div className="relative aspect-video w-full max-w-4xl mx-auto bg-console rounded-lg overflow-hidden border border-console-line flex items-center justify-center">
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
          {/* Hidden container in case any remote audio needs to attach */}
          <div ref={remoteContainerRef} className="hidden" />

          {/* Host Studio Badges */}
          <div className="absolute top-4 left-4 bg-onair text-white text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white animate-ping"></span>
            Host Broadcasting Live
          </div>
          <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-md text-white text-xs font-semibold flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-indigo-300" />
            <span>{Math.max(0, participantCount - 1)} Active Viewers</span>
          </div>
          <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg text-white text-xs font-medium flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-indigo-300" />
            Your Stream is Live to Audience
          </div>
        </div>
      ) : isAudioOnly ? (
        /* Voice / Audio Call Stage: Dual Avatar Cards (Local & Remote) with Voice Visualizers */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {/* Local Participant Card */}
          <div className="relative aspect-[4/3] bg-console rounded-lg overflow-hidden border border-console-line flex flex-col items-center justify-center p-6 text-center">
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-console text-white flex items-center justify-center text-3xl font-semibold border-4 border-console-line/80">
                You
              </div>
              <div className={`absolute bottom-0 right-0 p-2 rounded-full border-2 border-console  ${isAudioMuted ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
                {isAudioMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </div>
            </div>
            <div className="mt-4">
              <h3 className="font-bold text-sm text-white">You (Local)</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{isAudioMuted ? 'Microphone Muted' : 'Speaking / Active'}</p>
            </div>
            {/* Audio Waveform Effect */}
            {!isAudioMuted && (
              <div className="flex items-center gap-1 mt-4">
                <span className="h-3 w-1 bg-accent rounded-full animate-bounce"></span>
                <span className="h-6 w-1 bg-indigo-300 rounded-full animate-pulse"></span>
                <span className="h-4 w-1 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="h-7 w-1 bg-indigo-300 rounded-full animate-pulse [animation-delay:0.1s]"></span>
                <span className="h-2 w-1 bg-indigo-300 rounded-full animate-bounce"></span>
              </div>
            )}
            <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-lg text-emerald-400 text-[11px] font-semibold flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> Connected
            </div>
          </div>

          {/* Remote Participant Card */}
          <div className="relative aspect-[4/3] bg-console rounded-lg overflow-hidden border border-console-line flex flex-col items-center justify-center p-6 text-center">
            {/* Hidden container for attaching remote HTMLAudioElement */}
            <div ref={remoteContainerRef} className="hidden" />

            {participantCount > 1 ? (
              <>
                <div className="relative">
                  <div className="h-24 w-24 rounded-full bg-console text-white flex items-center justify-center text-3xl font-semibold border-4 border-console-line/80">
                    Peer
                  </div>
                  <div className="absolute bottom-0 right-0 p-2 rounded-full border-2 border-console bg-emerald-500 text-white">
                    <Mic className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="font-bold text-sm text-white">Remote Peer</h3>
                  <p className="text-[11px] text-emerald-400 font-medium mt-0.5">Live on Voice Call</p>
                </div>
                {/* Audio Waveform Effect */}
                <div className="flex items-center gap-1 mt-4">
                  <span className="h-4 w-1 bg-pink-500 rounded-full animate-bounce"></span>
                  <span className="h-7 w-1 bg-indigo-300 rounded-full animate-pulse"></span>
                  <span className="h-3 w-1 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.15s]"></span>
                  <span className="h-5 w-1 bg-pink-400 rounded-full animate-pulse [animation-delay:0.25s]"></span>
                  <span className="h-2 w-1 bg-indigo-300 rounded-full animate-bounce"></span>
                </div>
                <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-lg text-emerald-400 text-[11px] font-semibold flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> In Call
                </div>
              </>
            ) : (
              <div className="text-center p-6 space-y-2 text-slate-400">
                <div className="h-20 w-20 mx-auto rounded-full bg-console-line/80 border-2 border-dashed border-console-line flex items-center justify-center">
                  <Users className="h-8 w-8 text-muted animate-pulse" />
                </div>
                <div className="text-xs font-bold text-slate-300">Waiting for other person...</div>
                <p className="text-[11px] text-muted">
                  Open another window or incognito tab to join room: <span className="text-indigo-300 font-mono">{roomName}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Video Call Stage: Standard 2-way Video Grid (Local & Remote) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Local Stream */}
          <div className="relative aspect-video bg-console rounded-lg overflow-hidden shadow-inner flex items-center justify-center border border-line">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-white text-xs font-medium flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-indigo-300" />
              <span>You (Local Participant)</span>
            </div>
          </div>

          {/* Remote Stream Container */}
          <div
            ref={remoteContainerRef}
            className="relative aspect-video bg-paper-deep rounded-lg overflow-hidden flex items-center justify-center border border-line text-slate-400 text-xs font-medium"
          >
            {participantCount === 1 ? (
              <div className="text-center p-6 space-y-1">
                <Radio className="h-8 w-8 mx-auto text-slate-300 animate-pulse" />
                <p>Waiting for other participant to join room: {roomName}</p>
                <p className="text-[11px] text-slate-400">Share your room name and token to connect</p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Control Bar */}
      <div className="flex items-center justify-center gap-4 pt-2">
        {!isBroadcastAudience && (
          <>
            <button
              onClick={toggleMic}
              className={`h-11 w-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isAudioMuted ? 'bg-red-100 text-red-600' : 'bg-paper-deep hover:bg-line text-ink'
              }`}
              title={isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
            >
              {isAudioMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>

            {!isAudioOnly && (
              <button
                onClick={toggleCamera}
                className={`h-11 w-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isVideoMuted ? 'bg-red-100 text-red-600' : 'bg-paper-deep hover:bg-line text-ink'
                }`}
                title={isVideoMuted ? 'Turn on Camera' : 'Turn off Camera'}
              >
                {isVideoMuted ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
              </button>
            )}
          </>
        )}


        {/* In-Room Real-time Chat Toggle Button */}
        <button
          type="button"
          onClick={() => {
            setIsChatOpen((prev) => !prev);
            if (!isChatOpen) setUnreadCount(0);
          }}
          className={`h-11 px-4 rounded-full flex items-center gap-2 font-bold text-xs transition-all cursor-pointer relative ${
            isChatOpen
              ? 'bg-accent text-white  '
              : 'bg-paper-deep hover:bg-line text-ink'
          }`}
          title="Toggle In-Room Real-time Chat"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Chat</span>
          {!isChatOpen && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white rounded-full text-[10px] font-semibold flex items-center justify-center animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={handleDisconnect}
          className="h-11 px-5 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-red-600/20 cursor-pointer"
        >
          <PhoneOff className="h-4 w-4" /> End Call
        </button>
      </div>

      {/* Floating In-Room Real-time Messaging Drawer */}
      {isChatOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 bg-white rounded-lg border border-line flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
          {/* Chat Header */}
          <div className="bg-console px-4 py-3 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-300" />
              <div>
                <h4 className="font-bold text-xs">In-Room Real-time Chat</h4>
                <p className="text-[10px] text-slate-400">P2P WebRTC DataChannel (Sub-10ms)</p>
              </div>
            </div>
            <button
              onClick={() => setIsChatOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-console-line transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages Body */}
          <div className="p-4 h-64 overflow-y-auto space-y-3 bg-paper text-xs">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                <MessageSquare className="h-8 w-8 text-slate-300 mb-1" />
                <p className="font-semibold text-muted">No messages yet</p>
                <p className="text-[10px]">Send a live message to everyone in this room</p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.isSelf ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] text-slate-400 mb-0.5 px-1 font-medium">
                    {m.isSelf ? 'You' : m.sender} • {new Date(m.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs font-medium ${
                      m.isSelf
                        ? 'bg-accent text-white rounded-tr-none'
                        : 'bg-white text-ink border border-line rounded-tl-none'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Quick Reactions */}
          <div className="px-3 py-1.5 bg-white border-t border-line flex items-center gap-1.5 overflow-x-auto text-sm">
            {['👋', '👍', '❤️', '🔥', '🚀', '👏'].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setChatInput((prev) => prev + emoji);
                }}
                className="hover:scale-125 transition-transform p-1 cursor-pointer"
                title={`Add ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Message Input Bar */}
          <form onSubmit={handleSendMessage} className="p-2.5 bg-white border-t border-line flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type message & hit Enter..."
              className="flex-1 px-3 py-2 bg-paper border border-line rounded-md text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:bg-white transition-all"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="h-8 w-8 rounded-md bg-accent hover:bg-accent-deep text-white flex items-center justify-center transition-all disabled:opacity-40 cursor-pointer"
              title="Send Message"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
