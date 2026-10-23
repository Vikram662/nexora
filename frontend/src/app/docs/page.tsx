'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchOrganizationData, getApiBaseUrl, getLivekitWsUrl, Project } from '@/lib/api';

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
  short: string;
  title: string;
  endpoint: string;
  badge?: string;
  desc: string;
  link?: { href: string; label: string };
  request: string;
  response: string;
}

  // FULL APPLICATION-FACING APIS FOR CALL, VIDEO, BROADCAST, AND CHAT
  const APPLICATION_APIS: ApiDocItem[] = [
    {
      short: 'Video call pass',
      title: 'Get a pass for a video call',
      endpoint: 'POST /v1/tokens',
      desc: 'A short-lived pass with camera, mic and screen sharing. The app joins your LiveKit server with it.',
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
      short: 'Voice call pass',
      title: 'Get a pass for a voice call',
      endpoint: 'POST /v1/tokens',
      desc: 'Add canPublishSources: ["microphone"] and the camera stays off. Charged at the audio rate.',
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
      short: 'Broadcast passes',
      title: 'Passes for a broadcast',
      endpoint: 'POST /v1/tokens',
      desc: 'The host can publish; viewers get canPublish: false and are charged at the broadcast rate.',
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
      short: 'Rooms',
      title: 'Open, list and close rooms',
      endpoint: 'POST /v1/rooms | GET /v1/rooms | GET /v1/rooms/{room} | DELETE /v1/rooms/{room}',
      desc: 'Room names belong to your project, so they never clash with another customer’s.',
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
      short: 'People in a room',
      title: 'See, mute or remove people',
      endpoint: 'GET .../participants | DELETE .../participants/{id} | POST .../mute | PATCH .../permissions',
      desc: 'Moderate a live room, or let a viewer speak.',
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
      short: 'Send a message',
      title: 'Send a message into a room',
      endpoint: 'POST /v1/rooms/{room}/messages',
      desc: 'Reach everyone in the room, or only the people you name.',
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
      short: 'In-room chat',
      title: 'Chat between people in a call',
      endpoint: 'WebRTC P2P DataChannel Protocol',
      desc: 'Chat stays inside the call and is never saved.',
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
      short: 'Recording',
      title: 'Start and stop recording',
      endpoint: 'POST /v1/rooms/{room}/recording/start | POST .../stop | GET .../status',
      desc: 'The file goes to the bucket you connected in the dashboard.',
      badge: 'being tested',
      link: { href: '/user/storage', label: 'Connect a storage bucket in the dashboard' },
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
      short: 'Past recordings',
      title: 'List past recordings',
      endpoint: 'GET /v1/recordings',
      desc: 'Room, file name, length, size and status for each recording.',
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

  const guide = SDK_GUIDES[activeSdk][activeFeature];
  const guideKey = `sdk-${activeSdk}-${activeFeature}`;

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-8 pb-[88px] flex flex-wrap items-start gap-x-14 gap-y-8">
      <nav aria-label="Docs" className="flex-[1_1_220px] rounded-[10px] bg-cream px-[22px] pt-[22px] pb-[18px] text-[15px] lg:sticky lg:top-6">
        <p className="text-[13px] font-semibold text-bark-muted">From your server</p>
        <ol className="mt-2">
          {APPLICATION_APIS.map((api, index) => (
            <li key={api.title}>
              <a href={`#api-${index + 1}`} className="block py-1.5 text-bark hover:text-moss transition-colors">
                {api.short}
              </a>
            </li>
          ))}
        </ol>
        <p className="mt-[18px] text-[13px] font-semibold text-bark-muted">In your app</p>
        <a href="#sdks" className="block mt-2 py-1.5 text-bark hover:text-moss transition-colors">
          Quickstarts
        </a>
      </nav>

      <div className="flex-[999_1_640px] min-w-0">
        <h1 className="max-w-[720px] text-[40px] sm:text-[54px] leading-[1.04] tracking-[-0.02em]">Developer docs</h1>
        <p className="mt-4 max-w-[620px] text-lg leading-relaxed text-bark-soft">
          Everything here is called from your backend with a project key and secret. Keys, storage, update endpoints
          and billing live in the dashboard.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[10px] bg-cream px-[18px] py-3.5 text-[15px]">
          {projects.length > 0 ? (
            <>
              <label htmlFor="activeKey" className="text-bark-muted">
                Show examples with
              </label>
              <select
                id="activeKey"
                value={selectedApiKey}
                onChange={(e) => setSelectedApiKey(e.target.value)}
                className="min-h-10 max-w-full rounded-lg border border-crust bg-white px-3 py-1.5 font-plex text-[13px] text-bark"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.apiKeyPrefix}>
                    {p.name} ({p.environment}) — {p.apiKeyPrefix}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span className="text-bark-muted">Showing examples with</span>
              <span className="rounded-lg border border-crust bg-white px-3 py-1.5 font-plex text-[13px] break-all">
                {selectedApiKey} (sandbox demo)
              </span>
            </>
          )}
          <span className="font-plex text-xs text-bark-muted break-all">API: {apiBaseUrl}</span>
        </div>

        <section id="app-apis" aria-label="Server APIs" className="mt-9">
          {APPLICATION_APIS.map((api, index) => (
            <details key={api.title} id={`api-${index + 1}`} open={index === 0} className="mb-3 scroll-mt-6 overflow-hidden rounded-[10px] bg-cream">
              <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-5 gap-y-1.5 px-6 py-5">
                <span className="font-serif text-[23px]">
                  {api.title}
                  {api.badge && <span className="ml-2.5 font-body text-[13px] font-semibold text-ember">· {api.badge}</span>}
                </span>
                <span className="font-plex text-[12.5px] text-moss">{api.endpoint.replace(/ \| /g, ' · ')}</span>
              </summary>
              <div className="px-6 pb-6">
                <p className="max-w-[640px] text-base leading-relaxed text-bark-soft">
                  {api.desc}
                  {api.link && (
                    <>
                      {' '}
                      <Link href={api.link.href} className="text-moss underline underline-offset-4">
                        {api.link.label}
                      </Link>
                    </>
                  )}
                </p>
                <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3">
                  <CodePanel
                    label="You send"
                    code={api.request}
                    tone="text-sand"
                    copied={copiedKey === `req-${index}`}
                    onCopy={() => copyToClipboard(api.request, `req-${index}`)}
                  />
                  <CodePanel
                    label="You get back"
                    code={api.response}
                    tone="text-amber-code"
                    copied={copiedKey === `res-${index}`}
                    onCopy={() => copyToClipboard(api.response, `res-${index}`)}
                  />
                </div>
              </div>
            </details>
          ))}
        </section>

        <section id="sdks" aria-labelledby="sdks-heading" className="mt-14 scroll-mt-6">
          <h2 id="sdks-heading" className="text-[32px] sm:text-[40px] leading-[1.1] tracking-[-0.015em]">
            Quickstarts for your app
          </h2>
          <p className="mt-2.5 max-w-[620px] text-base leading-relaxed text-bark-soft">Choose where your app runs, then what you’re building.</p>

          <div role="group" aria-label="Platform" className="mt-[22px] flex flex-wrap gap-2">
            {PLATFORMS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={activeSdk === id}
                onClick={() => setActiveSdk(id)}
                className={`min-h-11 rounded-full border px-[18px] py-2.5 text-[15px] cursor-pointer transition-colors ${
                  activeSdk === id ? 'border-moss bg-moss text-cream' : 'border-crust bg-cream text-bark hover:border-bark-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Feature" className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {FEATURES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={activeFeature === id}
                onClick={() => setActiveFeature(id)}
                className={`min-h-10 py-2 text-[15px] cursor-pointer underline-offset-[6px] ${
                  activeFeature === id
                    ? 'font-semibold text-bark underline decoration-moss decoration-2'
                    : 'text-bark-muted hover:text-bark'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-[10px] bg-bark">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#4a3c30] px-[18px] py-3 text-[13px] text-sand">
              <span>{guide.title}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(`${guide.guide}\n\n${guide.code}`, guideKey)}
                className="py-1 text-taupe hover:text-cream cursor-pointer"
              >
                {copiedKey === guideKey ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="m-0 border-b border-[#4a3c30] px-[18px] py-3.5 font-plex text-xs leading-relaxed text-amber-code whitespace-pre-wrap">
              <code>{`# before you start\n${guide.guide}`}</code>
            </pre>
            <pre className="m-0 max-h-[560px] min-h-[200px] overflow-auto p-[18px] font-plex text-xs leading-[1.65] text-sand">
              <code>{guide.code}</code>
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}

const PLATFORMS: [SdkTab, string][] = [
  ['android', 'Android'],
  ['flutter', 'Flutter'],
  ['ios', 'iPhone'],
  ['web', 'Web'],
];

const FEATURES: [FeatureTab, string][] = [
  ['video', 'Video calls'],
  ['voice', 'Voice calls'],
  ['broadcast', 'Broadcasts'],
  ['messaging', 'Chat'],
];

interface CodePanelProps {
  label: string;
  code: string;
  tone: string;
  copied: boolean;
  onCopy: () => void;
}

function CodePanel({ label, code, tone, copied, onCopy }: CodePanelProps) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg bg-bark">
      <div className="flex justify-between border-b border-[#4a3c30] px-3.5 py-2 text-xs text-taupe">
        <span>{label}</span>
        <button type="button" onClick={onCopy} className="py-1 hover:text-cream cursor-pointer">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={`m-0 max-h-80 overflow-auto p-3.5 font-plex text-xs leading-[1.65] ${tone}`}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
