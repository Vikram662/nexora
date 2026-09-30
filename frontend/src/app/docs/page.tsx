'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchOrganizationData, getApiBaseUrl, getLivekitWsUrl, Project } from '@/lib/api';
import { Smartphone, Radio, Video, Mic, MessageSquare, Copy, Check, Cpu } from 'lucide-react';

type SdkTab = 'android' | 'flutter' | 'ios' | 'web';
type FeatureTab = 'video' | 'voice' | 'broadcast' | 'messaging';

export default function DocumentationPage() {
  const [activeSdk, setActiveSdk] = useState<SdkTab>('android');
  const [activeFeature, setActiveFeature] = useState<FeatureTab>('video');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState(() => getApiBaseUrl());
  const [livekitHost, setLivekitHost] = useState(() => getLivekitWsUrl());
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedApiKey, setSelectedApiKey] = useState('pk_live_your_project_key');

  useEffect(() => {
    void Promise.resolve().then(() => {
      setApiBaseUrl(getApiBaseUrl());
      setLivekitHost(getLivekitWsUrl());
    });

    // Try to load developer's actual project credentials if logged in
    fetchOrganizationData()
      .then((org) => {
        if (org?.projects && org.projects.length > 0) {
          setProjects(org.projects);
          setSelectedApiKey(org.projects[0].apiKeyPrefix);
        }
      })
      .catch(() => {
        // Unauthenticated visitor view: keeps clean dynamic host
      });
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

interface ApiDocItem {
  title: string;
  endpoint: string;
  badge?: string;
  desc: string;
  link?: { href: string; label: string };
  flow: string;
  request: string;
  response: string;
}

  // FULL APPLICATION-FACING APIS FOR CALL, VIDEO, BROADCAST, AND CHAT
  const APPLICATION_APIS: ApiDocItem[] = [
    {
      title: '1. Video Call Token Minting (1:1 & Multi-Party Mesh)',
      endpoint: 'POST /v1/tokens',
      desc: 'Your mobile/web backend calls this to generate an authentic room access token for a video participant. Grants camera, mic, and screen sharing permissions.',
      flow: 'Client App -> Your Backend -> Nexora /v1/tokens -> Returns Signed JWT -> Client connects to LiveKit SFU',
      request: `curl -X POST "${apiBaseUrl}/v1/tokens" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret" \\
  -d '{
    "roomName": "dr-sharma-consultation-991",
    "participantIdentity": "patient_mumbai_101",
    "participantName": "Amit Roy",
    "ttlSeconds": 1800,
    "grants": {
      "canPublish": true,
      "canSubscribe": true,
      "canPublishData": true
    }
  }'`,
      response: `{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "ttlSeconds": 1800,
    "livekitUrl": "${livekitHost}",
    "environment": "PRODUCTION"
  }
}`,
    },
    {
      title: '2. Low-Latency Voice / Audio Call Token',
      endpoint: 'POST /v1/tokens',
      desc: 'Optimized for high-fidelity audio calls, customer support hotline, or walkie-talkie mode. Bandwidth is streamlined with adaptive Opus codec and hardware echo cancellation.',
      flow: 'Microphone track only. Video camera publishing is strictly blocked on token level via canPublishSources: ["microphone"] for maximum security & battery efficiency.',
      request: `curl -X POST "${apiBaseUrl}/v1/tokens" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret" \\
  -d '{
    "roomName": "voice-support-hotline-204",
    "participantIdentity": "agent_rahul_04",
    "participantName": "Rahul Verma",
    "ttlSeconds": 3600,
    "grants": {
      "canPublish": true,
      "canPublishSources": ["microphone"],
      "canSubscribe": true,
      "canPublishData": true
    }
  }'`,
      response: `{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.audio_grant...",
    "ttlSeconds": 3600,
    "livekitUrl": "${livekitHost}",
    "environment": "PRODUCTION"
  }
}`,
    },
    {
      title: '3. Interactive Live Broadcasting (Host vs Audience / Viewer)',
      endpoint: 'POST /v1/tokens',
      desc: 'Sub-second interactive live stream. Host gets publishing grants (video/mic) while audience members receive subscriber-only tokens (canPublish: false) with unlimited scalability.',
      flow: 'Host broadcasts 1080p/720p stream -> SFU edge relays -> Millions of audience members watch with <300ms sub-second latency.',
      request: `// A. HOST TOKEN (Can publish live video and mic)
curl -X POST "${apiBaseUrl}/v1/tokens" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret" \\
  -d '{
    "roomName": "masterclass-live-stage-01",
    "participantIdentity": "teacher_host_dr_sharma",
    "participantName": "Dr. Sharma (Presenter)",
    "grants": {
      "canPublish": true,
      "canSubscribe": true,
      "canPublishData": true
    }
  }'

// B. AUDIENCE / VIEWER TOKEN (Watch only - No camera/mic permissions)
curl -X POST "${apiBaseUrl}/v1/tokens" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret" \\
  -d '{
    "roomName": "masterclass-live-stage-01",
    "participantIdentity": "viewer_student_8829",
    "participantName": "Sneha Patel",
    "grants": {
      "canPublish": false,
      "canSubscribe": true,
      "canPublishData": true
    }
  }'`,
      response: `{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.viewer_grant...",
    "livekitUrl": "${livekitHost}"
  }
}`,
    },
    {
      title: '4. Room Management API (Create, Inspect, List & Close Rooms)',
      endpoint: 'POST /v1/rooms | GET /v1/rooms | GET /v1/rooms/{room} | DELETE /v1/rooms/{room}',
      desc: 'Server-side room lifecycle controls. Pre-create structured rooms with participant limits and empty timeouts, retrieve real-time participant counts, or explicitly close rooms.',
      flow: `Your Backend -> POST /v1/rooms -> Nexora provisions room configuration. DELETE /v1/rooms/{room} terminates room and immediately disconnects all peers.`,
      request: `// A. Explicitly Create or Configure a Room
curl -X POST "${apiBaseUrl}/v1/rooms" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret" \\
  -d '{
    "roomName": "dr-sharma-consultation-991",
    "emptyTimeout": 300,
    "maxParticipants": 10,
    "metadata": "{\\"specialty\\":\\"Cardiology\\"}"
  }'

// B. Get Room Status & Active State
curl -X GET "${apiBaseUrl}/v1/rooms/dr-sharma-consultation-991" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret"

// C. List Active Rooms for Project
curl -X GET "${apiBaseUrl}/v1/rooms" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret"

// D. Delete Room and Disconnect Everyone
curl -X DELETE "${apiBaseUrl}/v1/rooms/dr-sharma-consultation-991" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret"`,
      response: `// Response from GET /v1/rooms/{room}:
{
  "status": "success",
  "data": {
    "roomName": "dr-sharma-consultation-991",
    "sid": "RM_99182a17f",
    "isActive": true,
    "participantCount": 2,
    "isRecording": false,
    "creationTime": "2026-09-29T10:00:00.000Z",
    "maxParticipants": 10
  }
}`,
    },
    {
      title: '5. Participant Control & Moderation API (List, Kick, Mute, Permissions)',
      endpoint: 'GET .../participants | DELETE .../participants/{id} | POST .../mute | PATCH .../permissions',
      desc: 'In-call server-side moderation. Inspect active publishing tracks, kick unruly participants, remotely mute microphones/cameras, or toggle publish/subscribe grants.',
      flow: `Your Backend -> DELETE /v1/rooms/{room}/participants/{id} disconnects participant. POST .../mute mutes their specific track.`,
      request: `// A. List Connected Participants in Room
curl -X GET "${apiBaseUrl}/v1/rooms/dr-sharma-consultation-991/participants" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret"

// B. Mute Participant Audio or Video Track
curl -X POST "${apiBaseUrl}/v1/rooms/dr-sharma-consultation-991/participants/patient_101/mute" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret" \\
  -d '{
    "trackSid": "TR_AM1092a",
    "muted": true
  }'

// C. Update Permissions (Promote to Speaker or Revoke Publishing)
curl -X PATCH "${apiBaseUrl}/v1/rooms/dr-sharma-consultation-991/participants/patient_101/permissions" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret" \\
  -d '{
    "canPublish": false,
    "canSubscribe": true,
    "canPublishData": true
  }'

// D. Kick Participant
curl -X DELETE "${apiBaseUrl}/v1/rooms/dr-sharma-consultation-991/participants/patient_101" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret"`,
      response: `// Response from GET /v1/rooms/{room}/participants:
{
  "status": "success",
  "data": {
    "roomName": "dr-sharma-consultation-991",
    "participants": [
      {
        "identity": "patient_101",
        "name": "Rohan Gupta",
        "state": "ACTIVE",
        "joinedAt": "2026-09-29T10:05:00.000Z",
        "isPublishingAudio": true,
        "isPublishingVideo": true,
        "tracks": [
          { "sid": "TR_AM1092a", "type": "AUDIO", "muted": false },
          { "sid": "TR_VM1092b", "type": "VIDEO", "muted": false }
        ]
      }
    ]
  }
}`,
    },
    {
      title: '6. Server-to-Client WebRTC Messaging (DataChannel Broadcast)',
      endpoint: 'POST /v1/rooms/{room}/messages',
      desc: 'Inject reliable server-side signals, alerts, polls, or live actions directly into connected participant WebRTC clients via DataChannels without establishing WebSocket connections.',
      flow: `Your Backend -> POST /v1/rooms/{room}/messages -> Nexora SFU pushes payload over SCTP DataChannel -> Clients trigger on(RoomEvent.DataReceived).`,
      request: `curl -X POST "${apiBaseUrl}/v1/rooms/dr-sharma-consultation-991/messages" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret" \\
  -d '{
    "message": { "action": "POLL_START", "question": "Rate consultation" },
    "topic": "system-broadcast"
  }'`,
      response: `{
  "status": "success",
  "data": {
    "roomName": "dr-sharma-consultation-991",
    "sent": true,
    "recipientsCount": "all"
  }
}`,
    },
    {
      title: '7. Real-time In-Room Text Chat (Client P2P DataChannel)',
      endpoint: 'WebRTC P2P DataChannel Protocol',
      desc: 'Direct sub-10ms peer-to-peer data channel packet delivery. Requires zero separate chat server or database! Messages are delivered over established encrypted SCTP channels.',
      flow: 'Sender client calls localParticipant.publishData(payload, { reliable: true }) -> LiveKit SFU relays payload -> All connected room participants trigger on(RoomEvent.DataReceived).',
      request: `// JSON Payload format sent over DataChannel:
{
  "type": "CHAT_MESSAGE",
  "id": "msg_99182390192",
  "sender": "patient_mumbai_101",
  "text": "Hello doctor, I have uploaded my blood test report.",
  "timestamp": 1759081290000
}`,
      response: `// LiveKit DataReceived event received on recipient client:
room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant) => {
  const data = JSON.parse(new TextDecoder().decode(payload));
  if (data.type === "CHAT_MESSAGE") {
    console.log(data.sender + ": " + data.text);
  }
});`,
    },
    {
      title: '8. Server-to-Server Recording & Egress API (Start, Stop & Status)',
      endpoint: 'POST /v1/rooms/{room}/recording/start | POST .../stop | GET .../status',
      desc: 'Server-side room compositing and track egress. Recordings are saved to the bucket connected in User Panel → Storage. Files stream directly to your private AWS S3, Cloudflare R2, or Google Cloud Storage.',
      link: { href: '/user/storage', label: 'Configure storage bucket in User Panel → Storage' },
      flow: `Your Backend -> POST ${apiBaseUrl}/v1/rooms/{room}/recording/start -> Nexora Egress Controller streams directly into your private connected bucket. Check room state with GET .../status (returns isRecording: true/false).`,
      request: `// A. Start Room Recording (Server-to-Server)
curl -X POST "${apiBaseUrl}/v1/rooms/dr-sharma-consultation-991/recording/start" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret" \\
  -d '{
    "audioOnly": false,
    "layout": "speaker-dark",
    "customOutputFilename": "consultations/2026/09/session-991.mp4"
  }'

// B. Check Active Recording Status (Returns isRecording flag)
curl -X GET "${apiBaseUrl}/v1/rooms/dr-sharma-consultation-991/recording/status" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret"

// C. Stop Room Recording
curl -X POST "${apiBaseUrl}/v1/rooms/dr-sharma-consultation-991/recording/stop" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret"`,
      response: `// A. Response from /recording/start:
{
  "status": "success",
  "data": {
    "recordingId": "rec_livekit_egress_99182",
    "roomName": "dr-sharma-consultation-991",
    "status": "PROCESSING",
    "storageProvider": "CLOUDFLARE_R2",
    "bucketName": "your-nexora-recordings-bucket",
    "destinationKey": "consultations/2026/09/session-991.mp4"
  }
}

// B. Response from /recording/status:
{
  "status": "success",
  "data": {
    "roomName": "dr-sharma-consultation-991",
    "isRecording": true,
    "activeRecording": {
      "recordingId": "rec_livekit_egress_99182",
      "status": "PROCESSING",
      "startedAt": "2026-09-29T10:30:00.000Z"
    }
  }
}`,
    },
    {
      title: '9. Project Recording Archive & Audit API',
      endpoint: 'GET /v1/recordings',
      desc: 'Retrieve paginated recording history, bucket object keys, transcoding status, and duration metrics for your project.',
      flow: `Your Backend -> GET ${apiBaseUrl}/v1/recordings -> Returns list of completed and active room recordings.`,
      request: `curl -X GET "${apiBaseUrl}/v1/recordings" \\
  -H "x-api-key: ${selectedApiKey}" \\
  -H "x-api-secret: sk_live_your_project_secret"`,
      response: `{
  "status": "success",
  "data": {
    "recordings": [
      {
        "id": "rec_livekit_egress_99182",
        "roomName": "dr-sharma-consultation-991",
        "storageProvider": "CLOUDFLARE_R2",
        "bucketName": "your-nexora-recordings-bucket",
        "objectKey": "consultations/2026/09/session-991.mp4",
        "durationSeconds": 1845,
        "fileSizeBytes": "48291040",
        "status": "COMPLETED",
        "startedAt": "2026-09-29T10:30:00.000Z",
        "completedAt": "2026-09-29T11:00:45.000Z"
      }
    ]
  }
}`,
    },
  ];

  // NATIVE CLIENT SDK INTEGRATIONS (COMPLETE COPY-PASTE READY APPS)
  const SDK_GUIDES = {
    android: {
      video: {
        title: 'Android (Kotlin) — Full Video Calling Activity',
        guide: `1. Add dependency in your app/build.gradle:
   implementation 'io.livekit:livekit-android:2.10.1'

2. Add Camera and Audio permissions in AndroidManifest.xml:
   <uses-permission android:name="android.permission.CAMERA" />
   <uses-permission android:name="android.permission.RECORD_AUDIO" />
   <uses-permission android:name="android.permission.INTERNET" />`,
        code: `package io.nexora.demo

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.renderer.SurfaceViewRenderer
import kotlinx.coroutines.launch

class VideoCallActivity : AppCompatActivity() {
    private lateinit var room: Room
    private lateinit var localView: SurfaceViewRenderer
    private lateinit var remoteView: SurfaceViewRenderer

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_video_call)

        localView = findViewById(R.id.local_surface)
        remoteView = findViewById(R.id.remote_surface)

        // 1. Initialize LiveKit Room instance
        room = LiveKit.create(applicationContext)

        // 2. Listen for remote peer video streams
        lifecycleScope.launch {
            room.events.collect { event ->
                when (event) {
                    is RoomEvent.TrackSubscribed -> {
                        val track = event.track
                        if (track is VideoTrack) {
                            track.addRenderer(remoteView)
                        }
                    }
                    is RoomEvent.ParticipantDisconnected -> {
                        // Peer hung up
                        finish()
                    }
                }
            }
        }

        // 3. Connect to Nexora Node with token minted from your backend
        lifecycleScope.launch {
            val livekitWs = "ws://rtc.yourdomain.com:7880"
            val jwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

            room.connect(livekitWs, jwtToken)

            // Turn on camera and microphone
            room.localParticipant.setCameraEnabled(true)
            room.localParticipant.setMicrophoneEnabled(true)

            // Render local self view
            val localTrack = room.localParticipant.videoTrackPublications.firstOrNull()?.first
            localTrack?.addRenderer(localView)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        room.disconnect()
        localView.release()
        remoteView.release()
    }
}`,
      },
      voice: {
        title: 'Android (Kotlin) — Voice Call with Hardware Echo Cancellation',
        guide: `Audio-only mode optimizes bandwidth down to 32kbps with hardware acoustic echo cancellation (AEC) and noise suppression (NS).`,
        code: `// Connect in Audio-Only Mode
lifecycleScope.launch {
    room.connect("ws://rtc.yourdomain.com:7880", token)

    // Enable high-fidelity microphone
    room.localParticipant.setMicrophoneEnabled(true)

    // Route audio directly to earpiece or loud speaker
    LiveKit.audioHandler.setOutputDevice(AudioDevice.SPEAKER_PHONE)
}`,
      },
      broadcast: {
        title: 'Android (Kotlin) — Sub-Second Live Broadcast Player',
        guide: `Audience mode connects with subscriber-only token. Streams start in sub-200ms without buffering or HLS CDN delay.`,
        code: `// Viewer Activity: Connect to live stage
lifecycleScope.launch {
    room.connect("ws://rtc.yourdomain.com:7880", viewerToken)

    room.events.collect { event ->
        if (event is RoomEvent.TrackSubscribed && event.track is VideoTrack) {
            // Render Host's low-latency stream in SurfaceView
            event.track.addRenderer(stageSurfaceView)
        }
    }
}`,
      },
      messaging: {
        title: 'Android (Kotlin) — In-Room Real-time Chat (DataChannel)',
        guide: `Send and receive chat messages, live stream emojis, and custom JSON payloads over WebRTC SCTP data channels.`,
        code: `// 1. Send live chat message
fun sendChatMessage(text: String) {
    val json = JSONObject().apply {
        put("type", "CHAT_MESSAGE")
        put("sender", room.localParticipant.identity)
        put("text", text)
        put("timestamp", System.currentTimeMillis())
    }
    val bytes = json.toString().toByteArray(Charsets.UTF_8)
    room.localParticipant.publishData(bytes, reliability = DataPublishReliability.RELIABLE)
}

// 2. Receive live chat messages
lifecycleScope.launch {
    room.events.collect { event ->
        if (event is RoomEvent.DataReceived) {
            val jsonStr = String(event.data, Charsets.UTF_8)
            val msg = JSONObject(jsonStr)
            if (msg.optString("type") == "CHAT_MESSAGE") {
                val author = msg.getString("sender")
                val text = msg.getString("text")
                runOnUiThread {
                    chatAdapter.addMessage(author, text)
                }
            }
        }
    }
}`,
      },
    },
    flutter: {
      video: {
        title: 'Flutter (Dart) — Complete Cross-Platform Video Calling',
        guide: `1. Add dependencies in pubspec.yaml:
   dependencies:
     livekit_client: ^2.2.0
     permission_handler: ^11.3.1`,
        code: `import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

class VideoCallScreen extends StatefulWidget {
  final String token;
  const VideoCallScreen({required this.token, Key? key}) : super(key: key);

  @override
  _VideoCallScreenState createState() => _VideoCallScreenState();
}

class _VideoCallScreenState extends State<VideoCallScreen> {
  Room? _room;
  EventsListener<RoomEvent>? _listener;

  @override
  void initState() {
    super.initState();
    _connect();
  }

  Future<void> _connect() async {
    await [Permission.camera, Permission.microphone].request();

    final room = Room();
    _listener = room.createListener();

    _listener!.on<TrackSubscribedEvent>((event) {
      if (event.track is VideoTrack) {
        setState(() {}); // Re-render to show remote peer stream
      }
    });

    _listener!.on<ParticipantDisconnectedEvent>((event) {
      Navigator.of(context).pop();
    });

    // Connect to Nexora WebRTC Node
    await room.connect('ws://rtc.yourdomain.com:7880', widget.token);

    // Publish Camera and Microphone
    await room.localParticipant?.setCameraEnabled(true);
    await room.localParticipant?.setMicrophoneEnabled(true);

    setState(() => _room = room);
  }

  @override
  Widget build(BuildContext context) {
    if (_room == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      appBar: AppBar(title: Text('Room: \${_room!.name}')),
      body: Stack(
        children: [
          // Remote Participant Fullscreen Video
          for (var p in _room!.remoteParticipants.values)
            if (p.videoTrackPublications.isNotEmpty)
              Positioned.fill(
                child: VideoTrackRenderer(
                  p.videoTrackPublications.first.track as VideoTrack,
                ),
              ),

          // Local Camera Floating Preview
          if (_room!.localParticipant?.videoTrackPublications.isNotEmpty ?? false)
            Positioned(
              right: 20,
              top: 40,
              width: 120,
              height: 180,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: VideoTrackRenderer(
                  _room!.localParticipant!.videoTrackPublications.first.track as VideoTrack,
                ),
              ),
            ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _room?.disconnect();
    _listener?.dispose();
    super.dispose();
  }
}`,
      },
      voice: {
        title: 'Flutter (Dart) — High-Definition Voice Chat',
        guide: `Connect without video tracks for low-bandwidth voice conferencing.`,
        code: `// Audio Call Mode
final room = Room();
await room.connect('ws://rtc.yourdomain.com:7880', token);
await room.localParticipant?.setMicrophoneEnabled(true);

// Listen to speaking participant indicators (Green Ring Glow)
room.createListener().on<SpeakingChangedEvent>((event) {
  print('\${event.participant.identity} is speaking: \${event.isSpeaking}');
});`,
      },
      broadcast: {
        title: 'Flutter (Dart) — Sub-Second Live Stream Viewer',
        guide: `Drop-in player widget for live webinars and e-commerce shopping shows.`,
        code: `// Audience Member: Stream connects with sub-second latency
final room = Room();
await room.connect('ws://rtc.yourdomain.com:7880', viewerToken);

// Host video track renders instantly inside VideoTrackRenderer(hostTrack)`,
      },
      messaging: {
        title: 'Flutter (Dart) — Real-Time Chat & Emojis',
        guide: `Publish and receive text chat messages over WebRTC SCTP DataChannel.`,
        code: `// Send chat message
Future<void> sendChatMessage(String message) async {
  final payload = jsonEncode({
    'type': 'CHAT_MESSAGE',
    'sender': room.localParticipant?.identity,
    'text': message,
    'timestamp': DateTime.now().millisecondsSinceEpoch,
  });
  await room.localParticipant?.publishData(
    utf8.encode(payload),
    reliability: Reliability.reliable,
  );
}

// Receive chat message listener
listener.on<DataReceivedEvent>((event) {
  final data = jsonDecode(utf8.decode(event.data));
  if (data['type'] == 'CHAT_MESSAGE') {
    setState(() {
      chatMessages.add(ChatMessage(sender: data['sender'], text: data['text']));
    });
  }
});`,
      },
    },
    ios: {
      video: {
        title: 'iOS (Swift / SwiftUI) — Native Video Calling App',
        guide: `1. In Xcode: File -> Add Package Dependencies:
   https://github.com/livekit/client-sdk-swift.git

2. In Info.plist, add:
   Privacy - Camera Usage Description
   Privacy - Microphone Usage Description`,
        code: `import SwiftUI
import LiveKit

class CallManager: ObservableObject, RoomDelegate {
    @Published var room = Room()
    @Published var remoteTrack: VideoTrack?

    init() {
        room.add(delegate: self)
    }

    func joinCall(token: String) async {
        do {
            try await room.connect(url: "ws://rtc.yourdomain.com:7880", token: token)
            try await room.localParticipant.setCamera(enabled: true)
            try await room.localParticipant.setMicrophone(enabled: true)
        } catch {
            print("Error connecting: \\(error)")
        }
    }

    func room(_ room: Room, participant: RemoteParticipant, didSubscribe publication: RemoteTrackPublication) {
        if let video = publication.track as? VideoTrack {
            DispatchQueue.main.async {
                self.remoteTrack = video
            }
        }
    }

    func hangUp() {
        Task { await room.disconnect() }
    }
}

struct VideoCallView: View {
    @StateObject var callMgr = CallManager()
    let token: String

    var body: some View {
        ZStack {
            if let remote = callMgr.remoteTrack {
                SwiftUIVideoView(remote)
                    .edgesIgnoringSafeArea(.all)
            } else {
                Text("Connecting to peer...")
                    .foregroundColor(.white)
            }

            VStack {
                Spacer()
                Button(action: { callMgr.hangUp() }) {
                    Image(systemName: "phone.down.fill")
                        .foregroundColor(.white)
                        .padding(20)
                        .background(Color.red)
                        .clipShape(Circle())
                }
            }
            .padding()
        }
        .task { await callMgr.joinCall(token: token) }
    }
}`,
      },
      voice: {
        title: 'iOS (Swift) — High-Fidelity Voice Chat',
        guide: `Configures iOS AVAudioSession with VoiceChat mode and echo cancellation.`,
        code: `// Audio Call Mode
try await room.connect(url: "ws://rtc.yourdomain.com:7880", token: token)
try await room.localParticipant.setMicrophone(enabled: true)

// iOS hardware automatically engages acoustic echo cancellation (AEC)`,
      },
      broadcast: {
        title: 'iOS (Swift) — Sub-Second Interactive Broadcast Player',
        guide: `Ultra-low-latency metal rendering view for live broadcasting.`,
        code: `// Connect as Viewer to receive Host video
try await room.connect(url: "ws://rtc.yourdomain.com:7880", token: viewerToken)

func room(_ room: Room, participant: RemoteParticipant, didSubscribe publication: RemoteTrackPublication) {
    if let hostVideo = publication.track as? VideoTrack {
        SwiftUIVideoView(hostVideo)
    }
}`,
      },
      messaging: {
        title: 'iOS (Swift) — In-Room Chat & Live Reactions',
        guide: `Publish and listen for in-room data packets.`,
        code: `// Send Message
func sendMessage(text: String) async {
    let dict: [String: Any] = [
        "type": "CHAT_MESSAGE",
        "sender": room.localParticipant.identity ?? "iOS_User",
        "text": text,
        "timestamp": Date().timeIntervalSince1970
    ]
    if let data = try? JSONSerialization.data(withJSONObject: dict) {
        try? await room.localParticipant.publishData(data: data, reliability: .reliable)
    }
}

// Receive Message Delegate
func room(_ room: Room, participant: RemoteParticipant?, didReceiveData data: Data, topic: String?) {
    if let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       dict["type"] as? String == "CHAT_MESSAGE" {
        print("Chat from \\(dict["sender"] ?? ""): \\(dict["text"] ?? "")")
    }
}`,
      },
    },
    web: {
      video: {
        title: 'Web (React / TypeScript / Vanilla JS) — Complete Video Room',
        guide: `1. Install livekit-client:
   npm install livekit-client`,
        code: `import { Room, RoomEvent, VideoPresets } from 'livekit-client';

async function startVideoCall(token: string, remoteContainer: HTMLElement, localVideoElement: HTMLVideoElement) {
  // 1. Create Room with adaptive bitrate & dynacast
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
  });

  // 2. Attach remote participant tracks
  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    const el = track.attach();
    el.style.width = '100%';
    el.style.borderRadius = '16px';
    remoteContainer.appendChild(el);
  });

  // 3. Connect to Nexora LiveKit Media Node (livekitUrl received dynamically from /v1/tokens)
  await room.connect('${livekitHost}', token);

  // 4. Publish local Camera and Microphone
  await room.localParticipant.enableCameraAndMicrophone();

  // Attach local video track
  const localVideoTrack = room.localParticipant.videoTrackPublications.values().next().value?.videoTrack;
  if (localVideoTrack) {
    localVideoTrack.attach(localVideoElement);
  }

  return room;
}`,
      },
      voice: {
        title: 'Web (JS / TS) — Voice Calling',
        guide: `Audio-only WebRTC setup with auto-play handling.`,
        code: `const room = new Room();
await room.connect('${livekitHost}', token);

// Audio only: Enable microphone
await room.localParticipant.setMicrophoneEnabled(true);

room.on(RoomEvent.TrackSubscribed, (track) => {
  if (track.kind === 'audio') {
    const audioEl = track.attach();
    document.body.appendChild(audioEl);
  }
});`,
      },
      broadcast: {
        title: 'Web (JS / TS) — Sub-Second Live Stream Player',
        guide: `Sub-200ms latency stream player. Replaces HLS/DASH delays.`,
        code: `const room = new Room();
await room.connect('${livekitHost}', viewerToken);

room.on(RoomEvent.TrackSubscribed, (track) => {
  if (track.kind === 'video') {
    const playerEl = track.attach();
    document.getElementById('live-stream-viewport')?.appendChild(playerEl);
  }
});`,
      },
      messaging: {
        title: 'Web (JS / TS) — Real-Time Chat & Emojis (DataChannel)',
        guide: `In-room SCTP reliable data channel message delivery.`,
        code: `// 1. Send Chat Message
async function sendChatMessage(room: Room, text: String) {
  const payload = JSON.stringify({
    type: 'CHAT_MESSAGE',
    sender: room.localParticipant.identity,
    text: text,
    timestamp: Date.now(),
  });
  const bytes = new TextEncoder().encode(payload);
  await room.localParticipant.publishData(bytes, { reliable: true });
}

// 2. Receive Chat Message
room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant) => {
  const data = JSON.parse(new TextDecoder().decode(payload));
  if (data.type === 'CHAT_MESSAGE') {
    renderChatMessage(data.sender, data.text);
  }
});`,
      },
    },
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col selection:bg-accent selection:text-white">
      <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur border-b border-line px-6 h-16">
        <nav aria-label="Docs" className="max-w-7xl mx-auto h-full flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="font-display text-xl font-semibold tracking-tight">
              Nexora<span className="text-accent">.</span>rtc
            </Link>
            <span className="font-mono text-[11px] text-muted">Reference</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Link href="/user/sandbox" className="px-3 py-2 text-muted hover:text-ink transition-colors">
              Sandbox
            </Link>
            <Link
              href="/user"
              className="px-4 py-2 rounded-md bg-ink text-paper font-medium hover:bg-accent transition-colors active:scale-[0.98]"
            >
              Console
            </Link>
          </div>
        </nav>
      </header>

      <div className="border-b border-line bg-paper-deep px-6 py-14">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight leading-tight max-w-3xl">
            Calling, broadcast, messaging and recording API
          </h1>
          <p className="mt-4 text-muted max-w-2xl leading-relaxed">
            Everything here is called from your backend with a project key and secret. Keys, storage buckets,
            webhook endpoints and billing are managed in the console.
          </p>

          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium">
            <a href="#app-apis" className="underline underline-offset-4 decoration-accent hover:text-accent transition-colors">
              Server APIs
            </a>
            <a href="#sdks" className="underline underline-offset-4 decoration-accent hover:text-accent transition-colors">
              Client integration guides
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 flex-1 w-full space-y-16">
        {/* ========================================================================= */}
        {/* SECTION 1: CORE APPLICATION APIS (CALL, VIDEO, BROADCAST, CHAT) */}
        {/* ========================================================================= */}
        <section id="app-apis" className="space-y-6">
          <div className="pb-4 border-b border-line flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                <Cpu className="h-5 w-5 text-accent" />
                1. Application-Facing WebRTC & Messaging APIs
              </h2>
              <p className="text-xs text-muted mt-0.5">
                These are the core endpoints your product backend calls to orchestrate live sessions, enforce room participant permissions, and securely authenticate users.
              </p>
            </div>

            {/* Dynamic Environment & Credentials Switcher */}
            <div className="flex flex-wrap items-center gap-2 bg-paper-deep p-2 rounded-md border border-line text-xs">
              <span className="font-semibold text-muted">Active Key:</span>
              {projects.length > 0 ? (
                <select
                  value={selectedApiKey}
                  onChange={(e) => setSelectedApiKey(e.target.value)}
                  className="bg-white border border-line rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-accent-deep focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.apiKeyPrefix}>
                      {p.name} ({p.environment}) — {p.apiKeyPrefix}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-mono bg-white px-2 py-1 rounded border border-line text-ink">
                  {selectedApiKey} (Sandbox Demo)
                </span>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {APPLICATION_APIS.map((api, index) => (
              <div
                key={api.title}
                className="bg-white rounded-lg border border-line  overflow-hidden"
              >
                <div className="bg-console p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="h-7 w-7 rounded-lg bg-accent text-white font-extrabold text-xs flex items-center justify-center">
                      {index + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-white">{api.title}</h3>
                        {api.badge && (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {api.badge}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-emerald-400 mt-0.5">{api.endpoint}</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 bg-console-line px-3 py-1 rounded-lg border border-console-line">
                    Control Plane: {apiBaseUrl}
                  </span>
                </div>

                <div className="p-6 space-y-4">
                  <div className="text-xs text-muted leading-relaxed">
                    {api.desc}
                    {api.link && (
                      <span className="block mt-1">
                        <Link href={api.link.href} className="font-semibold text-accent hover:underline inline-flex items-center gap-1">
                          {api.link.label} &rarr;
                        </Link>
                      </span>
                    )}
                  </div>

                  <div className="p-3 bg-paper-deep border border-line rounded-md text-xs text-ink">
                    <span className="font-bold text-accent-deep">Architecture Flow:</span> {api.flow}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                    {/* Request */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-sans font-bold text-ink">
                        <span>API Call Example (cURL / Backend Request)</span>
                        <button
                          onClick={() => copyToClipboard(api.request, `req-${index}`)}
                          className="text-slate-400 hover:text-accent transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `req-${index}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                      <pre className="p-3 bg-console text-slate-200 rounded-md overflow-x-auto text-[11px] leading-relaxed max-h-56">
                        <code>{api.request}</code>
                      </pre>
                    </div>

                    {/* Response */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-sans font-bold text-ink">
                        <span>Response / Client Handler</span>
                        <button
                          onClick={() => copyToClipboard(api.response, `res-${index}`)}
                          className="text-slate-400 hover:text-accent transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `res-${index}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                      <pre className="p-3 bg-console text-emerald-400 rounded-md overflow-x-auto text-[11px] leading-relaxed max-h-56">
                        <code>{api.response}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 2: NATIVE CLIENT SDK GUIDES (ANDROID, FLUTTER, IOS, WEB) */}
        {/* ========================================================================= */}
        <section id="sdks" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
            <div>
              <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-accent" />
                2. Native Client SDK Quickstarts (Android, Flutter, iOS, Web)
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Complete copy-pasteable production implementations for your mobile & web development teams.
              </p>
            </div>

            {/* Platform Selector Buttons */}
            <div className="flex items-center gap-1.5 bg-line/70 p-1 rounded-md">
              {(['android', 'flutter', 'ios', 'web'] as SdkTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveSdk(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                    activeSdk === tab
                      ? 'bg-white text-accent '
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {tab === 'ios' ? 'iOS (Swift)' : tab}
                </button>
              ))}
            </div>
          </div>

          {/* Feature Selector Tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'video', label: 'Video Calling (1:1 & Group)', icon: Video },
              { id: 'voice', label: 'Audio / Voice Calling', icon: Mic },
              { id: 'broadcast', label: 'Interactive Live Broadcast', icon: Radio },
              { id: 'messaging', label: 'In-Room Real-time Chat (DataChannel)', icon: MessageSquare },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFeature(f.id as FeatureTab)}
                  className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer border ${
                    activeFeature === f.id
                      ? 'bg-accent text-white border-accent '
                      : 'bg-white text-ink border-line hover:bg-paper'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* SDK Code Snippet Box */}
          <div className="bg-console rounded-lg border border-console-line  overflow-hidden">
            <div className="bg-console px-4 py-3 flex items-center justify-between border-b border-console-line">
              <span className="font-mono text-xs font-bold text-slate-300">
                {SDK_GUIDES[activeSdk][activeFeature].title}
              </span>
              <button
                onClick={() =>
                  copyToClipboard(
                    `${SDK_GUIDES[activeSdk][activeFeature].guide}\n\n${SDK_GUIDES[activeSdk][activeFeature].code}`,
                    `sdk-${activeSdk}-${activeFeature}`,
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-console-line hover:bg-console-line text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedKey === `sdk-${activeSdk}-${activeFeature}` ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy Code
                  </>
                )}
              </button>
            </div>

            {/* Quick Setup Guide */}
            <div className="p-4 bg-console/60 border-b border-console-line/80">
              <div className="text-[10px] font-bold text-slate-400 mb-1">
                Prerequisites & Setup
              </div>
              <pre className="font-mono text-xs text-indigo-300 overflow-x-auto whitespace-pre-wrap">
                <code>{SDK_GUIDES[activeSdk][activeFeature].guide}</code>
              </pre>
            </div>

            {/* Code Body */}
            <div className="p-4 overflow-x-auto max-h-[500px]">
              <pre className="font-mono text-xs text-slate-200 leading-relaxed">
                <code>{SDK_GUIDES[activeSdk][activeFeature].code}</code>
              </pre>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-12 bg-white border-t border-line py-6 px-6 text-center text-xs text-muted">
        Nexora RTC Platform • Self-Hosted WebRTC Control Plane & Media Mesh • Developer Documentation v1.0.0
      </footer>
    </div>
  );
}
