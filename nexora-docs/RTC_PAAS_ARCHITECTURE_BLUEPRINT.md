# Self-Hosted RTC PaaS — Architecture & Implementation Blueprint

Sep 26, 2026 · prepared for @MYSIP Team

## 0. Executive Summary

You're building a **self-hosted, BYOS/BYOF real-time communication PaaS** — a private alternative to Agora/Twilio where you own the media plane (LiveKit + Coturn) but never touch customer data at rest. Three product primitives on day one: **1:1 / group audio-video calling**, **1-to-many live broadcast**, and **real-time chat**. The commercial wedge is the zero-storage promise: recordings land in *the developer's own* S3/R2/GCS bucket, and chat/push routes through *the developer's own* Firebase project — you are the control plane and the media plane, never the data plane.

This is a sound architecture. The stack choice (NestJS + Prisma/MySQL + Redis/BullMQ + LiveKit + Coturn, Next.js portal) is production-proven and avoids reinventing SFU/TURN, which is the one piece you should never build yourself.

**What the original spec covers well:** architecture flow, schema shape, the four core backend services, portal pages, and Docker/Coturn deployment.

**What this blueprint adds, because an "enterprise-level" version of this product lives or dies on the parts that are easy to skip in a first draft:**

1. **Multi-tenancy & RBAC** — the original schema has `Project` (API keys) but no team/role model. Real B2B customers have multiple engineers with different access levels under one paying account.
2. **A proof mechanism for "zero-data storage,"** not just a policy. Egress *must* transiently touch local disk before upload — the enterprise version needs a hard TTL wipe, a signed audit trail of every touch, and this stated explicitly in your DPA, or the claim doesn't survive a security questionnaire.
3. **Outbound webhooks *to developers*** (recording done, low balance, usage threshold) — you're consuming LiveKit's webhooks, but you also need to emit your own, HMAC-signed, with retry/backoff/dead-letter. Every serious Agora/Twilio competitor is graded on this.
4. **Credential-access audit logging** — you're storing developers' cloud keys and Firebase service accounts encrypted at rest. Every decrypt operation (by your own backend, at egress time) needs to be logged with actor, purpose, and timestamp, or you cannot pass a SOC2 Type II review later.
5. **TURN-relay bandwidth capacity planning with realistic worst-case assumptions** — the spec asks for "network throughput calculations" but the single biggest cost/capacity risk in any self-hosted RTC platform is *what fraction of sessions relay 100% of their media through Coturn* (corporate networks with symmetric NAT can push this to 60–100%, not the "textbook" 15–20%). Sizing on the optimistic number is the most common reason self-hosted RTC platforms fall over at their first enterprise customer.
6. **Connection-resilience contract** — token expiry mid-call, reconnect-with-same-identity, and rolling deploys of the signaling backend *without dropping active rooms* (LiveKit's SFU nodes are stateful per-room; your NestJS gateway is not, and needs to be treated as disposable).
7. **Rate limiting & abuse prevention at the room-creation layer**, not just at the HTTP API layer — a leaked developer API key can otherwise be used to spin up unlimited concurrent rooms against your media nodes.
8. **Observability stack** — Prometheus/Grafana for LiveKit + Coturn + Node-level metrics, structured logging, and SLO-based alerting. Without this you find out about a media-node outage from a customer's support ticket.
9. **A phased rollout plan and a capacity/cost cheat-sheet with real numbers** (§8), so "enterprise-level" isn't just a qualifier but a sequence you can actually execute.

Each addition is folded into the relevant section below and also called out explicitly where it's new, so you can see exactly what was in your original request versus what's being added.

---

### Implementation Status Matrix (Audit Tracking)

| Blueprint Section | Architecture Component | Implementation Status | Current Codebase State |
| :--- | :--- | :--- | :--- |
| **§1. System Architecture** | High-level data flow, key separation | ✅ **Implemented** | Dual credential domains, LiveKit JWT metadata round-tripping |
| **§2. Database Schema** | Multi-tenancy, Projects, GST Invoices | ✅ **Implemented** | Single source of truth in `backend/prisma/schema.prisma` |
| **§3.1–§3.3 Services** | Token Service, Ingress, Tenant Guard | ✅ **Implemented** | `LivekitTokenService`, `ApiKeyGuard`, `JwtAuthGuard` |
| **§3.4 Egress Dispatcher**| S3/R2/GCS Recording worker | ⏳ **Planned** | Metadata in schema; background worker planned for BullMQ pipeline |
| **§3.5 Billing Worker** | BullMQ Webhook billing consumer | ⏳ **Planned** | Atomic real-time billing implemented; BullMQ async worker planned |
| **§3.6 Outbound Webhooks**| Webhook dispatch with HMAC retry | 🟡 **Partial** | Endpoints and signatures modeled in Prisma schema |
| **§3.7 Rate Limiter** | Redis sliding window room limits | 🟡 **Partial** | Global `@nestjs/throttler` implemented; per-room limiter planned |
| **§3.8–§3.10 AI & Broadcast**| BYOK Voice Agent, RTMP Ingress | ⏳ **Planned** | Data models present in schema; media agent dispatchers planned |
| **§4. Developer Portal** | Next.js Console & Admin Ops Center | ✅ **Implemented** | Role-based navigation, KYC review, wallet ledger, interactive sandbox |
| **§5. Docker & Coturn** | Multi-node deployment, TURN relay | ✅ **Implemented** | Environment-injected secrets, loopback-bound Redis |
| **§6. Security & Compliance**| Key rotation, fail-fast crypto, timing safe | ✅ **Implemented** | 32-byte master key check, `crypto.timingSafeEqual`, constant-time auth |

---
## 1. System Architecture & Data Flow

### 1.1 High-level architecture

```
┌─────────────────┐        ┌──────────────────────┐
│ Developer Client │        │  Developer's Backend  │
│ (Web/iOS/Android/│◄──────►│  (issues app-level     │
│  Flutter — our   │  App   │   auth, calls our      │
│  thin SDK wraps  │  Auth  │   REST API server-side)│
│  LiveKit SDK)     │        └───────────┬───────────┘
└────────┬─────────┘                     │ x-api-key + x-api-secret (HTTPS)
         │                               ▼
         │                    ┌─────────────────────────────┐
         │  WSS (LiveKit      │   OUR CONTROL PLANE          │
         │  protocol, direct  │  ┌────────────┐ ┌──────────┐ │
         │  to media node)    │  │ Next.js    │ │ NestJS   │ │
         │                    │  │ Developer  │ │ API      │ │
         │                    │  │ Portal     │ │ Gateway  │ │
         │                    │  └────────────┘ └────┬─────┘ │
         │                    │        MySQL ◄────────┤       │
         │                    │        Redis+BullMQ ◄─┤       │
         │                    └────────────────────────┼──────┘
         │                                             │ mint LiveKit JWT
         │                                             │ (internal key, never
         ▼                                             │  exposed to developer)
┌───────────────────────────────────────────────────────────────┐
│                     OUR MEDIA PLANE                            │
│  ┌───────────────┐   ┌────────────────┐   ┌─────────────────┐ │
│  │ LiveKit SFU    │   │ LiveKit Egress │   │ Coturn (STUN/   │ │
│  │ cluster (Redis-│──►│ (composite/    │   │ TURN) — relay   │ │
│  │ backed mesh)   │   │  track record) │   │ when P2P blocked│ │
│  └───────┬───────┘   └────────┬───────┘   └─────────────────┘ │
│          │ webhooks (room/    │ direct signed upload            │
│          │ participant/track  │ (S3-compatible API call,        │
│          │ events)            │ credentials decrypted           │
│          ▼                    │ just-in-time, never cached)     │
│  ┌──────────────────┐         │                                │
│  │ Webhook + Billing │         │                                │
│  │ Worker (BullMQ)   │         │                                │
│  └──────────────────┘         │                                │
└────────────────────────────────┼────────────────────────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │  DEVELOPER'S OWN CLOUD        │
                    │  AWS S3 / Cloudflare R2 / GCS │  ◄── recordings land here,
                    │  (BYOS)                       │      never on our disks
                    └─────────────────────────────┘

   Chat / push path (separate from media path):
   Client SDK ──writes directly──► Developer's own Firebase (Firestore/RTDB)
   Our backend ──uses developer's FCM Admin creds, just-in-time──► FCM push
   (only for call-signaling pushes like "incoming call"; never proxies chat text)
```

Three things this diagram makes explicit that are easy to gloss over in prose:

1. **The client never talks to our NestJS gateway for media.** It talks to NestJS once to get a token, then connects *directly* to the LiveKit media node over WSS. NestJS is on the control path, never the media path — this is what makes the gateway horizontally scalable and stateless.
2. **Chat has no server hop through us at all in steady state.** The client SDK writes straight to the developer's Firebase project. We are not a message broker for chat — this is the literal mechanism behind the zero-storage claim for chat, not just a policy.
3. **Two separate credential domains exist**, addressed next — this is the single most important design decision the original spec left implicit.

### 1.2 Design decision: two separate key domains (added clarity)

The original spec says tokens are generated "based on client API keys" — but LiveKit itself needs its *own* API key/secret pair to sign/verify JWTs, and if every `Project` had its own LiveKit key pair, you'd need to hot-reload LiveKit's key store on every signup, which OSS LiveKit isn't built for (its `keys:` map is loaded at process start). The clean fix — the same pattern Agora and Twilio actually use internally:

- **Platform API Key/Secret** (`Project.apiKey` / `apiSecretHash`) — the credential a developer's *backend* uses to call *our* REST API (`/v1/token`, `/v1/recordings`, etc.). Rotatable per project, never touches LiveKit.
- **Internal LiveKit Key/Secret** — one pair (or a small rotating set, e.g. one active + one previous for zero-downtime rotation) held only by our NestJS backend in a secrets manager. Never exposed to developers. Used to mint every LiveKit JWT, for every tenant, on our shared LiveKit cluster.
- Every LiveKit JWT we mint embeds a custom `metadata` claim of `{ "projectId": "...", "identity": "..." }`. When LiveKit later fires a webhook (`participant_left`, `room_finished`), that metadata round-trips back to us, which is how the Billing Worker (§3) attributes usage to the right project without a separate lookup table keyed by room name.

This also means **one shared LiveKit cluster serves every tenant** — you don't stand up per-customer LiveKit deployments, which would defeat the economics of a PaaS.

### 1.3 Auth & room-join sequence

1. Developer's backend calls `POST /v1/tokens` on our NestJS gateway with `x-api-key` + `x-api-secret` (or a short-lived signed request), `roomName`, `participantIdentity`, and a `grants` object (`canPublish`, `canSubscribe`, `canPublishData`, `roomAdmin`, `recorder`).
2. **API Key Guard** (§3) hashes the incoming secret, looks up the `Project` row, checks: project not suspended, wallet balance > 0 (or plan allows overage), per-project rate limit not exceeded, and — importantly — **concurrent-room / concurrent-participant caps for that project's plan tier** (added; see §7). Rejects with a typed error code before touching LiveKit if any check fails.
3. **LiveKit Token Service** mints a LiveKit JWT using the *internal* key (§1.2), TTL default 10 minutes (configurable per project, capped at a platform max — see §7 for why a hard cap matters), embedding the `grants` and the `projectId` metadata claim.
4. Token returned to the developer's backend, which relays it to its own client app over its own transport (this hop is entirely the developer's responsibility — we never see the end-user's session).
5. Client app hands the token to our thin client SDK (a thin wrapper around `livekit-client` / `livekit-react-native` / LiveKit's iOS/Android/Flutter SDKs that additionally wires in our reconnect and analytics conventions — see §7.1 for why a thin wrapper, not a fork).
6. SDK opens a WSS connection directly to the LiveKit SFU (via a load balancer / Redis-aware router that places the connection on the node already hosting that room, or a fresh node if the room doesn't exist yet).
7. LiveKit validates the JWT signature against the internal key, applies the embedded grants, and admits the participant to the room's SFU session.
8. LiveKit emits `participant_joined` → our Webhook Worker consumes it, opens (or updates) a `UsageLog` row with `startedAt`, `roomType`, `projectId` — billing accrual starts here, not at token-issue time (a developer can mint a token and never join; you must not bill for that).

### 1.4 Recording / egress data flow

1. Developer calls `POST /v1/recordings/start` with a `roomName` and (optionally) which storage target to use if the project has more than one configured.
2. **Egress Dispatcher** (§3) loads the project's `StorageConfig`, decrypts the credentials *in memory, for this request only*, and calls the LiveKit Egress API's `RoomCompositeEgressRequest` with a `directFileOutput`/`S3Upload` (or `GCSUpload`) block pointing at the developer's own bucket — R2 and most S3-compatible providers use the same `S3Upload` shape with a custom endpoint, GCS gets its own upload config.
3. LiveKit's Egress worker composites and encodes on **local ephemeral disk on the media node** — this is unavoidable (you cannot stream-encode a composite without a working buffer) and is the one place the "zero storage" claim needs a technical backstop, not just a promise: a hard-coded max TTL (e.g. 2 minutes post-upload) enforced by both LiveKit's own cleanup *and* an independent sweep cron on the media nodes, with the sweep's deletions logged (§6).
4. On success, the file is uploaded directly to the developer's bucket; LiveKit fires `egress_ended`.
5. Webhook Worker verifies the egress status is `EGRESS_COMPLETE` (not just "webhook received" — LiveKit can report partial failures), writes a `Recording` metadata row (object key + bucket + duration + size — **never the file itself, never a proxied download URL through our infra**), and enqueues **our own outbound webhook** (`recording.completed`, HMAC-signed — §3, §6) to the developer's registered endpoint.
6. On failure (bad/expired developer credentials, bucket ACL rejection, network partition to the target cloud), the job goes to a **dead-letter queue** with the failure reason surfaced both in the portal and via an outbound `recording.failed` webhook — added, because "the upload silently didn't happen" is the single worst failure mode for a recording feature and the original spec doesn't address it.

### 1.5 Chat & push (BYOF) data flow

The steady-state path has **no server hop through us at all**: the client SDK writes chat messages directly to the developer's own Firestore/Realtime Database using the developer's own Firebase client config (already embedded in their app — we never see message content). This is what makes "zero storage for chat" a mechanical fact rather than a policy.

Our backend touches the developer's Firebase in exactly one place: **call-signaling push notifications**. When a room is created targeting a specific `participantIdentity` who isn't yet connected (e.g. "incoming call"), our backend uses the developer's uploaded Firebase Admin service-account credential — decrypted just-in-time, used for a single Admin SDK call, then discarded from memory, never cached — to send an FCM data message. This is necessary because LiveKit has no mechanism to wake a backgrounded/killed mobile app; FCM is the only way. It is the one legitimate exception to "we never touch developer data," and it should be named explicitly as such in your DPA/ToS rather than left implicit.

### 1.6 AI Voice Agent (BYOK) data flow (added — a 4th capability, not in the original three)

A real-time conversational AI that can join any room as a participant — it hears a human speaker, transcribes their speech, reasons over it with an LLM, and speaks a response back, all inside the same call, with low enough latency to feel like a conversation rather than a voicemail exchange.

**Why this fits the existing architecture with almost no new media infrastructure:** LiveKit's open-source **Agents** framework runs exactly this STT→LLM→TTS pipeline as a normal LiveKit participant — it joins a room over the same WSS/SFU path any human client does (§1.1), using an internal LiveKit token like the recorder bot already does (§3.3's `recorder` grant gets a sibling `agent` grant here). No second real-time transport, no new SFU — the "AI participant" is just another set of published/subscribed audio tracks from the SFU's point of view.

**Why BYOK, not our own AI subscription:** identical reasoning to BYOS (§1.4) and BYOF (§1.5) — we are the control plane and the media plane, never the data plane, and that now extends to conversation content too. The developer supplies their own API key for every stage of the pipeline (an LLM provider, a speech-to-text provider, a text-to-speech provider — ElevenLabs-style voice providers being the common choice for the TTS leg); we never resell or subsidize AI provider access, never see billing for their LLM/TTS usage, and — critically for the zero-data-storage claim (§6.3) — never persist the transcript or the audio content ourselves. Turn-detection/voice-activity-detection is the one piece that's bundled (an open-source model, e.g. Silero VAD) rather than BYOK, since it needs no external account and runs entirely inside our own agent worker process.

**Multi-language, including Hinglish-style code-switching:** `AiAgentProfile.language` (§2) is a BCP-47 tag passed straight through to the STT provider as its recognition language, and used to filter the TTS voice picker (§4.11) to voices that actually speak that language. For a genuinely bilingual audience, set it to whichever sentinel value the developer's chosen STT/TTS vendor uses for auto-detection/code-switching (several of Deepgram's and ElevenLabs' models handle mixed Hindi-English speech directly) rather than forcing a single fixed language — but this is vendor-dependent, not something we can guarantee across every `AiVendor` (§2), so the portal's verify step (§4.11) should surface plainly whether the selected vendor/model actually supports it before the developer builds around an assumption it doesn't hold.

**Flow:**

1. Developer's backend calls `POST /v1/ai-agents/dispatch` with a `roomName` and an `agentProfileId` (§2's `AiAgentProfile` — the persona/system-prompt, configured once in the portal, §4.11).
2. **AI Agent Dispatcher** (§3.9) checks the project has all three required `AiProviderConfig` rows (LLM, STT, TTS — §2), decrypts each key *in memory, for this session only*, and logs the decrypt to `CredentialAccessLog` (`targetType: "AiProviderConfig"`) — the exact same audited-decrypt discipline as egress (§3.4) and the FCM bridge (§1.5).
3. Dispatcher mints an internal LiveKit token with an `agent: true` grant and hands it, along with the decrypted keys, to a worker process from our own agent worker pool (compute we run, not LiveKit media-node capacity).
4. The worker joins the room, runs the STT→LLM→TTS loop turn by turn, and publishes synthesized speech back as a normal audio track — from every other participant's perspective, the agent is just another participant talking.
5. Live transcript segments (STT output) are sent over LiveKit's data channel (`canPublishData`) in real time, so the client app can render live captions — this is relayed, never stored on our side; if the developer wants a durable transcript log, that's their own client-side responsibility (or their own Firebase, §1.5), consistent with the zero-storage claim extending to this pipeline too.
6. An `AiAgentSession` row (§2) tracks `startedAt`/`endedAt` for billing, closed either when the room ends or the developer explicitly calls a stop endpoint — decrypted keys are discarded from the worker's memory the moment the session ends, never written to disk, never logged.

**Billing has two independent components, not one:** the agent's audio track consumes SFU bandwidth exactly like a human participant's, so it's already covered by the existing per-minute `UsageLog` billing (§3.5) with no special-casing needed. Running the STT/LLM/TTS orchestration loop itself, though, is *our own compute*, separate from LiveKit's media forwarding — that gets its own metered line item via `AiAgentSession.ratePerMinute`, priced through the same `PlanRateCard` mechanism from §4.9 (see §4.11). The developer's own AI provider bills (OpenAI/ElevenLabs/etc. token costs) are between them and their provider — we never see or mark those up.

### 1.7 Live Broadcast (1-to-many) data flow (added — `RoomType.LIVE_BROADCAST` existed as an enum value from the start, but was never actually architected beyond that)

"1-to-many" hides a real fork in the road: a broadcast with a few hundred interactive viewers and a broadcast with fifty thousand passive ones are not the same engineering problem, and treating them as one leads to either over-paying for WebRTC infrastructure you don't need, or under-delivering the latency an interactive audience expects. This blueprint splits it into two delivery modes, chosen per broadcast, not baked into the architecture as one-size-fits-all:

**Mode A — `WEBRTC_SFU`** (small/medium audiences, sub-second latency, real interactivity): viewers connect to the same LiveKit SFU cluster as any call (§1.1), with tokens minted `canPublish: false, canSubscribe: true` — the backend enforces this based on a `role: 'HOST' | 'VIEWER'` param on the token-creation call, never trusting the client to self-report which one it is. Because viewers don't publish, the SFU's fan-out cost is linear in viewer count (one copy of the host's stream forwarded to each viewer), not the N² math §5.3 describes for a fully-interactive group call — meaningfully cheaper per-viewer than a call participant, but still real per-viewer SFU bandwidth that must be sized and load-tested (§7.5) rather than assumed unlimited. A viewer can be promoted to co-host at any time by re-issuing a token (or, on newer LiveKit versions, updating the participant's grants server-side without a reconnect) — the same "Live" experience as Twitter Spaces/Instagram Live guest requests.

**Mode B — `HLS_CDN`** (mass audiences, 3–10s latency, one-way): LiveKit Egress reads the room's composited output and segments it into HLS, uploaded continuously to the developer's own CDN-fronted storage (the exact same BYOS bucket/credentials as recording egress, §1.4 — no new storage relationship needed). Viewers hit that CDN URL with a plain `<video>`/HLS player — **they never open a connection to our infrastructure at all.** This is the mode that actually scales to tens of thousands of viewers, because the viewer count stops being our problem the moment segments land on the developer's CDN; it's also the mode where we have **zero visibility into audience size** — `BroadcastSession.peakViewerCount` (§2) stays null in this mode by design, the same zero-data-plane principle §0/§6.3 already applies to recordings and chat, now extended to "we don't even know how many people are watching."

**Getting content in — two ways:**

1. **SDK publish** (default): the host's client app captures camera/mic and publishes directly, exactly like a call participant (§1.3) — no new mechanism.
2. **RTMP ingest, for OBS-style broadcasters**: `POST /v1/broadcasts/:id/ingest` creates a LiveKit **Ingress** resource and returns a one-time RTMP URL + stream key for the host to paste into OBS/Streamlabs/whatever hardware encoder they use. LiveKit converts the incoming RTMP into a normal published track — downstream, viewers and Egress can't tell the difference between an SDK publisher and an OBS feed.

**Getting content out, beyond our own viewers — restreaming:** a developer can configure one or more `RestreamDestination` rows (§2) — their own YouTube/Facebook/Twitch (or any RTMP-accepting) ingest URL and stream key, encrypted the same way as any other BYO credential (§3.2). Egress pushes the same composited output to every configured destination simultaneously, alongside (or instead of) delivery to our own viewers. We relay to it; we never touch, manage, or take a cut of the developer's account on that platform — same BYO-everything posture as the rest of this doc.

**Chat during a broadcast** reuses §1.5's BYOF path unchanged — a live chat overlay is just the client SDK writing to the developer's own Firebase, whether the viewer is on `WEBRTC_SFU` or watching an `HLS_CDN` stream with no LiveKit connection at all; chat and video are already on entirely separate paths, so broadcast mode doesn't complicate that story.

## 2. MySQL Database Schema (Prisma)

Models marked **← added** aren't in the original request — they exist because a real B2B customer has more than one engineer, every credential decrypt needs to be provable later, and outbound webhooks need their own delivery ledger.

```prisma
// ---------- Identity & Org ----------

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  phone         String?  @unique  // ← added: OTP login can go through either channel
  passwordHash  String?  // optional — OTP is the primary login path (see §4.4); keep the
                          // column for an eventual "set a password too" convenience option
  name          String?
  mfaSecret     String?  // TOTP secret, encrypted — added: enterprise buyers ask for MFA in the first call
  mfaEnabled    Boolean  @default(false)
  memberships   OrgMember[]
  otpVerifications OtpVerification[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

enum OtpChannel {
  EMAIL
  PHONE
}

enum OtpPurpose {
  LOGIN
  SIGNUP
}

// ← added: OTP-based passwordless login, either channel at the user's choice (§4.4)
// (email ships first; PHONE is already modeled so turning it on later via MSG91 is a
// feature flag, not a migration)
model OtpVerification {
  id          String     @id @default(uuid())
  userId      String?    // null until an existing user is matched or a new one is created on first login
  user        User?      @relation(fields: [userId], references: [id], onDelete: Cascade)
  channel     OtpChannel
  destination String     // the raw email address or E.164 phone number the code was sent to
  purpose     OtpPurpose @default(LOGIN)
  codeHash    String     // argon2/sha256 hash of the 6-digit code — never store the plaintext OTP
  attempts    Int        @default(0)
  maxAttempts Int        @default(5)
  expiresAt   DateTime   // short TTL, e.g. 5 minutes
  consumedAt  DateTime?
  createdAt   DateTime   @default(now())

  @@index([destination, purpose, createdAt])
}

// ← added: real B2B accounts are teams, not single users
model Organization {
  id            String       @id @default(uuid())
  name          String
  walletBalance Decimal      @default(0.00) @db.Decimal(12, 4) // Decimal, not Float — money math
  planTier      PlanTier     @default(STARTER)
  billingEmail  String

  autoRechargeEnabled   Boolean  @default(false) // ← added — §4.7
  autoRechargeThreshold Decimal? @db.Decimal(12, 4)
  autoRechargeAmount    Decimal? @db.Decimal(12, 4)
  razorpayMandateId     String?  // saved payment method / e-mandate token for auto-recharge (§4.7)

  kycVerification KycVerification?  // ← added — §4.5
  billingProfile  BillingProfile?   // ← added — §4.6
  notificationPreference NotificationPreference? // ← added — §3.8
  rateOverrides   OrganizationRateOverride[] // ← added — §4.9, negotiated Enterprise rates
  offerRedemptions WalletOfferRedemption[]   // ← added — §4.10, recharge bonus history
  members       OrgMember[]
  projects      Project[]
  transactions  Transaction[]
  invoices      Invoice[]           // ← added — §4.6
  createdAt     DateTime     @default(now())
  updatedAt     DateTime    @updatedAt
}

enum OrgRole {
  OWNER      // billing + can delete org
  ADMIN      // manage projects, storage/firebase config, webhooks
  DEVELOPER  // read-only API keys, no config changes, no billing
  BILLING    // wallet/invoices only, no API/config access
}

// ← added: RBAC — the original schema had no team model at all
model OrgMember {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           OrgRole      @default(DEVELOPER)
  invitedAt      DateTime     @default(now())
  acceptedAt     DateTime?

  @@unique([organizationId, userId])
}

// ---------- Notifications (added — §3.8) ----------

enum NotificationChannel {
  EMAIL
  SMS
}

enum NotificationType {
  WELCOME
  KYC_APPROVED
  KYC_REJECTED
  LOW_BALANCE
  INVOICE_GENERATED
  PAYMENT_RECEIVED
  REFUND_PROCESSED             // ← added — §4.7: refund.processed webhook confirmed, wallet debited
  AUTO_RECHARGE_FAILED
  WEBHOOK_ENDPOINT_DEGRADED   // your outbound webhook (§3.6) has failed repeatedly — tell the developer
  API_KEY_ROTATED
  SECURITY_ALERT              // new device login, IP allowlist changed, etc.
  PLAN_LIMIT_REACHED          // ← added — §4.9: project keeps hitting maxConcurrentRooms, not a
                                // balance problem — nudge toward a plan upgrade, not a recharge
}

model NotificationPreference {
  id                 String       @id @default(uuid())
  organizationId     String       @unique
  organization       Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  emailEnabled       Boolean      @default(true)
  smsEnabled         Boolean      @default(false) // off by default — SMS costs money once MSG91 (§4.4) is live
  criticalOnlyViaSms Boolean      @default(true)  // even with SMS on, only LOW_BALANCE/SECURITY_ALERT
                                                    // go by SMS — everything else stays email-only
  updatedAt          DateTime     @updatedAt
}

// ← added: delivery audit trail — "did the customer actually get told" needs an answer, not a guess
model NotificationLog {
  id             String              @id @default(uuid())
  organizationId String
  type           NotificationType
  channel        NotificationChannel
  destination    String              // email or phone actually used
  status         NotificationStatus  @default(QUEUED)
  providerRef    String?             // email provider message-id or MSG91 message-id
  errorReason    String?
  createdAt      DateTime            @default(now())

  @@index([organizationId, createdAt])
}

enum NotificationStatus {
  QUEUED
  SENT
  FAILED
}

// ---------- KYC / business verification (added — §4.5) ----------

enum KycStatus {
  NOT_STARTED
  PENDING_REVIEW
  VERIFIED
  REJECTED
}

enum KycDocumentType {
  PAN               // mandatory — every Indian individual or business has one
  AADHAAR           // individual / sole-proprietor accounts, ideally via DigiLocker (§4.5)
  GSTIN             // registered businesses — also required for GST-compliant invoicing (§4.6)
  COMPANY_CIN       // MCA Certificate of Incorporation, for Pvt Ltd / LLP accounts
  UDYAM             // MSME Udyam registration — common for Indian startups
}

model KycVerification {
  id                      String          @id @default(uuid())
  organizationId          String          @unique
  organization            Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  documentType            KycDocumentType
  encryptedDocumentNumber String          @db.Text // PAN/GSTIN/CIN/Aadhaar number, AES-256-GCM (§3.2)
  encryptionIv            String
  encryptionAuthTag       String
  keyVersion              Int             @default(1)

  documentFileKey         String?         // path in OUR OWN private compliance bucket — never the
                                           // developer's BYOS bucket (§1.4's bucket is for THEIR
                                           // customers' recordings, not our KYC records on THEM)
  verifiedViaDigiLocker   Boolean         @default(false) // ← true when pulled via DigiLocker (§4.5),
                                                            // skips manual document upload entirely

  status                  KycStatus       @default(NOT_STARTED)
  reviewedByStaffId       String?         // internal admin who approved/rejected a manual submission
  reviewedAt              DateTime?
  rejectionReason         String?

  submittedAt             DateTime?
  createdAt               DateTime        @default(now())
  updatedAt               DateTime        @updatedAt

  @@index([status])
}

// ---------- Billing / tax profile for GST invoicing (added — §4.6) ----------

model BillingProfile {
  id                      String       @id @default(uuid())
  organizationId          String       @unique
  organization            Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  legalBusinessName       String       // exact registered name — prints on the invoice "Bill To"
  gstin                   String?      // null = unregistered/composition-scheme customer, invoice
                                        // omits GST break-up per GST rules for such buyers
  panNumber               String       // always required, even without a GSTIN
  billingAddressLine1     String
  billingAddressLine2     String?
  city                    String
  placeOfSupplyStateCode  String       // 2-digit GST state code — drives CGST+SGST vs IGST (§4.6)
  pincode                 String
  invoiceEmail            String       // where generated invoice PDFs are sent — can differ from billingEmail

  gstinSourcedFromKyc     Boolean      @default(false) // ← true once auto-filled from a VERIFIED
                                                         // KycVerification of type GSTIN, rather than
                                                         // hand-typed — see §4.6 on why these shouldn't drift

  createdAt               DateTime     @default(now())
  updatedAt               DateTime     @updatedAt
}

// ← added: the actual GST-compliant invoice record, one per billing cycle
model Invoice {
  id                String        @id @default(uuid())
  organizationId    String
  organization      Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  invoiceNumber     String        @unique // sequential per financial year, e.g. "INV-2026-000123" (§4.6)
  periodStart       DateTime
  periodEnd         DateTime
  subtotal          Decimal       @db.Decimal(12, 4)
  cgstAmount        Decimal       @default(0.00) @db.Decimal(12, 4)
  sgstAmount        Decimal       @default(0.00) @db.Decimal(12, 4)
  igstAmount        Decimal       @default(0.00) @db.Decimal(12, 4)
  totalAmount       Decimal       @db.Decimal(12, 4)
  sacCode           String        @default("998314") // confirm exact SAC with your CA before launch (§4.6)
  pdfObjectKey      String?       // stored in your own private bucket, same trust boundary as KYC docs
  billingSnapshot   Json          // a COPY of BillingProfile fields at generation time — added: if the
                                    // customer edits their address next month, last month's invoice must
                                    // still show the address that was correct when it was issued
  createdAt         DateTime      @default(now())

  @@index([organizationId, periodStart])
}

// ---------- Projects & Keys ----------

model Project {
  id               String   @id @default(uuid())
  organizationId   String
  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name             String
  environment      Environment @default(PRODUCTION) // ← added: sandbox vs prod keys, see below

  apiKeyPrefix     String   @unique // shown in UI, e.g. "pk_live_9f2a"
  apiSecretHash    String   // argon2id hash — never store raw
  apiSecretRolledAt DateTime @default(now())
  previousSecretHash String? // ← added: grace window during key rotation (see §6)
  previousSecretExpiresAt DateTime?

  ipAllowlist      Json?    // ← added: ["203.0.113.0/24", ...] — enterprise security review checklist item #1
  maxConcurrentRooms Int    @default(50)      // ← added: abuse ceiling per plan, see §7
  maxTokenTtlSeconds Int    @default(600)     // ← added: hard cap developers can't override past
  isSuspended      Boolean  @default(false)

  storageConfigs   StorageConfig[]
  firebaseConfig   FirebaseConfig?
  webhookEndpoints WebhookEndpoint[]
  usageLogs        UsageLog[]
  recordings       Recording[]
  aiProviderConfigs AiProviderConfig[] // ← added — §1.6, §4.11: BYOK LLM/STT/TTS credentials
  aiAgentProfiles   AiAgentProfile[]   // ← added — §1.6, §4.11
  aiAgentSessions   AiAgentSession[]   // ← added — §1.6, §4.11
  broadcastSessions BroadcastSession[] // ← added — §1.7, §4.12

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([organizationId])
}

enum Environment {
  SANDBOX    // ← added: fake billing, capped minutes, lets devs integrate before a card is on file
             // — available pre-KYC (§4.5); PRODUCTION requires KYC = VERIFIED
  PRODUCTION
}

// ---------- BYOS ----------

enum StorageProvider {
  AWS_S3
  CLOUDFLARE_R2
  GOOGLE_CLOUD
}

model StorageConfig {
  id              String          @id @default(uuid())
  projectId       String
  project         Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  provider        StorageProvider
  label           String          // "primary", "eu-archive", etc. — a project can have >1 (added)
  isDefault       Boolean         @default(true)

  bucketName      String
  region          String?         // required for S3/GCS, optional for R2
  endpoint        String?         // custom endpoint for R2 / S3-compatible providers

  encryptedAccessKey String  @db.Text  // AES-256-GCM ciphertext, see §3
  encryptedSecretKey String  @db.Text
  encryptionIv       String  // per-record IV, never reused
  encryptionAuthTag  String
  keyVersion         Int     @default(1) // ← added: which KMS/master key encrypted this row — needed for rotation

  lastVerifiedAt   DateTime?       // ← added: last time we test-wrote a canary object and it succeeded
  lastVerifyError  String?         @db.Text

  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  @@unique([projectId, label])
  @@index([projectId])
}

// ---------- BYOF ----------

model FirebaseConfig {
  id                        String   @id @default(uuid())
  projectId                 String   @unique
  project                   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  firebaseProjectId         String
  encryptedServiceAccountJson String @db.Text // the whole serviceAccountKey.json, encrypted
  encryptionIv              String
  encryptionAuthTag         String
  keyVersion                Int      @default(1)

  lastVerifiedAt            DateTime? // ← added: last successful test FCM send / Firestore auth check
  lastVerifyError           String?   @db.Text

  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
}

// ---------- BYOK: AI Voice Agent (added — §1.6) ----------

enum AiProviderType {
  LLM
  STT   // speech-to-text
  TTS   // text-to-speech
}

enum AiVendor {
  OPENAI
  ANTHROPIC
  GOOGLE
  DEEPGRAM
  ASSEMBLYAI
  ELEVENLABS
  PLAYHT
  CARTESIA
  AZURE_SPEECH
  CUSTOM   // any OpenAI-compatible / generic REST endpoint the developer points us at —
           // future-proofs the list without a migration every time a new vendor launches
}

// ← added: one BYOK credential per (project, providerType) — a project needs exactly one
// LLM key, one STT key, and one TTS key configured before it can dispatch an agent (§3.9)
model AiProviderConfig {
  id                String         @id @default(uuid())
  projectId         String
  project           Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  providerType      AiProviderType
  vendor            AiVendor
  encryptedApiKey   String         @db.Text // AES-256-GCM, same pattern as StorageConfig/FirebaseConfig (§3.2)
  encryptionIv      String
  encryptionAuthTag String
  keyVersion        Int            @default(1)

  modelName         String?        // e.g. "gpt-4o-realtime", "eleven_turbo_v2", "nova-2" — vendor-specific
  extraConfig       Json?          // vendor-specific knobs: voiceId for TTS, temperature for LLM, etc.

  lastVerifiedAt    DateTime?      // ← added: last successful test call against this provider
  lastVerifyError   String?        @db.Text

  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  @@unique([projectId, providerType])
}

// ← added: the agent's persona/behavior, kept separate from AiProviderConfig so a developer
// can tweak the prompt without ever re-entering an API key
model AiAgentProfile {
  id            String   @id @default(uuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name          String   // "Support Bot", "Sales Qualifier", etc.
  systemPrompt  String   @db.Text
  greetingText  String?  // spoken first, before the human says anything
  language      String   @default("en-US") // ← added: BCP-47 tag ("hi-IN", "en-IN", ...) passed to
                                            // the STT provider as its recognition language and used
                                            // to filter which TTS voices are even offered (§4.11) —
                                            // or "auto" where the chosen STT/TTS vendor supports
                                            // language auto-detection/code-switching (§1.6)
  interruptible Boolean  @default(true) // can the human barge in mid-response — default on, it's
                                          // what makes the agent feel like a conversation, not an IVR
  isActive      Boolean  @default(true)
  sessions      AiAgentSession[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// ← added: one row per agent's actual time in a room — the billing + audit unit for AI
// orchestration compute, playing the same role UsageLog plays for human participants (§2)
model AiAgentSession {
  id              String         @id @default(uuid())
  projectId       String
  project         Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  agentProfileId  String
  agentProfile    AiAgentProfile @relation(fields: [agentProfileId], references: [id])
  roomName        String
  startedAt       DateTime
  endedAt         DateTime?
  billableSeconds Int?
  ratePerMinute   Decimal?       @db.Decimal(8, 4) // snapshot at close — same historical-accuracy
                                                    // rule as UsageLog.ratePerMinute (§2)
  amountDeducted  Decimal?       @db.Decimal(12, 4)
  endReason       String?        // "room_ended" | "developer_stopped" | "provider_error" | "max_duration_hit"

  createdAt       DateTime       @default(now())

  @@index([projectId, startedAt])
  @@index([roomName])
}

// ---------- Live Broadcast (added — §1.7; RoomType.LIVE_BROADCAST already existed but was
// never actually specced beyond the enum value) ----------

enum BroadcastDeliveryMode {
  WEBRTC_SFU // native low-latency WebRTC subscribe straight from the media node — small/medium
             // audiences, sub-second latency, viewers can be promoted to co-host
  HLS_CDN    // Egress segments to HLS, served from the developer's own CDN — mass audiences,
             // 3-10s latency, viewers never touch our infrastructure at all (§1.7)
}

model BroadcastSession {
  id               String                @id @default(uuid())
  projectId        String
  project          Project               @relation(fields: [projectId], references: [id], onDelete: Cascade)
  roomName         String
  hostIdentity     String
  deliveryMode     BroadcastDeliveryMode @default(WEBRTC_SFU)
  ingressId        String?               // set if the host published via RTMP/OBS through LiveKit Ingress (§1.7)
  hlsEgressId      String?               // set once HLS_CDN mode's egress starts
  hlsPlaylistUrl   String?               // the developer's own CDN-fronted URL — never ours to serve
  peakViewerCount  Int?                  // ← only ever populated in WEBRTC_SFU mode, from
                                          // participant_joined/left webhooks (§3.5) — in HLS_CDN
                                          // mode this stays null: we have no visibility into who's
                                          // pulling segments from the developer's own CDN, by design
  startedAt        DateTime
  endedAt          DateTime?
  restreamTargets  RestreamDestination[]

  @@index([projectId, startedAt])
}

// ← added: optional simulcast targets — the developer's own YouTube/Facebook/Twitch (or any
// RTMP-accepting) ingest URL + stream key, BYO the same way a storage bucket is (§1.4) — we
// relay to it, we never manage or take a cut of the developer's account on that platform
model RestreamDestination {
  id                 String           @id @default(uuid())
  broadcastSessionId String
  broadcastSession   BroadcastSession @relation(fields: [broadcastSessionId], references: [id], onDelete: Cascade)
  label              String           // developer's own naming — "YouTube", "Facebook", etc.
  encryptedRtmpUrl   String           @db.Text // includes the stream key — treated as a secret,
                                               // same AES-256-GCM pattern as every other credential (§3.2)
  encryptionIv       String
  encryptionAuthTag  String
  keyVersion         Int              @default(1)
  status             RestreamStatus   @default(PENDING)

  @@index([broadcastSessionId])
}

enum RestreamStatus {
  PENDING
  LIVE
  FAILED
  ENDED
}

// ---------- Usage & Billing ----------

enum RoomType {
  AUDIO_CALL
  VIDEO_CALL
  LIVE_BROADCAST
  AI_AGENT_ORCHESTRATION // ← added — §1.6, §4.11: not a real "room" type, but reuses the exact
                          // same PlanRateCard/getRateFor machinery (§4.9) to price AiAgentSession
                          // compute-minutes rather than building a second pricing system
}

model UsageLog {
  id             String   @id @default(uuid())
  projectId      String
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  roomName       String
  roomType       RoomType
  participantIdentity String
  startedAt      DateTime
  endedAt        DateTime?
  billableSeconds Int?    // computed on room_finished, see §3 billing worker
  ratePerMinute  Decimal  @db.Decimal(8, 4) // snapshot of the rate AT THE TIME of the call —
                                             // added: plan prices change over time, don't recompute
                                             // historical usage against today's price
  amountDeducted Decimal? @db.Decimal(12, 4)
  livekitEgressId String? // set if this session was also recorded

  createdAt      DateTime @default(now())

  @@index([projectId, startedAt])
  @@index([roomName])
}

// ← updated for §4.7: real Razorpay order/payment tracking, not just a free-text ref
model Transaction {
  id               String            @id @default(uuid())
  organizationId   String
  organization     Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  type             TransactionType
  amount           Decimal           @db.Decimal(12, 4)

  gatewayOrderId   String?           // Razorpay order_id — created BEFORE checkout opens (§4.7)
  gatewayPaymentId String?           @unique // Razorpay payment_id — unique constraint is the DB-level
                                              // idempotency guard against double-processing a webhook (§4.7)
  gatewayRefundId  String?           @unique // ← added — §4.7: Razorpay refund_id, kept separate from
                                              // gatewayPaymentId (already claimed by the original
                                              // WALLET_TOPUP row) — same idempotency role, this time
                                              // for the refund.processed webhook
  originalTransactionId String?           // ← added — §4.7: on a REFUND row, points back at the
                                           // WALLET_TOPUP it refunds; null on every other type
  originalTransaction   Transaction?      @relation("RefundOf", fields: [originalTransactionId], references: [id])
  refunds               Transaction[]     @relation("RefundOf")
  webhookVerified  Boolean           @default(false) // ← must be true before walletBalance is ever
                                                        // incremented — never trust the client-side
                                                        // checkout callback alone (§4.7)
  status           TransactionStatus @default(PENDING)
  balanceAfter     Decimal?          @db.Decimal(12, 4) // set once webhookVerified
  createdAt        DateTime          @default(now())

  @@index([organizationId, status])
}

enum TransactionStatus {
  PENDING
  SUCCESS
  FAILED
}

enum TransactionType {
  WALLET_TOPUP
  AUTO_RECHARGE     // ← added — §4.7, distinct from a manual top-up for reporting
  USAGE_DEDUCTION
  REFUND
  MANUAL_ADJUSTMENT
  PROMOTIONAL_CREDIT // ← added — §4.10: bonus credit from a recharge offer, never real money —
                      // kept as its own type so it's never confused with an actual payment
}

// ---------- Recharge offers (added — admin-created, §4.10) ----------

enum BonusType {
  PERCENTAGE
  FIXED_AMOUNT
}

// ← added: "recharge ₹5000+, get 10% extra credit" — created and toggled by staff only
// (BILLING_OPS/SUPER_ADMIN, §4.8), never a self-serve developer-facing creation flow
model WalletOffer {
  id                 String    @id @default(uuid())
  title              String    // shown to developers on /billing, e.g. "Diwali Recharge Bonus"
  minRechargeAmount  Decimal   @db.Decimal(12, 4) // qualifying threshold, e.g. 5000.00
  bonusType          BonusType
  bonusValue         Decimal   @db.Decimal(8, 4)  // a percentage (e.g. 10) or a flat rupee amount
  maxBonusAmount     Decimal?  @db.Decimal(12, 4) // caps a PERCENTAGE bonus — without this, a
                                                   // ₹10,00,000 top-up at "10% extra" is an
                                                   // open-ended liability, not a marketing cost
  perOrgLimit        Int       @default(1)        // how many times ONE org can redeem this offer
  totalRedemptionCap Int?                          // optional platform-wide cap on total redemptions
  isActive           Boolean   @default(true)
  validFrom          DateTime
  validUntil         DateTime
  createdByStaffId   String    // which StaffUser created this — ties into AdminActionLog (§2, §4.8)
  redemptions        WalletOfferRedemption[]
  createdAt          DateTime  @default(now())

  @@index([isActive, validFrom, validUntil])
}

// ← added: one row per time an org actually receives the bonus — what perOrgLimit checks
// against, and the audit trail proving exactly how much promotional credit was ever handed out
model WalletOfferRedemption {
  id             String       @id @default(uuid())
  offerId        String
  offer          WalletOffer  @relation(fields: [offerId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  transactionId  String       @unique // the WALLET_TOPUP Transaction that triggered this bonus
  bonusAmount    Decimal      @db.Decimal(12, 4) // actual computed bonus for THIS redemption
  createdAt      DateTime     @default(now())

  @@index([offerId, organizationId])
}

// ---------- Recordings (metadata only — never the file) ----------

// ← added: original spec never modeled the recording itself, only the egress dispatch logic
model Recording {
  id            String   @id @default(uuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  roomName      String
  livekitEgressId String @unique
  storageProvider StorageProvider
  bucketName    String
  objectKey     String
  durationSeconds Int?
  fileSizeBytes BigInt?
  status        RecordingStatus @default(PROCESSING)
  failureReason String?  @db.Text
  startedAt     DateTime
  completedAt   DateTime?

  @@index([projectId, startedAt])
}

enum RecordingStatus {
  PROCESSING
  COMPLETED
  FAILED
}

// ---------- Outbound webhooks (added — to developers, not from LiveKit) ----------

model WebhookEndpoint {
  id          String   @id @default(uuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  url         String
  signingSecret String // HMAC-SHA256 secret shown once at creation, stored hashed
  events      Json     // ["recording.completed", "recording.failed", "wallet.low_balance"]
  isActive    Boolean  @default(true)
  deliveries  WebhookDelivery[]
  createdAt   DateTime @default(now())
}

model WebhookDelivery {
  id           String   @id @default(uuid())
  endpointId   String
  endpoint     WebhookEndpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)
  eventType    String
  payload      Json
  attempt      Int      @default(1)
  responseCode Int?
  succeeded    Boolean  @default(false)
  nextRetryAt  DateTime?
  createdAt    DateTime @default(now())

  @@index([endpointId, succeeded, nextRetryAt])
}

// ---------- Audit (added — required for SOC2, not optional) ----------

model CredentialAccessLog {
  id          String   @id @default(uuid())
  targetType  String   // "StorageConfig" | "FirebaseConfig" | "AiProviderConfig" (§1.6)
  targetId    String
  actor       String   // "system:egress-dispatcher" | "system:fcm-bridge" | a support-staff userId
  purpose     String   // "egress_upload" | "push_notification" | "credential_verify_test" | "support_debug"
  ipAddress   String?
  createdAt   DateTime @default(now())

  @@index([targetType, targetId, createdAt])
}

// ---------- Internal Admin / Staff (added — see §4.8) ----------

// ← added: staff are a separate identity domain from User/OrgMember — your own employees,
// not a customer's team, with a different threat model (password + mandatory MFA, no OTP path)
enum StaffRole {
  SUPER_ADMIN     // full access, manage other StaffUser accounts (§4.8's /admin/staff)
  SUPPORT         // read org/project data, time-boxed audited impersonation — no billing/credential access
  BILLING_OPS     // refunds, manual wallet adjustments, invoice reissue (§4.7)
  KYC_REVIEWER    // /admin/kyc-queue only (§4.5)
  SECURITY_ADMIN  // audit logs, key rotation, media-node ops (§6, §7.4)
}

model StaffUser {
  id           String     @id @default(uuid())
  email        String     @unique
  passwordHash String     // password + MFA, deliberately not the developer-facing OTP flow (§4.4) —
                           // staff access to customer data warrants a stronger, slower-to-phish factor
  mfaSecret    String     // NOT optional here, unlike User.mfaSecret (§2) which is opt-in for developers
  mfaEnabled   Boolean    @default(false)
  role         StaffRole
  isActive     Boolean    @default(true)
  lastLoginAt  DateTime?
  actions      AdminActionLog[]
  createdAt    DateTime   @default(now())
}

// ← added: distinct from CredentialAccessLog above — that ledger is scoped to credential
// decrypts specifically; this is the general "which staff member did what to which customer
// record" trail §6.5 calls out as required before a SOC2 review, not just for decrypts
model AdminActionLog {
  id          String    @id @default(uuid())
  staffUserId String
  staffUser   StaffUser @relation(fields: [staffUserId], references: [id])
  action      String    // "kyc.approve" | "kyc.reject" | "wallet.manual_adjust" | "project.suspend" |
                         // "org.impersonate_start" | "org.impersonate_end" | ...
  targetType  String    // "Organization" | "Project" | "KycVerification" | "Invoice" | ...
  targetId    String
  reason      String?   // required at the DTO level for any destructive or financial action
  ipAddress   String?
  createdAt   DateTime  @default(now())

  @@index([targetType, targetId, createdAt])
  @@index([staffUserId, createdAt])
}

enum PlanTier {
  STARTER
  GROWTH
  ENTERPRISE
}

// ---------- Plan rate cards (added — §4.9) ----------

// ← added: the published per-minute rate for each (plan, room type) pair — this is what makes
// upgrading a plan tier actually cheaper per-minute, not just a higher concurrency ceiling
model PlanRateCard {
  id            String   @id @default(uuid())
  planTier      PlanTier
  roomType      RoomType
  ratePerMinute Decimal  @db.Decimal(8, 4)
  effectiveFrom DateTime @default(now()) // ← added: rates change over time — never mutate a row
                                          // in place, insert a new one; getRateFor() (§4.9) picks
                                          // the latest row with effectiveFrom <= now
  createdAt     DateTime @default(now())

  @@unique([planTier, roomType, effectiveFrom])
  @@index([planTier, roomType])
}

// ← added: Enterprise deals are individually negotiated (§7.3) — this lets one org's rate
// diverge from the published PlanRateCard without forking the pricing model per customer
model OrganizationRateOverride {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  roomType       RoomType
  ratePerMinute  Decimal      @db.Decimal(8, 4)
  reason         String?      // e.g. "negotiated Enterprise contract, signed 2026-09-26"
  createdAt      DateTime     @default(now())

  @@unique([organizationId, roomType])
}
```

Note the deliberate choices that diverge from a naive read of the original spec: **`Decimal` everywhere money is involved, never `Float`** (floating-point rounding errors in a billing ledger are a support-ticket generator); **rate snapshotted per `UsageLog` row**, not looked up live from the current plan; and **`Environment` (sandbox/production) on `Project`** so a developer can integrate and test without a card on file or real billing accruing — every competitor in this space offers this and it's a top-5 conversion driver for self-serve signup.

## 3. NestJS Core Backend Modules

### 3.0 Module layout

```
src/
  auth/
    api-key.guard.ts          # validates x-api-key / x-api-secret
    api-key.strategy.ts
    ip-allowlist.guard.ts     # ← added
    staff-auth.guard.ts       # ← added: separate session/role check for the admin panel (§4.8) —
                               #   never the same guard/session cookie as developer-portal auth
  crypto/
    encryption.service.ts     # AES-256-GCM helpers
    kms.service.ts            # ← added: master-key provider abstraction (env var today, Vault/KMS later)
  livekit/
    token.service.ts
    egress-dispatcher.service.ts
    livekit-webhook.controller.ts   # receives LiveKit's inbound webhooks
  broadcast/                    # ← added — §1.7, §3.10: live 1-to-many streaming
    broadcast-dispatcher.service.ts  # HLS egress, RTMP ingest, restream targets
    broadcast.controller.ts
  billing/
    usage.processor.ts        # BullMQ worker consuming room/participant events
    wallet.service.ts
    pricing.service.ts        # ← added — §4.9: PlanRateCard/OrganizationRateOverride resolution
  ai-agent/                    # ← added — §1.6, §3.9: BYOK real-time voice agent
    ai-provider-config.service.ts   # BYOK CRUD + per-vendor verify (§4.11)
    ai-agent-dispatcher.service.ts  # decrypts BYOK keys, mints the agent's LiveKit token, spawns a worker
    agent-worker-pool.service.ts    # manages our own STT→LLM→TTS worker fleet, separate from LiveKit media nodes
  webhooks/                    # ← added: OUR outbound webhooks to developers
    webhook-dispatch.processor.ts
    webhook-signing.service.ts
  rate-limit/                  # ← added
    room-quota.guard.ts
  audit/                       # ← added
    credential-access.interceptor.ts
  common/
    filters/, interceptors/, decorators/
```

### 3.1 API Key Guard

```typescript
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService, // hot cache to avoid a DB hit on every request
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const apiKey = req.headers['x-api-key'] as string;
    const apiSecret = req.headers['x-api-secret'] as string;
    if (!apiKey || !apiSecret) throw new UnauthorizedException('missing_credentials');

    const cacheKey = `project:${apiKey}`;
    let project = await this.redis.getJson<ProjectCache>(cacheKey);
    if (!project) {
      project = await this.prisma.project.findUnique({ where: { apiKeyPrefix: apiKey } });
      if (!project) throw new UnauthorizedException('invalid_key');
      await this.redis.setJson(cacheKey, project, 30); // 30s TTL — bounds staleness of suspend/rotate
    }

    // Verify against current secret, falling back to the previous one during a rotation grace window
    const currentOk = await argon2.verify(project.apiSecretHash, apiSecret);
    const graceOk = !currentOk && project.previousSecretHash
      && project.previousSecretExpiresAt > new Date()
      && await argon2.verify(project.previousSecretHash, apiSecret);
    if (!currentOk && !graceOk) throw new UnauthorizedException('invalid_secret');

    if (project.isSuspended) throw new ForbiddenException('project_suspended');

    const org = await this.walletService.getBalance(project.organizationId);
    if (org.balance <= 0 && !org.overageAllowed) throw new ForbiddenException('insufficient_balance');

    req['project'] = project; // downstream guards/handlers read this
    return true;
  }
}
```

**Why the Redis cache with a short TTL, not a long one:** a suspended project must stop working within seconds, not minutes — this is the classic "cache invalidation vs staleness" trade-off, and 30s is a deliberate compromise, not an arbitrary number. Invalidate the cache key explicitly on suspend/rotate rather than relying on TTL alone.

### 3.2 AES-256-GCM Encryption Service

```typescript
@Injectable()
export class EncryptionService {
  constructor(private kms: KmsService) {}

  async encrypt(plaintext: string): Promise<EncryptedPayload> {
    const { key, version } = await this.kms.getActiveMasterKey(); // ← added: versioned keys
    const iv = randomBytes(12); // 96-bit IV is the GCM standard, never reuse per key
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyVersion: version,
    };
  }

  async decrypt(payload: EncryptedPayload): Promise<string> {
    const key = await this.kms.getMasterKeyByVersion(payload.keyVersion); // supports old + new key during rotation
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(), // throws if the auth tag doesn't match — tamper detection is automatic with GCM
    ]);
    return plaintext.toString('utf8');
  }
}
```

**Added: `KmsService` as an abstraction from day one**, even if it's backed by a single env-var master key initially — swapping to AWS KMS / GCP KMS / HashiCorp Vault later is then a one-file change instead of a schema migration, because `keyVersion` is already a column on every encrypted row.

### 3.3 LiveKit Token Service

```typescript
@Injectable()
export class LiveKitTokenService {
  private readonly internalApiKey = this.config.get('LIVEKIT_INTERNAL_API_KEY');
  private readonly internalApiSecret = this.config.get('LIVEKIT_INTERNAL_API_SECRET');

  async generateJoinToken(project: Project, dto: CreateTokenDto): Promise<string> {
    const ttl = Math.min(dto.ttlSeconds ?? 600, project.maxTokenTtlSeconds); // hard cap, see §7
    const at = new AccessToken(this.internalApiKey, this.internalApiSecret, {
      identity: dto.participantIdentity,
      ttl,
      metadata: JSON.stringify({ projectId: project.id }), // round-trips through every webhook
    });
    at.addGrant({
      roomJoin: true,
      room: dto.roomName,
      canPublish: dto.grants.canPublish ?? true,
      canSubscribe: dto.grants.canSubscribe ?? true,
      canPublishData: dto.grants.canPublishData ?? true,
      roomAdmin: dto.grants.roomAdmin ?? false,
      recorder: dto.grants.recorder ?? false,
    });
    return at.toJwt();
  }
}
```

### 3.4 Dynamic Egress Dispatcher

```typescript
@Injectable()
export class EgressDispatcherService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private livekitEgress: EgressClient,
    private auditLog: CredentialAccessAuditService, // ← added
  ) {}

  async startRoomComposite(project: Project, roomName: string, storageLabel?: string) {
    const storage = await this.prisma.storageConfig.findFirstOrThrow({
      where: { projectId: project.id, ...(storageLabel ? { label: storageLabel } : { isDefault: true }) },
    });

    const accessKey = await this.encryption.decrypt(storage.encryptedAccessKey);
    const secretKey = await this.encryption.decrypt(storage.encryptedSecretKey);
    await this.auditLog.record({
      targetType: 'StorageConfig', targetId: storage.id,
      actor: 'system:egress-dispatcher', purpose: 'egress_upload',
    }); // ← added: every decrypt is logged, no exceptions

    const output = this.buildUploadTarget(storage.provider, storage, accessKey, secretKey);

    const info = await this.livekitEgress.startRoomCompositeEgress(roomName, output, {
      layout: 'grid',
      audioOnly: false,
    });

    // Credentials go out of scope here — never persisted, never logged, never cached beyond this call.
    return info.egressId;
  }

  private buildUploadTarget(provider: StorageProvider, cfg: StorageConfig, accessKey: string, secretKey: string) {
    switch (provider) {
      case 'AWS_S3':
        return { s3: { accessKey, secret: secretKey, region: cfg.region, bucket: cfg.bucketName } };
      case 'CLOUDFLARE_R2':
        // R2 is S3-compatible — same shape, custom endpoint, region is a fixed placeholder R2 expects
        return { s3: { accessKey, secret: secretKey, region: 'auto', endpoint: cfg.endpoint, bucket: cfg.bucketName, forcePathStyle: true } };
      case 'GOOGLE_CLOUD':
        return { gcp: { credentials: accessKey /* full JSON key */, bucket: cfg.bucketName } };
    }
  }
}
```

### 3.5 Webhook & Billing Worker (BullMQ)

```typescript
@Processor('livekit-events')
export class UsageProcessor extends WorkerHost {
  async process(job: Job<LiveKitWebhookEvent>) {
    const { event, room, participant, egressInfo } = job.data;
    const projectId = this.extractProjectId(participant?.metadata ?? room?.metadata);

    switch (event) {
      case 'participant_joined':
        await this.prisma.usageLog.create({
          data: { projectId, roomName: room.name, roomType: this.inferRoomType(room),
                   participantIdentity: participant.identity, startedAt: new Date() },
        });
        break;

      case 'participant_left':
      case 'room_finished': {
        // Idempotency matters: LiveKit can redeliver webhooks. Use (roomName, participantIdentity)
        // + a null endedAt as the "open session" marker so a duplicate delivery is a no-op.
        const open = await this.prisma.usageLog.findFirst({
          where: { roomName: room.name, participantIdentity: participant?.identity, endedAt: null },
        });
        if (!open) return; // already closed by an earlier delivery of the same event

        const endedAt = new Date();
        const billableSeconds = Math.ceil((endedAt.getTime() - open.startedAt.getTime()) / 1000);
        const rate = await this.pricing.getRateFor(projectId, open.roomType); // snapshot at close time
        const amount = new Decimal(billableSeconds).div(60).mul(rate);

        await this.prisma.$transaction([
          this.prisma.usageLog.update({
            where: { id: open.id },
            data: { endedAt, billableSeconds, ratePerMinute: rate, amountDeducted: amount },
          }),
          this.prisma.organization.update({
            where: { id: open.projectId }, // via project→org lookup in real code
            data: { walletBalance: { decrement: amount } },
          }),
        ]); // atomic — a crash between these two writes must not happen (see added note below)

        await this.walletService.checkLowBalanceThreshold(open.projectId); // may enqueue an outbound webhook
        break;
      }

      case 'egress_ended':
        await this.recordingsService.finalize(egressInfo); // §1.4
        break;
    }
  }
}
```

**Added: this MUST be a `$transaction`**, not two sequential writes — the original spec describes "consuming events and deducting from wallet" as if it's one step, but a crash between updating `UsageLog` and decrementing the wallet either double-bills or under-bills a customer, and both failure modes generate support tickets and, eventually, chargebacks.

### 3.6 Outbound Webhook Dispatcher (added — to developers, not from LiveKit)

```typescript
@Injectable()
export class WebhookDispatchService {
  async enqueue(projectId: string, eventType: string, payload: object) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { projectId, isActive: true, events: { array_contains: eventType } },
    });
    for (const endpoint of endpoints) {
      await this.queue.add('deliver', { endpointId: endpoint.id, eventType, payload }, {
        attempts: 6,
        backoff: { type: 'exponential', delay: 5_000 }, // 5s, 10s, 20s… capped
      });
    }
  }
}

@Processor('webhook-delivery')
export class WebhookDeliveryProcessor extends WorkerHost {
  async process(job: Job) {
    const { endpointId, eventType, payload } = job.data;
    const endpoint = await this.prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpointId } });

    const body = JSON.stringify({ event: eventType, data: payload, timestamp: Date.now() });
    const signature = createHmac('sha256', endpoint.signingSecret).update(body).digest('hex');

    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': `sha256=${signature}` },
        body,
        signal: AbortSignal.timeout(8_000),
      });
      await this.logDelivery(endpointId, eventType, payload, res.status, res.ok);
      if (!res.ok) throw new Error(`developer_endpoint_${res.status}`); // triggers BullMQ retry
    } catch (err) {
      await this.logDelivery(endpointId, eventType, payload, null, false);
      throw err; // after `attempts` exhausted, BullMQ moves it to the failed set — surface in the portal
    }
  }
}
```

This mirrors exactly what Stripe/GitHub do for their own outbound webhooks (HMAC signature header, exponential backoff, a visible delivery log) — developers integrating your platform will expect this contract because it's now an industry default, not a nice-to-have.

### 3.7 Room-creation rate limiter (added)

`@nestjs/throttler` covers HTTP-request-rate limiting, but it does **not** cap how many *concurrent LiveKit rooms* a project has open — a leaked API key can otherwise be replayed to spin up rooms far faster than any reasonable HTTP rate limit would catch, each one consuming real SFU CPU/bandwidth on your media nodes.

```typescript
@Injectable()
export class RoomQuotaGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const project: Project = req.project;
    const activeCount = await this.redis.scard(`active-rooms:${project.id}`); // Redis set, TTL'd members
    if (activeCount >= project.maxConcurrentRooms) {
      throw new HttpException('concurrent_room_limit_exceeded', 429);
    }
    return true;
  }
}
```

The SET is populated on `room_started` and pruned on `room_finished` in the same billing worker (§3.5) — one more reason those webhooks need to be reliably consumed, not just for billing.

### 3.8 Notification Service — email/SMS (added)

Distinct from §3.6's outbound webhooks: webhooks are *programmatic* events for the developer's own backend to consume; this is *human-readable* mail/SMS to the people running that account. A developer needs both — their server needs the webhook to react automatically, and a person on their team needs an email when their KYC gets rejected or their card fails to auto-recharge.

**One entrypoint, not a dozen ad-hoc `sendEmail()` calls scattered through the codebase:**

```typescript
@Injectable()
export class NotificationService {
  async send(organizationId: string, type: NotificationType, data: Record<string, unknown>) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { notificationPreference: true, members: { include: { user: true } } },
    });
    const prefs = org.notificationPreference ?? DEFAULT_NOTIFICATION_PREFS;

    const recipients = this.resolveRecipients(org, type); // e.g. BILLING-role members for
                                                             // INVOICE_GENERATED, ADMIN-role for
                                                             // SECURITY_ALERT, everyone for WELCOME

    for (const recipient of recipients) {
      if (prefs.emailEnabled) {
        await this.queue.add('dispatch', {
          channel: 'EMAIL', type, destination: recipient.email, data, organizationId,
        }, { attempts: 4, backoff: { type: 'exponential', delay: 3_000 } });
      }
      // SMS only for the narrow critical set, and only once phone/MSG91 (§4.4) is actually live
      const isCriticalType = ['LOW_BALANCE', 'SECURITY_ALERT'].includes(type);
      if (prefs.smsEnabled && (isCriticalType || !prefs.criticalOnlyViaSms) && recipient.phone) {
        await this.queue.add('dispatch', {
          channel: 'SMS', type, destination: recipient.phone, data, organizationId,
        }, { attempts: 4, backoff: { type: 'exponential', delay: 3_000 } });
      }
    }
  }
}

@Processor('notification-dispatch')
export class NotificationDispatchProcessor extends WorkerHost {
  async process(job: Job) {
    const { channel, type, destination, data, organizationId } = job.data;
    const rendered = this.templates.render(type, channel, data); // Handlebars/React Email for EMAIL,
                                                                    // a short plain string for SMS
    try {
      const providerRef = channel === 'EMAIL'
        ? await this.smtp.send(destination, rendered)          // same self-hosted SMTP relay as §4.4
        : await this.msg91.sendSms(destination, rendered);      // same MSG91 integration as §4.4 —
                                                                  // one provider relationship, two use cases
      await this.prisma.notificationLog.create({
        data: { organizationId, type, channel, destination, status: 'SENT', providerRef },
      });
    } catch (err) {
      await this.prisma.notificationLog.create({
        data: { organizationId, type, channel, destination, status: 'FAILED', errorReason: err.message },
      });
      throw err; // triggers BullMQ retry, same pattern as §3.6's webhook delivery
    }
  }
}
```

**Why this always goes through a queue, never a synchronous call inline in a request handler:** an SMTP round-trip or an MSG91 API call can take a second or more and occasionally times out — the KYC-approval admin action, the webhook-failure detector, and the low-balance check in §3.5 should never block on "did the email actually send," and a transient provider outage should retry on its own rather than silently dropping the notification.

**Events this covers** (each maps to a `NotificationType`, §2): welcome on signup, KYC approved/rejected (§4.5), low wallet balance, invoice generated (§4.6), payment received / auto-recharge failed (§4.7), a developer's outbound webhook endpoint degrading (§3.6 — tell them their own integration looks broken before they notice from a support ticket), API key rotated, and generic security alerts (new login location, IP allowlist changed).

**Preferences** live in `/settings/notifications` in the portal (§4.1) — email defaults on, SMS defaults off and stays gated behind the same "phone channel isn't live yet" flag as OTP (§4.4) until MSG91 is actually wired in. Don't let an org fully disable `SECURITY_ALERT` or `AUTO_RECHARGE_FAILED` emails — those two categories protect the account and the money, respectively, and a support conversation that starts with "nobody told me my card failed" is avoidable by simply not offering that toggle.

### 3.9 AI Agent Dispatcher — BYOK voice agent (added — §1.6)

```typescript
@Injectable()
export class AiAgentDispatcherService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private livekitToken: LiveKitTokenService,
    private auditLog: CredentialAccessAuditService, // same service §3.4's egress dispatcher uses
    private workerPool: AgentWorkerPoolService,
  ) {}

  async dispatch(project: Project, roomName: string, agentProfileId: string): Promise<string> {
    const profile = await this.prisma.aiAgentProfile.findUniqueOrThrow({ where: { id: agentProfileId } });

    const configs = await this.prisma.aiProviderConfig.findMany({ where: { projectId: project.id } });
    for (const type of ['LLM', 'STT', 'TTS'] as const) {
      if (!configs.some(c => c.providerType === type)) {
        throw new BadRequestException(`missing_ai_provider_config_${type}`); // fail before touching LiveKit at all
      }
    }

    const decryptedProviders = await Promise.all(configs.map(async (cfg) => {
      const apiKey = await this.encryption.decrypt(cfg);
      await this.auditLog.record({
        targetType: 'AiProviderConfig', targetId: cfg.id,
        actor: 'system:ai-agent-dispatcher', purpose: 'agent_session_start',
      }); // ← added: every BYOK decrypt logged, no exceptions — same rule as §3.4, §1.5
      return { providerType: cfg.providerType, vendor: cfg.vendor, modelName: cfg.modelName, apiKey };
    }));

    // Internal LiveKit token (§1.2) with a dedicated `agent` grant — distinguishes the bot
    // from a human participant and from the recorder bot's `recorder` grant (§3.3)
    const agentToken = await this.livekitToken.generateJoinToken(project, {
      participantIdentity: `agent-${agentProfileId}-${Date.now()}`,
      roomName,
      grants: { canPublish: true, canSubscribe: true, canPublishData: true, agent: true },
    });

    const session = await this.prisma.aiAgentSession.create({
      data: { projectId: project.id, agentProfileId, roomName, startedAt: new Date() },
    });

    await this.workerPool.spawn({ roomName, agentToken, profile, providers: decryptedProviders, sessionId: session.id });
    // Decrypted keys live only inside that worker process's memory for the session's lifetime —
    // never written to disk, never logged, discarded the moment the worker disconnects (§1.6)

    return session.id;
  }
}
```

Billing close-out mirrors §3.5's usage processor exactly, just against `AiAgentSession` instead of `UsageLog`: on the worker's `session_ended` event, compute `billableSeconds`, resolve `ratePerMinute` via `PricingService.getRateFor(projectId, 'AI_AGENT_ORCHESTRATION')` (§2, §4.9), and decrement `walletBalance` inside the same kind of atomic `$transaction` — this is a second, independent debit from the same wallet the human-participant `UsageLog` billing already draws from, not a replacement for it (§1.6).

### 3.10 Broadcast Dispatcher — Ingress/Egress for `HLS_CDN` mode and restreaming (added — §1.7)

Extends `EgressDispatcherService` (§3.4) rather than duplicating it — an HLS output and a restream output are both just different `output` shapes on the same underlying Egress call the recording flow already uses, decrypting the same kind of BYOS credentials.

```typescript
@Injectable()
export class BroadcastDispatcherService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private livekitEgress: EgressClient,
    private livekitIngress: IngressClient,
    private auditLog: CredentialAccessAuditService,
  ) {}

  async startHlsEgress(project: Project, session: BroadcastSession) {
    const storage = await this.prisma.storageConfig.findFirstOrThrow({
      where: { projectId: project.id, isDefault: true }, // same BYOS bucket as recording (§1.4)
    });
    const accessKey = await this.encryption.decrypt(storage.encryptedAccessKey);
    const secretKey = await this.encryption.decrypt(storage.encryptedSecretKey);
    await this.auditLog.record({
      targetType: 'StorageConfig', targetId: storage.id,
      actor: 'system:broadcast-dispatcher', purpose: 'hls_egress',
    });

    const info = await this.livekitEgress.startRoomCompositeEgress(session.roomName, {
      segments: { filenamePrefix: `broadcasts/${session.id}/`, playlistName: 'index.m3u8', segmentDuration: 4 },
      // same S3/R2/GCS shape as §3.4's buildUploadTarget — one method, reused, not reinvented
      ...this.buildStorageOutput(storage, accessKey, secretKey),
    });

    await this.prisma.broadcastSession.update({
      where: { id: session.id },
      data: { hlsEgressId: info.egressId, hlsPlaylistUrl: this.buildPlaylistUrl(storage, session.id) },
    });
  }

  async createIngest(roomName: string, hostIdentity: string) {
    // Returns a one-time RTMP URL + stream key for OBS-style publishing (§1.7) — LiveKit
    // converts the incoming stream into a normal published track, no different downstream
    // from an SDK publisher once it lands in the room
    return this.livekitIngress.createIngress({
      inputType: 'RTMP_INPUT',
      roomName,
      participantIdentity: hostIdentity,
    });
  }

  async startRestream(session: BroadcastSession, destination: RestreamDestination) {
    const rtmpUrl = await this.encryption.decrypt(destination); // includes the stream key
    await this.auditLog.record({
      targetType: 'RestreamDestination', targetId: destination.id,
      actor: 'system:broadcast-dispatcher', purpose: 'restream_start',
    });
    const info = await this.livekitEgress.startRoomCompositeEgress(session.roomName, {
      stream: { protocol: 'rtmp', urls: [rtmpUrl] },
    });
    await this.prisma.restreamDestination.update({ where: { id: destination.id }, data: { status: 'LIVE' } });
    return info.egressId;
    // Decrypted RTMP URL (with embedded stream key) lives only for this call — never logged,
    // never persisted in plaintext, same discipline as every other BYO credential in this doc
  }
}
```

**Why viewer count in `HLS_CDN` mode can't be tracked here, even if you wanted to:** once segments are uploaded to the developer's own CDN-fronted bucket, requests for those segments go straight from viewer to CDN — our backend is never in that request path, so there is no event to hook into. If a developer wants viewer analytics for an `HLS_CDN` broadcast, that has to come from their own CDN's access logs, not from us; don't build a fake "estimated viewers" number that implies visibility we don't actually have.

## 4. Developer Portal (Next.js) Specification

### 4.1 Page map

| Route | Purpose |
| --- | --- |
| `/signup`, `/login` | ← updated: passwordless OTP via email **or** phone (§4.4) + OAuth; org auto-created on first successful verify |
| `/onboarding` | ← added: pick sandbox vs production intent, framework quickstart selector |
| `/dashboard` | Usage snapshot, wallet balance, active rooms right now, recent webhook deliveries |
| `/projects` | List + create `Project` (environment: sandbox/production) |
| `/projects/[id]/keys` | View key prefix, **regenerate secret** (with the rotation grace-window UX, §6), IP allowlist editor |
| `/projects/[id]/storage` | Multi-cloud `StorageConfig` form (§4.2) |
| `/projects/[id]/firebase` | Upload `serviceAccountKey.json`, verify button |
| `/projects/[id]/ai-agent` | ← added — §1.6, §4.11: BYOK LLM/STT/TTS provider keys, agent persona/prompt editor, verify buttons |
| `/projects/[id]/broadcasts` | ← added — §1.7, §4.12: restream destinations (BYO RTMP URLs), broadcast history, delivery-mode guidance |
| `/projects/[id]/webhooks` | ← added: register endpoint URL, pick events, view signing secret once, delivery log with retry/replay button |
| `/projects/[id]/usage` | Charts: minutes by room type, cost trend, concurrent-room high-water mark |
| `/billing` | Wallet top-up, transaction history, invoices, auto-recharge threshold |
| `/billing/plan` | ← added — §4.9: current `PlanTier`, its rate card + limits, self-serve Starter↔Growth switch, "Contact sales" CTA for Enterprise |
| `/team` | ← added: `OrgMember` invite/role management |
| `/docs` | Embedded quickstart tabs (Web/iOS/Android/Flutter/React Native) + live API explorer |
| `/audit-log` | ← added: org-level view of `CredentialAccessLog` — lets a security-conscious customer see every time *your* systems touched *their* credentials, which is the single best trust-building UI feature you can ship for this product category |

Internal staff pages (`/admin/*` — KYC review, billing ops, org/project management, platform-wide audit log, media-node health) are **not** part of this app or this route table — they're a separate, staff-only admin panel with its own auth and deploy pipeline; see §4.8.

### 4.2 Multi-cloud storage configuration form

One form, provider selector at the top switching the field set (do not build three separate forms — one Zod discriminated union keyed on `provider`, one React component tree):

```typescript
const storageConfigSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('AWS_S3'), bucketName: z.string(), region: z.string(),
             accessKey: z.string(), secretKey: z.string() }),
  z.object({ provider: z.literal('CLOUDFLARE_R2'), bucketName: z.string(), endpoint: z.string().url(),
             accessKey: z.string(), secretKey: z.string() }),
  z.object({ provider: z.literal('GOOGLE_CLOUD'), bucketName: z.string(),
             serviceAccountJson: z.string() }), // pasted or file-uploaded
]);
```

**Non-negotiable UX detail (added):** on submit, the backend must attempt a real **canary write + delete** to the bucket before saving — write a 1-byte object at `__astrortc_verify__/<timestamp>`, confirm success, delete it, *then* persist the encrypted config with `lastVerifiedAt` set. Saving unverified credentials is how a customer discovers their recordings have been silently failing for three weeks. Surface the verification result inline, not just a generic "saved."

### 4.3 Key components beyond forms

- **Secret reveal-once modal** — API secrets and webhook signing secrets are shown exactly once on generation, never retrievable again (only re-rollable), with a copy-to-clipboard + "I've saved this" confirmation gate before the modal can be dismissed.
- **Usage charts** — stacked area by `roomType` over time (from `UsageLog`, pre-aggregated hourly by a scheduled job rather than querying raw rows live — raw aggregation at portal-load time doesn't scale past a few million usage rows).
- **Webhook delivery log** — table of `WebhookDelivery` with status, response code, and a manual "Replay" action that re-enqueues the same payload (essential for developer trust: they need to recover from *their own* endpoint's downtime without contacting your support).
- **Sandbox banner** — a persistent, impossible-to-miss banner on every page when viewing a `SANDBOX` project, because "I accidentally billed my production wallet during testing" is a guaranteed support ticket otherwise.
- **Quickstart tabs** — generate the code sample server-side from the org's *actual* project ID and a freshly-scoped sandbox key, not a placeholder `YOUR_API_KEY` — copy-paste-runnable quickstarts measurably cut time-to-first-successful-call, which is the metric that predicts self-serve conversion in this product category.

### 4.4 Developer login: OTP via email or phone (added)

Passwordless login — the developer enters either their email address or phone number on `/login`, picks the channel implicitly by what they typed, and gets a 6-digit code. **Ship email-only first**; the schema's `OtpChannel` enum already has `PHONE` ready, so turning phone on later is a feature flag, not a migration.

**Request flow:**

1. `POST /auth/otp/request { destination: "dev@company.com" | "+919812345678" }` — backend detects channel by format (contains `@` → `EMAIL`, else validate as E.164 → `PHONE`).
2. Generate a random 6-digit code, hash it (`argon2` or even a simple `sha256` is acceptable here since it's short-lived and rate-limited — unlike a password, an OTP's security comes from TTL + attempt limits, not hash strength alone), store an `OtpVerification` row with `expiresAt = now + 5min`.
3. Dispatch the code over the matching channel:
   - **Email (build this now)**: self-hosted SMTP (Postfix relay, or your cloud's transactional email service) — stays consistent with the platform's zero-paid-third-party-API philosophy, since you can run your own mail relay. This is the only channel live at launch.
   - **Phone/SMS (wire in later, via MSG91)**: when you turn this on, use **MSG91** — it has a purpose-built OTP API (`/otp/send`, `/otp/verify`) rather than raw SMS, which means MSG91 can own the code-generation and expiry itself if you want (simpler), or you keep that logic in your own `OtpVerification` table as above and just use MSG91 as a plain SMS transport (more consistent with how the email path works, and keeps one code path for both channels) — the second option is the better fit here since it reuses the same `OtpVerification` model and rate-limiting logic for both channels rather than forking the flow per-provider. Either way, this is a paid gateway (per-SMS pricing, budget roughly ₹0.10–₹0.20/SMS on MSG91's OTP plans) — the same explicit exception to "no paid third-party APIs" as the payment gateway in §2's `Transaction.gatewayRef` note: that principle is scoped to RTC media infrastructure, not incidental services.
4. **Rate limit OTP requests** by both `destination` and requesting IP (e.g. max 3 requests per destination per 10 minutes, max 10 per IP per hour) — low-stakes for email, but do not skip this before turning phone on: SMS-bombing (triggering thousands of paid sends to a number you don't own) is a direct hit to your MSG91 bill the moment phone is live, not just a nuisance.

**Verify flow:**

5. `POST /auth/otp/verify { destination, code }` — look up the latest non-consumed, non-expired `OtpVerification` for that destination, compare the hash, increment `attempts` on mismatch (lock out after `maxAttempts`, currently 5), mark `consumedAt` on success.
6. On success: find a `User` by `email` or `phone` matching the destination; if none exists, create one (first-time OTP verify *is* signup — no separate signup form needed, which is a meaningfully better first-run experience than a traditional email/password signup form).
7. Issue a session (JWT or opaque session token, httpOnly cookie) the same way password login would have — everything downstream of this point (org creation on first login, `/onboarding`, §4.1) is unchanged, and identical for both channels once a code is verified.

**Why keep `phone` optional and unique rather than required:** a developer who only ever provides an email should not be forced to add a phone number just to satisfy a `NOT NULL` constraint — doubly true right now since phone login isn't even live yet. Let either field alone be sufficient for login, and treat "user provided both" as an account-security upgrade (recovery via the other channel) rather than a requirement.

### 4.5 KYC / business verification at signup (added)

**Why this doesn't contradict the zero-storage pitch:** §1's zero-storage promise is about *your customers' end users* — the recordings and chat messages flowing through rooms your developers build. KYC is the opposite direction: it's you verifying **who your own paying B2B customers are**, the same way any platform handling money and communications infrastructure does. Every serious competitor in this space (and every Indian fintech/payment aggregator) does this; it's expected due diligence, not a policy inconsistency. Store this data on your own infrastructure — it was never in scope for "we don't store data," and pretending otherwise would be worse than just being upfront about the distinction.

**What to collect, and why each one:**

| Document | Who needs it | Why |
| --- | --- | --- |
| **PAN** | Every organization, no exception | Mandatory for any Indian entity issuing/receiving invoices above nominal amounts |
| **Aadhaar** | Individual developers / sole proprietors | Identity proof where there's no separate registered business entity |
| **GSTIN** | Registered businesses | Required for GST-compliant invoicing anyway (§2's `Transaction`/tax handling) — you need this regardless of KYC |
| **Company CIN** | Pvt Ltd / LLP accounts | MCA Certificate of Incorporation, confirms the entity legally exists |
| **Udyam registration** | Indian startups/MSMEs | Common alternative proof for smaller registered businesses |

**Two verification paths — prefer the government one:**

1. **DigiLocker (preferred)** — the Government of India's own document-sharing API. With the developer's consent (an OAuth-style flow), you pull their Aadhaar/PAN directly from the issuing government database, already verified, with no manual review needed and no document image for you to store at all (`verifiedViaDigiLocker = true`, no `documentFileKey`). This is the one KYC path that's genuinely free and government-run — it fits your "no paid third-party APIs" principle better than any private KYC vendor would, and it's the most literal reading of "Indian govt ke hisab se" verification.
2. **Manual upload + human review (fallback)** — for organizations that don't use DigiLocker (e.g. GSTIN/CIN, which DigiLocker doesn't cover as directly as Aadhaar/PAN): developer uploads a scan/photo to `/kyc` in the portal, it lands in **your own private, non-public storage bucket** (explicitly *not* the developer's BYOS bucket from §2 — that bucket holds *their customers'* recordings; this holds *your* compliance record on *them*, a different trust boundary entirely), encrypted the same way as other sensitive documents (§3.2), and queues into an admin review screen (`/admin/kyc-queue`, alongside the other `(admin)`-style pages) where staff approve or reject with a reason.

**What's gated behind `KycStatus = VERIFIED`:**

- Switching any `Project` from `SANDBOX` to `PRODUCTION` environment (§2) — sandbox stays open pre-KYC so a developer can evaluate the product before you've verified anything, which keeps your self-serve funnel intact.
- Wallet top-ups above a small threshold (e.g. ₹1,000) — let a tiny amount through pre-KYC for testing the billing flow itself, block anything that looks like real commercial usage.
- Generating GST invoices — you need the GSTIN on file anyway to invoice correctly, so this gate falls out naturally rather than needing separate enforcement logic.

**Rejection handling:** a rejected KYC submission should tell the developer *why* (`rejectionReason`) and let them resubmit — don't silently fail or require a support ticket to find out what was wrong with a document, which is a common and avoidable source of churn during onboarding.

### 4.6 Billing / tax profile for GST invoicing (added)

Separate from KYC (§4.5 verifies *who the customer is*; this captures *what goes on their invoice*), but the two are linked so a customer never has to type their GSTIN twice and risk it drifting out of sync with what you've actually verified.

**Portal flow (`/billing/tax-profile`):** a form the client fills in before their first real invoice — legal business name, GSTIN (optional, see below), PAN, billing address, and state (which determines the tax split, not just decoration). If a `KycVerification` of type `GSTIN` already exists and is `VERIFIED`, pre-fill and lock the GSTIN field from that record (`gstinSourcedFromKyc = true`) rather than letting them hand-type a second, possibly different, unverified number — letting these two copies diverge is exactly the kind of small inconsistency a GST audit flags.

**Unregistered customers:** not every developer has a GSTIN (individuals, small proprietors below the registration threshold) — `BillingProfile.gstin` is nullable specifically for this; the invoice generator (below) omits the GST breakdown line entirely for these and still needs the PAN for a valid bill of supply.

**Tax computation logic (NestJS, at invoice-generation time):**

```typescript
function computeGst(subtotal: Decimal, customerStateCode: string, ourRegisteredStateCode: string) {
  const gstRate = new Decimal('0.18'); // confirm your actual applicable rate with a CA before launch
  const totalTax = subtotal.mul(gstRate);

  if (customerStateCode === ourRegisteredStateCode) {
    // Intra-state: split evenly between Central and State GST
    const half = totalTax.div(2);
    return { cgst: half, sgst: half, igst: new Decimal(0) };
  }
  // Inter-state: Integrated GST, no CGST/SGST split
  return { cgst: new Decimal(0), sgst: new Decimal(0), igst: totalTax };
}
```

This is *the* reason `placeOfSupplyStateCode` exists as its own field rather than being inferred from a free-text address — the CGST+SGST vs IGST decision is purely a state-code comparison against wherever your own company is GST-registered, and getting it wrong is a compliance defect, not a cosmetic one.

**Invoice numbering & generation:**

- Sequential per financial year (GST rules require invoices to be numbered consecutively without gaps) — e.g. `INV-2026-000123`, reset the counter at the start of each financial year (April 1 in India), never reuse or skip a number even for a voided invoice (issue a credit note instead).
- `Invoice.billingSnapshot` stores a **copy** of the `BillingProfile` fields at the moment of generation — if the customer updates their address next month, last month's already-issued invoice must still show the address that was correct when it was issued. Never join live to `BillingProfile` when rendering a historical invoice PDF.
- `sacCode` defaults to a placeholder (`998314`) in the schema — **confirm the exact applicable SAC (Services Accounting Code) for API/PaaS/cloud-communications services with a CA before your first real invoice goes out**; this blueprint can tell you the field needs to exist and be correct, not substitute for that specific classification advice.
- Generated PDF goes to your own private bucket (`Invoice.pdfObjectKey`), same trust boundary as KYC documents (§4.5) — emailed to `BillingProfile.invoiceEmail` and listed on the `/billing` page (§4.1) alongside the wallet transaction history.

### 4.7 Payment gateway integration — Razorpay (added)

The "no paid third-party APIs" principle (§0) is scoped to *RTC media infrastructure* — a payment gateway is an incidental service every SaaS platform needs, the same distinction already made for MSG91 (§4.4). Razorpay is the natural choice for an India-first B2B platform: UPI + cards + netbanking + e-mandates in one integration.

**The one rule this whole section exists to enforce: the wallet is credited from a verified webhook, never from the browser.** A client-side "payment success" callback can be tampered with, replayed, or simply forged by anyone who opens devtools — it's a UI convenience for showing the user a success state immediately, not a trust boundary. Treating it as one is the single most common way a self-built billing integration gets exploited for free wallet credit.

**Top-up flow:**

1. Developer clicks "Add ₹2,000" → backend calls Razorpay's Orders API (`POST /v1/orders`, amount in paise, `receipt` = your internal `Transaction.id`) → creates a `Transaction` row (`type: WALLET_TOPUP`, `status: PENDING`, `gatewayOrderId` set, `webhookVerified: false`).
2. Frontend opens Razorpay Checkout with that `order_id` (public `key_id` only — `key_secret` never leaves the backend).
3. On payment completion, Razorpay's client-side handler returns `razorpay_payment_id` + `razorpay_order_id` + `razorpay_signature` to your frontend. Verify this signature server-side too (HMAC-SHA256 of `order_id|payment_id` using `key_secret`) — **but treat this only as "show the user an optimistic pending state," never as authorization to credit the wallet.**
4. The **authoritative** credit happens from Razorpay's server-to-server webhook (`payment.captured` event), verified independently:

```typescript
@Post('webhooks/razorpay')
async handleRazorpayWebhook(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature: string) {
  const expected = createHmac('sha256', this.config.get('RAZORPAY_WEBHOOK_SECRET'))
    .update(req.rawBody) // raw, unparsed body — signature is computed over exact bytes received
    .digest('hex');
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new UnauthorizedException('invalid_webhook_signature'); // ← reject, don't log-and-continue
  }

  const event = JSON.parse(req.rawBody.toString());
  if (event.event !== 'payment.captured') return { ok: true }; // ignore events we don't act on

  const paymentId = event.payload.payment.entity.id;
  const orderId = event.payload.payment.entity.order_id;

  // Idempotency: the unique constraint on Transaction.gatewayPaymentId (§2) makes a duplicate
  // webhook delivery a no-op at the DB layer, not just an application-level check
  const existing = await this.prisma.transaction.findUnique({ where: { gatewayPaymentId: paymentId } });
  if (existing?.webhookVerified) return { ok: true }; // already processed — Razorpay retries on any non-2xx

  const amount = new Decimal(event.payload.payment.entity.amount).div(100); // paise → rupees

  await this.prisma.$transaction([
    this.prisma.transaction.update({
      where: { gatewayOrderId: orderId },
      data: { gatewayPaymentId: paymentId, webhookVerified: true, status: 'SUCCESS' },
    }),
    this.prisma.organization.update({
      where: { id: /* resolved via the transaction's organizationId */ orgId },
      data: { walletBalance: { increment: amount } },
    }),
  ]); // same atomicity requirement as the usage-deduction worker in §3.5 — a partial write here
      // either loses a customer's payment or double-credits it

  return { ok: true };
}
```

**Why `timingSafeEqual` instead of `===`:** a naive string comparison leaks timing information about how many leading bytes matched, which is a real (if narrow) side-channel for forging a valid signature over many requests — cheap to do correctly, so do it correctly.

**Auto-recharge:**

Developer opts in with a threshold + top-up amount (`Organization.autoRechargeThreshold`/`autoRechargeAmount`, §2) and completes a one-time Razorpay e-mandate/saved-card authorization, storing the resulting `razorpayMandateId`. When `WalletService.checkLowBalanceThreshold` (§3.5) fires, enqueue a BullMQ job (`type: AUTO_RECHARGE`) that charges the saved mandate via Razorpay's recurring-payment API — **the resulting charge still only credits the wallet through the exact same webhook path above**, never a direct synchronous credit in the charge-request handler. One code path for "money arrived," regardless of what triggered the charge, is what keeps this auditable.

**Refunds, in detail:**

Staff-initiated only, from `/admin/billing` (§4.1, §4.8.2) — there is no self-serve "refund me" button in the developer portal, the same way there's no self-serve refund on most B2B wallets. The flow has more edge cases than "call the Refund API," because a wallet top-up isn't a simple purchase: by the time someone asks for a refund, part of that money may already be *spent* (converted into calls that already happened), and part of the wallet's current balance may be promotional credit from §4.10 that was never real money to begin with.

**Eligibility check, before calling Razorpay at all:**

1. The target must be a `Transaction` with `type: WALLET_TOPUP` and `webhookVerified: true` — you can't refund a payment that was never confirmed as captured.
2. **Refundable amount is capped at the org's current `walletBalance`, not the original payment amount.** If a ₹5,000 top-up has already had ₹3,000 consumed as `UsageLog` deductions, only ₹2,000 is left to give back — that ₹3,000 paid for RTC minutes that were actually delivered, and clawing it back would mean refunding a service you already rendered. The admin UI shows this ceiling explicitly ("max refundable: ₹2,000 of ₹5,000 — ₹3,000 already used") rather than letting staff attempt a larger refund that would drive the wallet negative.
3. **Exclude linked promotional credit** (§4.10.1): if this top-up triggered a `WalletOfferRedemption`, that bonus amount is not part of what's refundable — the refundable ceiling is capped at `min(currentWalletBalance, originalTopupAmount)`, deliberately excluding any `PROMOTIONAL_CREDIT` `Transaction` linked to it. That credit was never paid for; it doesn't go back to a card.
4. **Prevent double-refunding**: sum every existing `Transaction` where `originalTransactionId` points at this top-up (§2's self-relation) and subtract it from the original amount before computing what's still refundable — a second partial refund attempt against an already-fully-refunded top-up must be rejected at this check, not discovered as a Razorpay API error.
5. **No single top-up covers the requested amount?** (e.g. an org wants their entire remaining balance back, accumulated across several historical top-ups) — Razorpay refunds are always against one specific `payment_id`, so there's no single API call for "refund the wallet." Walk the org's `WALLET_TOPUP` transactions most-recent-first, issuing one linked `REFUND` `Transaction` per source top-up, until the requested total is covered. Each one goes through the full flow below independently.

**Flow:**

6. Staff picks the source `WALLET_TOPUP` `Transaction`, enters an amount (defaults to the max refundable from step 2–4, editable downward for a partial/goodwill refund) and a **mandatory** `reason` — this becomes both the `AdminActionLog.reason` (§4.8.4, action `"wallet.refund_initiate"`) and, unlike most `AdminActionLog` entries, something the developer may eventually see in their own transaction history.
7. Backend creates a `Transaction` row immediately: `type: REFUND`, `status: PENDING`, `originalTransactionId` set to the source top-up, amount as validated above. This row exists *before* calling Razorpay, so a crash between "we decided to refund" and "Razorpay confirmed it" is a recoverable `PENDING` row, not a lost action.
8. Call Razorpay's Refund API against the source `Transaction.gatewayPaymentId`, passing this new row's own `id` as the `receipt` field (Razorpay's own idempotency key for the refund call itself — a retried request with the same receipt won't double-refund on Razorpay's side either).
9. Razorpay's synchronous response confirms the refund was **initiated**, not that funds have moved — store the returned `rfnd_...` id into `gatewayRefundId` (§2) and stop there. **Do not touch `walletBalance` yet.**
10. The **authoritative** debit happens from Razorpay's `refund.processed` webhook, verified with the same HMAC/`timingSafeEqual` pattern as `payment.captured` (§4.7's code block above):

```typescript
@Post('webhooks/razorpay')
async handleRazorpayWebhook(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature: string) {
  // ... signature verification identical to the payment.captured handler above ...
  const event = JSON.parse(req.rawBody.toString());

  if (event.event === 'refund.processed') {
    const refundId = event.payload.refund.entity.id;

    // Idempotency: gatewayRefundId's unique constraint (§2) makes a duplicate webhook a no-op,
    // same mechanism as gatewayPaymentId does for payment.captured
    const txn = await this.prisma.transaction.findUnique({ where: { gatewayRefundId: refundId } });
    if (!txn || txn.status === 'SUCCESS') return { ok: true };

    await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id: txn.id },
        data: { status: 'SUCCESS' },
      }),
      this.prisma.organization.update({
        where: { id: txn.organizationId },
        data: { walletBalance: { decrement: txn.amount } },
      }),
    ]); // same atomicity requirement as every other wallet mutation in this doc (§3.5, §4.7, §4.10)

    await this.notifications.send(txn.organizationId, 'REFUND_PROCESSED', { amount: txn.amount });
  }

  if (event.event === 'refund.failed') {
    await this.prisma.transaction.update({
      where: { gatewayRefundId: event.payload.refund.entity.id },
      data: { status: 'FAILED' },
    }); // surfaced back in /admin/billing for staff to retry or investigate — never silently dropped
  }

  return { ok: true };
}
```

11. On `refund.failed` (card no longer valid, Razorpay-side rejection, etc.), the `Transaction` stays `FAILED` and visible in `/admin/billing` for staff to retry with a different resolution (e.g. a `MANUAL_ADJUSTMENT` credit note instead, if the card genuinely can't be refunded) — this mirrors the dead-letter surfacing pattern §1.4 already uses for failed recording uploads: a failure needs to be *visible somewhere a human will look*, not just logged.

**Why this never needs a GST credit note:** GST invoicing (§4.6) is computed on *consumed usage* over a billing period, not on the wallet top-up event itself — the top-up is just money moving into the wallet, not a taxable supply on its own. Since a refund is only ever possible against the *unspent* portion of a top-up (step 2 above), and unspent balance was, by definition, never billed as usage on any `Invoice`, there's nothing to reverse on the tax side. This is a direct consequence of keeping the refund ceiling tied to `walletBalance` rather than the original payment amount — it's not a coincidence, it's why that ceiling rule exists.

**Security checklist specific to this integration (ties into §6):**

- `key_secret` and `RAZORPAY_WEBHOOK_SECRET` live in the same KMS-backed secrets path as every other credential in §3.2/§6.1 — not a plaintext `.env` value past your first few real customers.
- The webhook endpoint must read the **raw** request body for signature verification — if NestJS's body-parser has already transformed it to JSON before your handler sees it, the byte-for-byte signature check will fail (or worse, someone "fixes" this by re-stringifying the parsed JSON, which can produce different bytes than what Razorpay actually signed). Configure a raw-body route specifically for this webhook.
- Never accept a webhook over plain HTTP, and reject any request without a valid signature outright — no "log it and process anyway" fallback path, ever.

### 4.8 Internal Admin Panel (added — staff-facing, not developer-facing)

The original spec never scopes this out as its own surface — `/admin/kyc-queue` (§4.5) and `/admin/billing` (§4.7) get name-checked in passing, and §6.5 assumes an "admin action audit trail" exists, but nothing actually defines who staff are, what they can touch, or how that's kept separate from the developer-facing portal. An "enterprise-level" platform is graded on whether *your own* internal access is controlled and audited, not only on what customers can do — a security questionnaire will ask "who at your company can see our recordings' metadata, our credentials, our wallet balance, and what stops them" before it asks about your uptime SLA.

**4.8.1 Why this is a separate app, not a route group inside the developer portal**

- **Different identity domain**: staff are not `User`/`OrgMember` rows — they're your own employees, modeled by `StaffUser` (§2), with no `Organization` of their own. Folding them into the same auth system as developers risks a single authz bug exposing admin routes to a developer-scoped session.
- **Different network exposure**: serve it from its own subdomain (e.g. `admin.yourdomain.com`) behind a VPN or IP allowlist, never reachable from the same public hostname as the developer portal — this bounds the blast radius if the public-facing app has a vulnerability.
- **Different threat model for login**: password + **mandatory** TOTP MFA, not the OTP-passwordless flow developers get (§4.4) — an admin session can read or act on every customer's data, so it warrants a slower-to-phish factor even at the cost of a little friction.
- **Different deploy cadence**: a hotfix to the refund tool shouldn't have to ride the same build/release pipeline as customer-facing UI changes.

Backend-wise this can still be the *same* NestJS API — admin routes sit behind `StaffAuthGuard` (§3.0) instead of `ApiKeyGuard`, reusing existing services (wallet, KYC, egress) rather than duplicating business logic in a second backend.

**4.8.2 Page map**

| Route | Purpose | Min. role (§2 `StaffRole`) |
| --- | --- | --- |
| `/admin/login` | Email + password + mandatory TOTP — no OTP-passwordless path for staff | any |
| `/admin/organizations` | Search/list every `Organization`; drill into wallet, plan tier, KYC status, members | SUPPORT |
| `/admin/organizations/[id]/impersonate` | Time-boxed, audited "view as this org" session — see §4.8.4 | SUPPORT |
| `/admin/kyc-queue` | Review pending `KycVerification` submissions, approve/reject with a `rejectionReason` (§4.5) | KYC_REVIEWER |
| `/admin/billing` | Manual wallet adjustments, refunds (§4.7), reissue/void an `Invoice` | BILLING_OPS |
| `/admin/offers` | ← added — §4.10: create/edit/deactivate `WalletOffer` recharge bonuses, view redemption history | BILLING_OPS |
| `/admin/projects` | Cross-org project search, force-suspend a project (abuse response, §7.3), inspect/override `maxConcurrentRooms` | SUPPORT |
| `/admin/webhooks` | Platform-wide `WebhookDelivery` failure feed across every org — not one org's view (the org-scoped equivalent is `/audit-log` in §4.1) | SUPPORT |
| `/admin/media-nodes` | Live LiveKit/Coturn node health from Prometheus (§7.4) — active rooms per node, NIC utilization vs. the §5.3 capacity ceiling, a drain-node action for scheduled maintenance (§5.4) | SECURITY_ADMIN |
| `/admin/audit-log` | Platform-wide `CredentialAccessLog` + `AdminActionLog` (§2), filterable by staff member, org, or action type | SECURITY_ADMIN |
| `/admin/staff` | Create/deactivate `StaffUser` accounts, assign roles | SUPER_ADMIN |

**4.8.3 Impersonation, done safely**

"View as this org" is a genuine support need (reproducing a customer's exact dashboard state beats asking them to screen-share) but is also the single highest-risk feature in an admin panel when built casually:

- Time-boxed session (e.g. 30 minutes, auto-expires — no standing impersonation sessions).
- **Read-only by default**; making changes while impersonating requires a second, explicit toggle, which is itself a separate logged action.
- Both the start and the end of the session write to `AdminActionLog` (`org.impersonate_start` / `org.impersonate_end`) — logging only the start leaves "how long did they have access and what could they have seen" unanswerable later.
- A persistent, impossible-to-miss banner for the entire impersonated session ("Viewing as {org} — staff:{email}") — this protects the customer (nothing a support engineer does should be indistinguishable from the customer's own action in a later audit) as much as it protects the staff member.

**4.8.4 Least-privilege credential access (ties into §6.5)**

A support engineer investigating "why didn't my recording upload" must **never** run a manual DB query to decrypt a customer's `StorageConfig`. Route this through a support-specific method built on top of the same path `EgressDispatcherService` uses (§3.4) — it accepts a required `reason` string, writes to `CredentialAccessLog` with `actor` set to the staff member's id instead of `system:*`, and returns only a boolean canary-write result ("credentials still valid: yes/no"), the same UX as the portal's own verify button (§4.2) — **never** the plaintext secret rendered in the admin UI. If a human ever genuinely needs to see a raw key, that need is the bug to design out, not a feature to build for.

**4.8.5 Rollout placement (updates §8.1)**

KYC review and billing ops are not optional extras bolted on after launch — a KYC gate (§4.5) with no review queue, or a wallet top-up flow with no way to issue a manual refund, blocks real paying customers on day one. `/admin/kyc-queue` and `/admin/billing` (SUPPORT/BILLING_OPS/KYC_REVIEWER roles only) ship as part of **Phase 3 — Billing & wallet**, not deferred to Phase 6. `/admin/media-nodes` and `/admin/staff` (SECURITY_ADMIN/SUPER_ADMIN) can wait for **Phase 5 — Scale-out**, since they depend on the Prometheus/Grafana stack that phase introduces (§7.4).

### 4.9 Plan tiers, rate cards & the usage-based upgrade path (added)

Billing stays **100% prepaid wallet** (§4.7) — there is no subscription fee anywhere in this platform, and this section doesn't change that. What it adds is the missing link between `PlanTier` and money: today `PlanTier` (§2, §7.3) only gates *limits* (concurrent rooms, participants/room, token TTL). It never touches `ratePerMinute`, so "upgrade your plan" currently has no financial upside for a developer — it only raises a ceiling they may not have hit yet. Two independent dials, not one:

- **Wallet balance** answers "how much money is left" — recharge-driven, untouched by plan tier.
- **Plan tier** now answers *two* questions instead of one: "how much can I run concurrently" (existing) **and** "what do I pay per minute" (new, via `PlanRateCard`, §2).

**4.9.1 Rate resolution — `PricingService.getRateFor`**

Called once, at room-close time, by the billing worker (§3.5) — the resolved rate is snapshotted into `UsageLog.ratePerMinute` and never recomputed later, same historical-accuracy rule the doc already states for that column (§2).

```typescript
@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  async getRateFor(projectId: string, roomType: RoomType): Promise<Decimal> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { organization: true },
    });

    // A negotiated Enterprise rate always wins over the published rate card (§2, §7.3)
    const override = await this.prisma.organizationRateOverride.findUnique({
      where: { organizationId_roomType: { organizationId: project.organizationId, roomType } },
    });
    if (override) return override.ratePerMinute;

    // Otherwise, the org's current plan tier's published rate — latest row that's already active
    const rateCard = await this.prisma.planRateCard.findFirst({
      where: {
        planTier: project.organization.planTier,
        roomType,
        effectiveFrom: { lte: new Date() },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!rateCard) throw new Error(`no_rate_card_for_${project.organization.planTier}_${roomType}`);
    return rateCard.ratePerMinute;
  }
}
```

**Publishing a new rate never edits an existing `PlanRateCard` row** — insert a new one with a future `effectiveFrom`. Calls billed under the old rate keep their already-snapshotted `UsageLog.ratePerMinute`; only rooms that close after the cutover pick up the new rate. This is the same append-only pattern the doc already uses for API secret rotation (§6.1) and encryption key versions (§3.2) — never mutate a value something else has already keyed off of.

**4.9.2 Self-serve upgrade vs. negotiated Enterprise**

- **Starter → Growth** is self-serve: a plan switcher on `/billing/plan` (new page under §4.1) that calls `PATCH /v1/organizations/:id/plan`. It takes effect immediately — no proration logic needed, since nothing is a recurring fee; only *usage from this point forward* bills at the new rate, and the new `maxConcurrentRooms`/`maxTokenTtlSeconds` ceiling applies right away. Wallet balance is untouched by the switch.
- **→ Enterprise** stays "Contact sales" (matches the existing "negotiated" row in §7.3's table), because it isn't just a rate-card lookup — it's a signed deal. Sales/admin records the agreed rate as an `OrganizationRateOverride` (§2) from `/admin/organizations` (§4.8.2), plus a manual `maxConcurrentRooms`/TTL override on the affected `Project` rows via `/admin/projects`. No self-serve path here, by design — an Enterprise rate is a commitment, not a toggle.

**4.9.3 Nudging an upgrade from usage, without touching billing logic**

Extend `RoomQuotaGuard` (§3.7): every time it rejects a request with `concurrent_room_limit_exceeded`, increment a Redis counter `plan-limit-hits:{projectId}` with a 24-hour TTL, alongside the existing `active-rooms:{projectId}` set. A scheduled job checks that counter hourly; past a threshold (e.g. 5 rejections in 24h), fire `NotificationType.PLAN_LIMIT_REACHED` (§2, §3.8) — a `LOW_BALANCE`-style nudge, but pointed at the ceiling, not the wallet, so a project that's rich in credit but capped on concurrency gets the right message instead of a confusing "recharge" prompt. This is purely a growth signal — it never blocks or throttles anything the `RoomQuotaGuard` wasn't already going to reject on its own.

### 4.10 Recharge offers / promotional bonus credit (added)

No postpaid, no subscriptions — confirmed, wallet-only stays the entire billing model (§4.7, §4.9). What this adds is a promotional lever on top of it: **staff manually create recharge bonus offers** ("recharge ₹5000+, get 10% extra credit"), the same lever every Indian wallet/payments app (Paytm, prepaid mobile recharges) uses to pull larger top-ups. This is never a developer-facing or self-serve creation flow — only `BILLING_OPS`/`SUPER_ADMIN` staff create and toggle offers, from `/admin/offers` (§4.8.2).

**4.10.1 Why bonus credit is its own ledger entry, not just a bigger top-up number**

When a ₹5000 top-up qualifies for a "10% extra" offer, the wallet should end up ₹5500 richer — but that ₹500 must be tracked as `TransactionType.PROMOTIONAL_CREDIT` (§2), a separate `Transaction` row from the real `WALLET_TOPUP`, not folded into the same amount. Three concrete reasons this separation earns its keep:

- **Refunds** (§4.7): if this top-up is later refunded, only the real ₹5000 goes back through Razorpay's Refund API — the ₹500 bonus was never actually paid for and is not Razorpay's to refund. Policy: **promotional credit is non-refundable by default** — reversing it (if a customer is refunded and staff wants to claw the bonus back too) is a separate, explicit `MANUAL_ADJUSTMENT` a staff member makes deliberately, not something a refund does automatically.
- **GST invoicing** (§4.6): whether bonus credit consumed as usage attracts GST the same way paid credit does is a real tax question, not an architecture one — flag it for your CA the same way `sacCode` and the GST rate itself are already flagged in §4.6, rather than this blueprint asserting an answer it isn't qualified to give.
- **Audit/finance reporting**: "how much real revenue did we take in this month" vs. "how much promotional liability did we give away" are two different numbers a finance review will ask for separately — conflating them into one `WALLET_TOPUP` figure makes that question unanswerable after the fact.

**4.10.2 Redemption logic — extends the §4.7 Razorpay webhook**

Runs inside the **same** atomic transaction as the real wallet credit (§4.7's `handleRazorpayWebhook`) — a crash partway through must not credit the bonus without the real payment, or vice versa. Because eligibility requires a few conditional reads (best-fit offer, per-org limit, total cap), switch that handler's `$transaction([...])` array form to Prisma's interactive `$transaction(async (tx) => { ... })` form, and call this from inside it:

```typescript
async function applyRechargeOffer(
  tx: Prisma.TransactionClient,
  organizationId: string,
  transactionId: string, // the WALLET_TOPUP Transaction.id just credited in this same tx
  amount: Decimal,       // the real recharge amount
) {
  const offer = await tx.walletOffer.findFirst({
    where: {
      isActive: true,
      minRechargeAmount: { lte: amount },
      validFrom: { lte: new Date() },
      validUntil: { gte: new Date() },
    },
    orderBy: { minRechargeAmount: 'desc' }, // best-fit: the highest threshold this top-up clears —
  });                                        // offers don't stack, only one applies per top-up
  if (!offer) return;

  const orgRedemptions = await tx.walletOfferRedemption.count({ where: { offerId: offer.id, organizationId } });
  if (orgRedemptions >= offer.perOrgLimit) return;

  if (offer.totalRedemptionCap) {
    const totalRedemptions = await tx.walletOfferRedemption.count({ where: { offerId: offer.id } });
    if (totalRedemptions >= offer.totalRedemptionCap) return; // offer exhausted platform-wide
  }

  const rawBonus = offer.bonusType === 'PERCENTAGE' ? amount.mul(offer.bonusValue).div(100) : offer.bonusValue;
  const bonusAmount = offer.maxBonusAmount ? Decimal.min(rawBonus, offer.maxBonusAmount) : rawBonus;

  await tx.walletOfferRedemption.create({ data: { offerId: offer.id, organizationId, transactionId, bonusAmount } });
  await tx.transaction.create({
    data: { organizationId, type: 'PROMOTIONAL_CREDIT', amount: bonusAmount, status: 'SUCCESS', webhookVerified: true },
  });
  await tx.organization.update({ where: { id: organizationId }, data: { walletBalance: { increment: bonusAmount } } });
}
```

Silent no-ops (`return` with nothing applied) on every ineligible branch are deliberate — a developer's top-up must **never fail or roll back** because an offer was misconfigured or already exhausted; the real payment always goes through regardless of bonus eligibility.

**4.10.3 Developer-facing surface**

Active offers show as a small banner on `/billing` (§4.1) before the top-up form — "Recharge ₹5000 or more and get 10% extra credit" — pulled from `WalletOffer` rows where `isActive` and within `[validFrom, validUntil]`, no auth beyond normal portal session needed since this is just marketing copy, not a redemption action. After a qualifying top-up, the transaction history (§4.3) shows both rows distinctly: `WALLET_TOPUP ₹5000` and `PROMOTIONAL_CREDIT ₹500`, never merged into one `₹5500` line — the same "don't hide what actually happened" principle the doc already applies to webhook delivery logs (§4.3) and the audit log (§4.1).

**4.10.4 Abuse prevention**

`perOrgLimit` (default 1) stops one organization from recharging in small qualifying increments repeatedly to farm the same offer. `totalRedemptionCap` bounds the platform's total promotional exposure regardless of how many distinct orgs redeem it — useful for a time-boxed campaign with a fixed marketing budget. Staff can flip `isActive` off at any time without deleting the offer or its historical `WalletOfferRedemption` rows, so past bonus grants stay explainable even after a campaign ends.

### 4.11 AI Voice Agent — developer configuration (BYOK, added — §1.6, §3.9)

**No AI model is bundled or resold.** The developer picks and pays for their own LLM, STT, and TTS providers directly — our side of `/projects/[id]/ai-agent` is a **BYOK configuration surface plus the orchestration compute**, not an AI product of our own. This is the same commercial shape as BYOS (§4.2) and BYOF, one level up the stack.

**Provider configuration form** — three independent slots (LLM / STT / TTS), each a vendor dropdown + API key field, the same one-form-per-`AiProviderConfig`-row pattern as §4.2's storage form:

```typescript
const aiProviderSchema = z.discriminatedUnion('providerType', [
  z.object({ providerType: z.literal('LLM'), vendor: z.enum(['OPENAI', 'ANTHROPIC', 'GOOGLE', 'CUSTOM']),
             apiKey: z.string(), modelName: z.string() }), // e.g. "gpt-4o-realtime", "claude-..."
  z.object({ providerType: z.literal('STT'), vendor: z.enum(['DEEPGRAM', 'ASSEMBLYAI', 'OPENAI', 'CUSTOM']),
             apiKey: z.string(), modelName: z.string().optional() }),
  z.object({ providerType: z.literal('TTS'), vendor: z.enum(['ELEVENLABS', 'PLAYHT', 'CARTESIA', 'AZURE_SPEECH', 'CUSTOM']),
             apiKey: z.string(), extraConfig: z.object({ voiceId: z.string() }) }), // ElevenLabs-style voice selection
]);
```

**Voice selection (male/female/accent/tone) is entirely the TTS vendor's, never ours:** we don't hardcode or curate voices — `AiProviderConfig.extraConfig.voiceId` (§2) just stores whichever voice the developer picked from *their own* TTS provider's library. Once the API key is entered, the form calls that vendor's own voices-listing endpoint (e.g. ElevenLabs' `/v1/voices`) server-side (using the developer's just-decrypted key, the same one-time-use pattern as any other BYOK call) and renders the results as a picker — name, language, and whatever gender/style metadata the vendor itself exposes — rather than us maintaining a static, quickly-stale list across five different vendors. Each vendor's catalog differs: ElevenLabs and PlayHT lean toward large stock libraries plus voice-cloning, Azure Speech labels its neural voices by gender and locale directly. Whatever the vendor offers is what the developer sees — we're a pass-through here, same as everywhere else in this pipeline.

**Verify, the same non-negotiable rule as §4.2:** saving a key without testing it is how a developer discovers three weeks later that their agent has been silently failing to start. On submit, backend makes one minimal real call per provider — a trivial completion for the LLM key, a short transcription round-trip for the STT key, and for TTS, **the same synthesis call doubles as a voice preview**: it speaks a short sample (e.g. "Hi, this is a test of the selected voice") in the exact `voiceId` just picked, played back inline in the portal, before persisting — this catches both "the key is dead" and "that's not the voice I meant to pick" in one step, rather than the developer only discovering the wrong voice was chosen once the agent is live on a real call. `lastVerifiedAt` is set only on success; a dead key or an invalid `voiceId` surfaces the vendor's actual error inline (an expired ElevenLabs key should say so, not just "saved").

**Agent persona editor** — a simple form over `AiAgentProfile` (§2): name, system prompt (a large textarea), an optional greeting line spoken before the human says anything, a **language** dropdown (BCP-47, plus an "auto-detect / code-switching" option where the selected STT/TTS vendor supports it, §1.6), and an `interruptible` toggle (on by default — this is what stops the agent talking over a human who wants to interject, the difference between "feels like a conversation" and "feels like an IVR menu"). Changing `language` re-filters the TTS voice picker (§4.11's voice-selection section above) to that language's available voices — a developer can't be left with a selected voice that doesn't actually speak the language they just switched to. A project can have more than one profile (e.g. "Support Bot" vs. "Sales Qualifier", potentially in different languages), all sharing the same three `AiProviderConfig` credentials.

**Usage & cost visibility:** `/projects/[id]/usage` (§4.3) gets a second chart series for `AiAgentSession` minutes, billed separately from call minutes (§1.6, §3.9) — labelled distinctly so a developer never mistakes "AI orchestration compute" spend for "RTC bandwidth" spend on their own wallet statement. Their LLM/TTS/STT provider bills never appear here at all — those are between the developer and their own vendor account.

### 4.12 Live Broadcast — developer configuration (added — §1.7, §3.10)

There's no broadcast *viewer* UI to build here — that's the developer's own app, same as calling. What the portal owns is configuration and visibility:

- **Delivery-mode guidance, not an automatic switch**: the portal doesn't silently flip a live broadcast from `WEBRTC_SFU` to `HLS_CDN` mid-stream — that would mean every existing viewer's player breaks and has to reconnect to a different URL scheme. The developer picks the mode when starting a broadcast (`POST /v1/broadcasts/start`), and `/projects/[id]/broadcasts` shows a plain-language recommendation ("expecting more than a few hundred concurrent viewers? use HLS_CDN") backed by whatever ceiling your own load-testing (§7.5) validates for `WEBRTC_SFU` mode on your actual media-node sizing — a real, measured number, not a guess baked into the UI.
- **Restream destinations** (`RestreamDestination`, §2): a form to add/remove YouTube/Facebook/Twitch/custom RTMP targets — label, ingest URL, stream key — with the same "shown once, never retrievable, only re-rollable" secret-handling UX as API secrets and webhook signing secrets (§4.3). A status badge per destination (`PENDING`/`LIVE`/`FAILED`/`ENDED`) reflects `RestreamDestination.status`, sourced from the Egress webhook the same way `Recording.status` already is (§1.4).
- **Broadcast history**: past `BroadcastSession` rows — duration, delivery mode used, and `peakViewerCount` **only where it's actually known** (`WEBRTC_SFU` mode). For `HLS_CDN` sessions, the UI shows "viewer count: not tracked (HLS/CDN delivery)" rather than a blank or a zero that could be misread as "nobody watched" — the honest answer is "we genuinely don't know," and the portal should say that plainly rather than paper over it.
- **Ingest credentials** for OBS-style hosts: a "Generate RTMP ingest" button per broadcast, calling `POST /v1/broadcasts/:id/ingest` (§3.10) and displaying the resulting URL + stream key with the same reveal-once modal pattern as everything else in §4.3 — these are one-time-use per broadcast session, not a standing credential, so there's nothing to rotate later.

## 5. Infrastructure & Deployment Guide

### 5.1 Docker Compose — LiveKit + Redis + Coturn

```yaml
version: "3.9"
services:
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
    volumes: ["redis-data:/data"]
    ports: ["6379:6379"]

  livekit:
    image: livekit/livekit-server:latest
    command: ["--config", "/etc/livekit.yaml"]
    volumes: ["./livekit.yaml:/etc/livekit.yaml"]
    network_mode: host   # ← required, not optional: LiveKit needs to bind the real host UDP
                          # port range for RTP; Docker's bridge networking breaks NAT traversal
    depends_on: [redis]

  coturn:
    image: coturn/coturn:latest
    network_mode: host   # ← same reasoning — TURN relay needs real host ports, not NAT'd ones
    volumes: ["./turnserver.conf:/etc/coturn/turnserver.conf"]
    command: ["-c", "/etc/coturn/turnserver.conf"]

volumes:
  redis-data:
```

`livekit.yaml` (key fields):

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000       # ← must match the security-group/firewall UDP range exactly
  use_external_ip: true       # required on any cloud VM behind a NAT'd public IP (AWS/GCP/most VPS)
redis:
  address: 127.0.0.1:6379
  password: "${REDIS_PASSWORD}"   # ← required for multi-node clustering (§5.4) — without Redis,
                                    # every LiveKit node is an island and cross-node room routing fails
keys:
  "${LIVEKIT_INTERNAL_API_KEY}": "${LIVEKIT_INTERNAL_API_SECRET}"  # §1.2
turn:
  enabled: false   # ← use the standalone Coturn above, not LiveKit's built-in TURN — a dedicated
                     # Coturn instance is easier to scale and monitor independently of media nodes
```

### 5.2 Coturn configuration & symmetric NAT

```ini
# turnserver.conf
listening-port=3478
tls-listening-port=5349
min-port=49152
max-port=65535                 # ← relay port range — size this generously, each active TURN
                                 # relay session consumes one port for its lifetime
external-ip=<PUBLIC_IP>/<PRIVATE_IP>   # required on any cloud instance with a NAT'd private IP
realm=turn.yourdomain.com
user-quota=0
total-quota=0
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=${TURN_SHARED_SECRET}   # time-limited credentials (below), not static user/pass
cert=/etc/coturn/certs/fullchain.pem
pkey=/etc/coturn/certs/privkey.pem
no-tcp-relay          # ← optional hardening: force UDP relay only, unless you specifically need
                        # TURN-over-TCP/TLS for clients on networks that block all UDP
```

**Time-limited TURN credentials, generated per-session, not static:**

```typescript
function generateTurnCredential(sharedSecret: string, ttlSeconds = 3600) {
  const username = `${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  const password = createHmac('sha1', sharedSecret).update(username).digest('base64');
  return { username, password, urls: ['turn:turn.yourdomain.com:3478'] };
}
```

**Symmetric NAT (added — the spec asks for this explicitly, and it's where self-hosted RTC projects most often underestimate cost):** STUN alone cannot establish a direct path between two peers both behind symmetric NAT — their mapped ports change per destination, so ICE candidate exchange never converges on a usable pair, and *all* media falls back to relaying through Coturn. Public numbers cite 15–20% of sessions needing TURN relay on consumer ISPs; **corporate/enterprise networks with symmetric NAT and aggressive firewalls routinely push this to 60–100%.** Since a B2B platform's customers are, definitionally, other businesses whose *own end users* may be on corporate networks, size TURN bandwidth capacity assuming a much higher relay rate than consumer-app benchmarks suggest (see §8's cost model).

### 5.3 Production server sizing

**App/control-plane node** (NestJS + Next.js + BullMQ workers) — CPU/memory bound, not network bound. A single 4 vCPU / 8GB node comfortably handles thousands of token-generation requests/sec; this tier scales horizontally behind a load balancer with no special considerations, since it's stateless (§1.1).

**Media node** (LiveKit SFU) — network-throughput bound, not CPU bound (LiveKit's SFU forwards encoded packets, it doesn't transcode by default). Rough math per concurrent participant in a group video call:

| Direction | Typical bitrate | Notes |
| --- | --- | --- |
| Upload (publish) | \~1.5 Mbps | One stream per publishing participant |
| Download (subscribe) | \~1.5 Mbps × (N−1) | SFU forwards each other participant's stream independently — this is *why* SFU bandwidth scales with N² for the room, not N |

A 10-participant video room costs the SFU roughly `10 × 1.5 Mbps up + 10 × 9 × 1.5 Mbps down ≈ 150 Mbps` aggregate. A media node on a 1 Gbps NIC can sustain on the order of **60–80 concurrent 10-person rooms** before bandwidth (not CPU) becomes the ceiling — validate this on your actual instance's real sustained throughput, cloud "1 Gbps" NICs frequently sustain less under real conditions.

**TURN relay node capacity (added, and the number that most sizing guides skip):** every relayed session consumes **both directions of bandwidth twice** (client→TURN→peer, not client→peer directly) — a relayed 1.5 Mbps stream costs Coturn \~3 Mbps of total throughput. At a 40% relay rate (a realistic B2B blend, not the optimistic consumer number), a platform running 100 concurrent 10-person rooms should provision Coturn capacity for roughly `100 × 10 × 0.4 × 3 Mbps ≈ 1.2 Gbps` — easy to under-provision if you sized only off the 15–20% consumer benchmark.

**Live broadcast (`WEBRTC_SFU` mode, §1.7) bandwidth is linear, not quadratic — a different sizing problem from a call:** a viewer only subscribes (\~1.5 Mbps down for video, far less for audio-only), never publishes, so a broadcast room's aggregate cost is `1 × host-publish + viewers × 1.5 Mbps down` — no N² fan-out, because viewers never forward to each other. A single 1 Gbps media node can therefore sustain **several hundred concurrent video viewers on one broadcast room** before bandwidth caps it, well past the 60–80-*room* ceiling that applies to fully-interactive calls — but this is still a number to load-test (§7.5) against your actual node, not assume. Past that ceiling, `HLS_CDN` mode (§1.7) moves viewer bandwidth entirely off your media nodes and onto the developer's own CDN — the only cost that stays on your side is the Egress worker producing the HLS segments, a flat cost independent of how many viewers are watching.

### 5.4 High availability

- **LiveKit**: multi-node cluster behind the *same* Redis instance (§5.1) — LiveKit uses Redis to coordinate room-to-node placement, so any node can accept a new WebSocket connection and get redirected/proxied to the node actually hosting that room.
- **Coturn**: run ≥2 instances behind a GeoDNS or round-robin DNS record; TURN has no shared state to synchronize, so this is closer to trivial horizontal scaling than LiveKit is.
- **Redis**: Sentinel (3-node minimum) or a managed Redis with automatic failover — Redis going down takes LiveKit's cross-node routing and BullMQ's entire job queue down with it; this is a single point of failure the original spec's "Redis + BullMQ" line item doesn't flag as needing HA itself.
- **MySQL**: primary + at least one read replica; point the usage-analytics queries (§4.3) at the replica so a slow dashboard query never contends with the billing worker's write path.
- **Rolling deploys without dropping active calls (added):** the NestJS gateway is stateless and safe to rolling-deploy at any time (§1.1). LiveKit media nodes are **not** — draining a media node means waiting for its active rooms to naturally end (or explicitly migrating participants, which LiveKit supports via room migration APIs in newer versions) before decommissioning it. Never blue-green a media node the way you would the app tier; treat media-node deploys as a scheduled maintenance action with active-room draining, not a CI/CD auto-deploy target.

## 6. Security, Compliance & Multi-Tenancy Hardening (added)

This section exists because "enterprise-level" is graded on a security questionnaire before it's graded on features. Every item here is something a mid-market or enterprise buyer's security team will ask about in the first call.

### 6.1 Secrets management & key rotation

- The AES master key (§3.2) should not live as a raw environment variable in production past your first few customers — move it to a managed KMS (AWS KMS, GCP KMS, or self-hosted HashiCorp Vault if you want to stay fully self-hosted end-to-end) the moment you have a paying enterprise customer. The `keyVersion` column on every encrypted row (§2) is what makes this migration non-disruptive: old rows keep decrypting with the old key version, new writes use the new one, and you re-encrypt opportunistically.
- **Platform API key/secret rotation** (developer-facing): the `previousSecretHash` + `previousSecretExpiresAt` pair on `Project` (§2) gives a grace window — a developer rotates their secret, their old deployments keep working for (say) 24 hours while they redeploy with the new one, instead of an instant hard cutover that breaks production for anyone who missed the announcement email.
- **Internal LiveKit key rotation** (§1.2): rotate on a schedule (e.g. quarterly) by adding a new key to `livekit.yaml`'s `keys` map *alongside* the old one, switching the Token Service to mint with the new key, and removing the old key only after its longest-lived outstanding token (bounded by `maxTokenTtlSeconds`, §2) has expired.

### 6.2 API key scoping & network controls

- **IP allowlisting per project** (`Project.ipAllowlist`, §2) — table stakes for any B2B API; a developer's server-side calls should originate from known egress IPs, and this is often a hard requirement in vendor security reviews, not just a nice-to-have.
- **Scoped keys** (future extension, flag it in the roadmap even if not v1): read-only keys that can generate tokens but not modify `StorageConfig`/`FirebaseConfig`, versus full-access keys — lets a developer embed a more restricted key in a CI pipeline or a less-trusted service.
- **Edge protection**: put Cloudflare (or equivalent) in front of both the Next.js portal and the NestJS API for DDoS absorption and WAF rules — do not rely on `@nestjs/throttler` alone as your only defense layer; application-level rate limiting protects your database and business logic, not your network capacity.

### 6.3 The "zero-data storage" claim needs a technical backstop, not just a policy line in the ToS

This is the single most important trust claim in your whole pitch, and it's also the easiest one to accidentally violate:

- **Recording egress temp files** (§1.4): enforce a hard TTL (e.g. 2 minutes past upload completion) with *two* independent enforcement mechanisms — LiveKit's own post-upload cleanup, and a separate sweep cron on every media node that deletes anything older than the TTL regardless of what LiveKit's process reported. Log every sweep deletion. If a security auditor asks "prove you don't retain recordings," this log is your answer.
- **Chat**: never introduce a server-side chat relay "for reliability" or "for moderation" later without re-auditing this claim — the entire zero-storage-for-chat guarantee depends on the client writing directly to the developer's own Firebase (§1.5). If a future feature (e.g. server-side content moderation) needs to inspect messages, it must call the developer's Firebase to read them transiently, on-demand, never persist a copy, and this needs the same audit-logging treatment as credential decrypts.
- **AI Voice Agent** (§1.6): the same discipline applies to conversation content as to recordings and chat — transcript segments and LLM responses pass through our agent worker process in memory only, relayed live over LiveKit's data channel, never written to disk or logged. BYOK (§1.6, §4.11) means the only credentials at risk here are the developer's own AI provider keys, decrypted the same audited, just-in-time way as `StorageConfig`/`FirebaseConfig`.
- **Live Broadcast, `HLS_CDN` mode** (§1.7): the strongest version of this claim yet — once Egress starts writing segments to the developer's own bucket, viewer traffic never reaches our infrastructure at all, which is also why `BroadcastSession.peakViewerCount` stays null in that mode rather than being backfilled with a guess. Don't let a future analytics feature quietly add a viewer-tracking beacon or pixel to "just get better numbers" without re-auditing this claim the same way §6.3 already asks for chat.
- **`CredentialAccessLog`** (§2): every decrypt of a developer's storage, Firebase, or AI provider credentials — by the egress dispatcher, by the FCM bridge, by the AI agent dispatcher, by a support engineer debugging an issue — is logged with actor and purpose. Expose a read-only view of *their own* log entries to each organization in the portal (§4.1's `/audit-log` page) — this single feature does more for enterprise trust than almost anything else in this list, because it lets the customer verify your claims themselves instead of taking your word for it.

### 6.4 Data residency & GDPR

- You don't store recordings or chat content, which sidesteps most GDPR data-residency concerns for that data — but you **do** store `UsageLog` rows containing `participantIdentity` (developer-supplied, often a real user ID or email) and IP addresses in `CredentialAccessLog`/audit trails. Treat these as personal data: support deletion-on-request (a `participantIdentity` string in old usage logs can usually be hashed/anonymized after a retention window rather than deleted outright, preserving aggregate billing history).
- Publish a Data Processing Agreement (DPA) that explicitly names the one exception to "we never touch your data" (§1.5's FCM push bridge) — an implicit exception discovered during a customer's security review is far worse than the same exception disclosed upfront.

### 6.5 SOC 2 readiness (even before you formally pursue it)

Building these in from day one costs a fraction of retrofitting them once a customer asks for a SOC 2 report as a purchase condition:

- Immutable audit trail for admin actions (support staff impersonating/inspecting a customer account, manual wallet adjustments) — `AdminActionLog` (§2), the general-purpose counterpart to `CredentialAccessLog`; see §4.8 for the admin panel this actually gets exercised from.
- MFA available for org owners/admins (`User.mfaSecret`/`mfaEnabled`, §2) — flagged, not necessarily v1, but the schema should have the column now rather than as a later migration on a live users table.
- Least-privilege internal access: your own support/ops staff should not have standing decrypt access to customer storage/Firebase credentials — route all legitimate support-driven decrypts through the same audited code path the egress dispatcher uses, never a manual DB query.

### 6.6 DPA / ToS disclosure checklist (added — a map from architecture decisions to what needs disclosing, not legal text itself)

**This is not a substitute for a lawyer.** Same caveat this doc already gives the GST SAC code and rate (§4.6) — nothing below is binding legal language; it's a checklist of *what a lawyer needs to know about this system* to draft the actual DPA/ToS, built by walking every place earlier sections already said "this needs to be disclosed" and collecting them in one place instead of leaving them scattered across nine sections for someone to rediscover later.

| Architecture decision | What it obligates you to disclose |
| --- | --- |
| FCM call-signaling push bridge (§1.5) | The one deliberate exception to "we never touch developer data" — must be named explicitly, not left implicit, or a customer's security review finds it themselves and asks why it wasn't mentioned |
| AI Voice Agent conversation content (§1.6) | Transcript/LLM output passes through your compute in memory only (never persisted) — but because it's BYOK, the developer's *own* AI vendor (their OpenAI/ElevenLabs account) also processes that content under a separate relationship. Disclose that you are not a party to, and don't warrant, the developer's own sub-processor agreement with their AI vendor |
| Live Broadcast `HLS_CDN` mode (§1.7) | You collect **zero** viewer data in this mode — no analytics, no IPs, nothing, because viewer traffic never reaches your infrastructure. Worth stating as a positive disclosure, not just an absence |
| Egress temp-file TTL (§1.4, §6.3) | Recordings transiently touch local disk for ≤2 minutes before upload and deletion — disclose the actual mechanism (TTL + independent sweep cron), not just the "we don't store recordings" conclusion; an enterprise buyer's security questionnaire asks *how*, not just *whether* |
| KYC documents — PAN/Aadhaar/GSTIN/CIN/Udyam (§4.5) | This is sensitive personal data on the **organization's owners**, collected for regulatory compliance — explicitly *not* covered by the zero-storage pitch (§4.5 already makes this distinction; the DPA needs its own consent clause for it, separate from the "we don't store your customers' data" promise). The DigiLocker consent flow (§4.5) has its own government-mandated consent language that needs to be surfaced, not just implemented |
| `CredentialAccessLog` / `AdminActionLog` (§2, §6.5) | Who at your company can access customer data, under what audit trail, for what purposes — summarize in the DPA; full detail already lives in the product's own `/audit-log` page (§4.1) for customers who want to verify it themselves |
| Sub-processors | Razorpay (sees payment details), MSG91 (sees phone numbers, once phone/OTP is live, §4.4), your SMTP relay (sees email addresses) all need listing as sub-processors under GDPR/DPDP. Self-hosted LiveKit/Coturn/MySQL/Redis do **not** count — they're your own infrastructure, not a third party |
| Data retention & deletion | The retention window for `UsageLog`/audit rows, the `participantIdentity` hashing-after-retention policy (§6.4), and the actual mechanism for a deletion-on-request — a policy sentence needs a corresponding technical process behind it, not just the sentence |
| Payment data / PCI scope (§4.7) | State plainly that card/UPI details never touch your infrastructure — Razorpay Checkout handles that, and PCI-DSS scope is theirs, not yours. Worth being explicit rather than assumed |
| **Applicable law** | §6.4 currently frames this around GDPR, but this platform's actual customer base — GST invoicing, PAN/Aadhaar/GSTIN KYC, Razorpay, DigiLocker, MSG91 — is India-first. **India's Digital Personal Data Protection (DPDP) Act, 2023 is likely the primary framework here**, with its own consent-notice and "Consent Manager" concepts distinct from GDPR's — flag this explicitly for whoever drafts the DPA, rather than defaulting to GDPR because it's the more commonly-referenced framework internationally |

Hand this table to whoever drafts the actual DPA/ToS — it's the difference between them starting from a blank page and guessing what to cover, versus starting from every data-handling promise this blueprint has already made.

## 7. Reliability, Scale & Production Edge Cases (added)

### 7.1 Client SDK — API surface (added: the original spec named the platforms to ship on, but never the actual surface developers code against)

**Why a thin wrapper, not a fork:** the client SDK is a thin layer over `livekit-client`/the native LiveKit SDKs — add your own conventions (auto token-refresh, standardized reconnect events, analytics hooks, our own AI/broadcast event types) at the wrapper boundary, never fork LiveKit's SDK internals. Forking means every upstream LiveKit release requires manual merge work forever; a wrapper means you absorb upstream updates for free.

**Reference shape, Web/TypeScript** (`@yourplatform/rtc-sdk`, wrapping `livekit-client` — other platforms mirror this conceptually, not verbatim, see below):

```typescript
class RtcClient {
  // Connects using a token the developer's OWN backend minted via POST /v1/tokens (§1.3) —
  // the SDK never holds an API secret and never talks to our REST API directly for anything
  // that requires one; it only ever receives an already-minted token from the host app.
  connect(token: string, options?: ConnectOptions): Promise<Room>;
}

interface ConnectOptions {
  autoSubscribe?: boolean; // default true — set false for a viewer that wants to pick tracks manually
  // Called proactively at ~80% of the token's TTL (§7.2) — the SDK cannot mint its own refresh,
  // it just tells the host app "time to ask your backend for a new one" and swaps it in on a
  // live connection without a reconnect, so a call never drops from expiry alone
  onTokenRefreshNeeded?: () => Promise<string>;
}

class Room extends EventEmitter<RoomEvents> {
  readonly localParticipant: LocalParticipant;
  readonly remoteParticipants: Map<string, RemoteParticipant>;
  readonly connectionState: ConnectionState; // 'connecting' | 'connected' | 'reconnecting' | 'reconnected' | 'disconnected'
  disconnect(): Promise<void>;
}

interface RoomEvents {
  connectionStateChanged(state: ConnectionState): void;      // surfaces LiveKit's own reconnect
                                                                // states as first-class, not a raw
                                                                // WebSocket close code (§7.2)
  participantConnected(p: RemoteParticipant): void;
  participantDisconnected(p: RemoteParticipant): void;
  trackSubscribed(track: RemoteTrack, p: RemoteParticipant): void;
  trackUnsubscribed(track: RemoteTrack, p: RemoteParticipant): void;
  activeSpeakersChanged(speakers: Participant[]): void;
  dataReceived(payload: Uint8Array, p?: RemoteParticipant): void;   // raw LiveKit data-channel passthrough
  aiTranscriptSegment(segment: AiTranscriptSegment): void;          // ← ours, not LiveKit's: parses the
                                                                      // AI agent's data-channel messages
                                                                      // (§1.6) into a typed event so every
                                                                      // app isn't reimplementing that parser
  aiAgentSpeakingChanged(isSpeaking: boolean): void;                // drives a "agent is speaking…" indicator
  disconnected(reason: DisconnectReason): void;
}

class LocalParticipant {
  enableCamera(enabled: boolean): Promise<void>;
  enableMicrophone(enabled: boolean): Promise<void>;
  startScreenShare(): Promise<void>;
  stopScreenShare(): Promise<void>;
  publishData(payload: Uint8Array, options?: { reliable?: boolean }): Promise<void>;

  // ← added: on-device media enhancements — see note below on why these never touch our backend
  setVirtualBackground(options: { type: 'blur' | 'image'; blurRadius?: number; imageUrl?: string } | null): Promise<void>;
  setNoiseSuppression(enabled: boolean): Promise<void>;
}
```

**Virtual background and noise suppression run entirely on-device, never through our infrastructure (added):** `setVirtualBackground`/`setNoiseSuppression` process the local camera/mic feed with client-side ML *before* the track is published — the SFU only ever sees the already-blurred, already-denoised result, same as any other published track. This is the same "we are the media plane, never the data plane" principle (§0) applied one level earlier than usual: we don't process raw video/audio for enhancement any more than we process it for anything else. Build these on top of an existing on-device segmentation/denoising model rather than training your own — the same "don't build what LiveKit/an established library already solved" discipline §0 already applies to not building your own SFU or TURN server. On Web, LiveKit's own `track-processors` package (WebAssembly-based segmentation) is the natural fit; each native platform wrapper (§7.1's table) uses that platform's own on-device ML framework (e.g. Apple's Vision framework on iOS, ML Kit on Android) behind the same two methods, so the app-facing API stays identical across platforms even though the underlying model differs.

**What's deliberately *not* on this class:** no `startRecording()`, no `dispatchAiAgent()`, no `createBroadcast()`. Recording (§1.4), AI agent dispatch (§1.6), and starting/stopping a broadcast (§1.7) are all server-to-server calls the *developer's own backend* makes against our REST API with `x-api-key`/`x-api-secret` — the client SDK only ever consumes the *result* of those (a track appears, a transcript event fires). Putting those controls on the client SDK would mean shipping a path to trigger billable actions from code an end user's device runs, which is exactly the kind of leaked-key abuse surface §3.7's `RoomQuotaGuard` exists to prevent — keep the trigger server-side, always.

**Broadcast viewers (§1.7)** use the exact same `Room` API — a viewer's token simply has `canPublish: false` (enforced server-side at token mint, not by the SDK trusting the client), so `LocalParticipant.enableCamera`/`enableMicrophone` reject locally without a round-trip. `HLS_CDN` mode isn't a LiveKit connection at all, so it gets a separate, much smaller helper instead of forcing it through `Room`:

```typescript
class HlsPlayer {
  constructor(playlistUrl: string); // BroadcastSession.hlsPlaylistUrl (§2), served from the developer's own CDN
  attach(videoElement: HTMLVideoElement): void;
}
```

**Typed errors, not raw HTTP/WebSocket failures:** connection failures surface the same error codes the backend already defines (§3.1's `invalid_key`/`project_suspended`/`insufficient_balance`, §3.7's `concurrent_room_limit_exceeded`) as a typed `RtcError.code`, not a bare status code — so a host app can show "your account is out of credit" versus "network issue" versus "this room is full" as genuinely different UI states instead of one generic "connection failed" toast.

**Cross-platform, same shape, idiomatic per platform** — one wrapper per LiveKit SDK it sits on, published through each ecosystem's normal channel, not a single cross-compiled blob:

| Platform | Package | Wraps | Idiom |
| --- | --- | --- | --- |
| Web | `@yourplatform/rtc-sdk` (npm) | `livekit-client` | Promises + `EventEmitter`, as above |
| iOS | `YourPlatformRTC` (SPM/CocoaPods) | LiveKit's Swift SDK | `async/await` + delegate protocol |
| Android | `com.yourplatform:rtc-sdk` (Maven) | `io.livekit:livekit-android` | Kotlin coroutines + `Flow` |
| React Native | `@yourplatform/rtc-sdk-react-native` (npm) | `@livekit/react-native` | Same TS interface as Web, native modules underneath |
| Flutter | `yourplatform_rtc` (pub.dev) | `livekit_client` | Dart `Stream`s in place of the event emitter |

Every wrapper's own version tracks *its* compatibility promise to host apps, independent of whatever LiveKit SDK version it happens to pin underneath — a LiveKit point-release bump is a patch version here, not a breaking one, precisely because the wrapper boundary from §7.1's opening rule is what absorbs that churn.

### 7.2 Token expiry & reconnection

- **Mid-call token expiry**: a token's TTL (§1.3, capped by `maxTokenTtlSeconds`) can expire while a call is still active. The SDK wrapper fires `ConnectOptions.onTokenRefreshNeeded` (§7.1) proactively at ~80% of TTL elapsed and swaps in whatever token that callback resolves to via LiveKit's own token-refresh mechanism — do not wait for a disconnect to discover the token expired; that's a dropped call, not a graceful refresh. The SDK itself never mints that replacement token (it has no secret to do so with) — the callback is the host app's own hook back to its backend's `POST /v1/tokens` call (§1.3).
- **Network blip reconnection**: LiveKit's client SDKs have built-in reconnect logic (`disconnected` → `reconnecting` → `reconnected` states), but your wrapper needs to surface these as first-class events to the developer's app (so their UI can show "Reconnecting…" instead of looking frozen) and needs a policy for **reconnect-with-same-identity**: if participant A's connection drops and comes back within a grace window (e.g. 15s), LiveKit should treat it as the same participant resuming, not a duplicate join — verify this against your LiveKit version's reconnection semantics and test it explicitly, since "does a rejoin within N seconds count as one session or two" directly affects billing accuracy (§3.5's idempotency logic).
- **Server-initiated disconnects**: if a project's wallet hits zero mid-call, don't cut the call instantly (a hard cutoff mid-sentence is a terrible experience and a support escalation) — grace-period the existing room to completion, block only *new* room creation, and let the low-balance webhook (§3.6) fire so the developer can react before the next call attempt fails.

### 7.3 Concurrency & abuse limits, concretely

The schema has `maxConcurrentRooms` per project (§2) — tie it to plan tier with real numbers, not an arbitrary default:

| Plan | Max concurrent rooms | Max participants/room | Max token TTL |
| --- | --- | --- | --- |
| Starter | 10 | 12 | 10 min |
| Growth | 100 | 50 | 30 min |
| Enterprise | negotiated | negotiated | negotiated |

Enforce both ceilings (§3.7's `RoomQuotaGuard` for room count; a LiveKit room-level participant cap set at room-creation time for the per-room limit) — an uncapped per-room participant count is a second, easily-missed avenue for the same abuse pattern the room-count limit is meant to prevent.

Each plan tier also carries its own per-minute rate card, not just these ceilings — see §4.9 for how `PlanRateCard`/`OrganizationRateOverride` (§2) resolve pricing, and how a project that keeps hitting its ceiling gets nudged toward an upgrade.

### 7.4 Observability & alerting (added — entirely absent from the original spec)

You will not hear about a media-node problem from your own monitoring unless you build one; you'll hear about it from a customer's support ticket, which is a much worse first signal.

- **Metrics**: LiveKit exposes Prometheus metrics natively (`/metrics` on its own port) — scrape SFU-level stats (active rooms, active tracks, packet loss, bitrate) alongside standard node metrics (CPU, NIC throughput — the actual bottleneck per §5.3) and Coturn's session/bandwidth counters. Grafana dashboards on top, not optional.
- **Alerting**: SLO-based alerts, not just "CPU > 90%" — e.g. "p95 room-join latency > 2s for 5 minutes," "webhook delivery success rate < 99% for 10 minutes," "any media node's NIC utilization > 80% of provisioned capacity" (a leading indicator you need to scale out *before* calls start degrading, per §5.3's throughput math). Alertmanager (Prometheus-native) or an open-source alternative to PagerDuty (e.g. Grafana OnCall) keeps this fully self-hosted, consistent with the "no paid third-party APIs" philosophy.
- **Structured logging**: correlate every log line across NestJS, LiveKit webhooks, and BullMQ jobs by `projectId` + `roomName` at minimum, shipped to a self-hosted Loki/ELK stack — debugging "why did this specific customer's call at 3pm yesterday have bad quality" is impossible without this correlation key threaded through every layer from day one.

### 7.5 Testing & rollout safety

- **Load-testing the media plane specifically**: functional tests (does a room join work) tell you nothing about whether a media node holds up at 80 concurrent rooms — use LiveKit's own load-testing tooling (`livekit-cli load-test`) against a staging media node to validate the throughput math in §5.3 empirically, on your actual instance type, before trusting the theoretical numbers in production capacity planning.
- **Staging environment parity**: staging needs its own LiveKit + Coturn deployment (not a shared dev instance) so load tests and integration tests don't contend with or corrupt production media-node state.
- **Webhook replay testing**: since LiveKit *can* redeliver webhooks (§3.5's idempotency handling), explicitly test double-delivery of `room_finished` in CI, not just the happy path — this is the exact bug class that causes a customer to be double-billed in production and only get noticed weeks later.

## 8. Rollout Roadmap & Capacity Cheat-Sheet (added)

### 8.1 Phased rollout

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0 — Foundations** | Auth, `Project`/API keys, LiveKit token service (incl. `role: HOST\|VIEWER` grants for basic `WEBRTC_SFU` broadcast, §1.7), single-node LiveKit + Coturn, sandbox environment | A developer can sign up, generate a sandbox key, complete a 2-person video call end-to-end, and put a `canPublish: false` viewer into a room alongside a publishing host |
| **1 — BYOS recording** | `StorageConfig` (all 3 providers) + egress dispatcher + canary-verify on save | A real recording lands in a real developer-owned bucket, verified live, not just in a demo |
| **1.5 — Live Broadcast at scale** | `BroadcastSession`/`RestreamDestination` (§2), `HLS_CDN` egress + RTMP Ingress + restream dispatch (§3.10), `/projects/[id]/broadcasts` portal config (§4.12) | A broadcast started in `HLS_CDN` mode produces a working HLS playlist on the developer's own CDN-fronted bucket, and at least one restream destination (e.g. YouTube) receives the same feed live — builds directly on Phase 1's egress dispatcher, which is why it sits here rather than earlier |
| **2 — BYOF chat/push** | Firebase config upload + verify, FCM push bridge for call signaling | Incoming-call push notification delivered via a developer's own Firebase project |
| **2.5 — AI Voice Agent (BYOK)** | `AiProviderConfig`/`AiAgentProfile` (§2), agent dispatcher + worker pool (§3.9), `/projects/[id]/ai-agent` portal config + verify (§4.11) | An agent joins a live room and holds a real-time voice conversation using the developer's own LLM/STT/TTS keys — this only needs Phase 0's token/room infrastructure, not Phase 3's wallet. `AiAgentSession` rows are still recorded with `billableSeconds`, but the actual wallet debit for agent-compute minutes only activates once Phase 3 ships; until then, treat agent usage as metered-but-unbilled (sandbox-style) rather than blocking the feature on billing being ready first |
| **3 — Billing & wallet** | `UsageLog` accrual, wallet deduction, top-up via a payment gateway, low-balance webhook, **admin panel: KYC queue + billing ops (§4.8)** | Usage from Phase 0's test calls accurately deducts from a real wallet balance, atomically, with no double-billing under webhook redelivery — and staff can actually approve a KYC submission and issue a refund, not just the customer-facing flows |
| **4 — Production hardening** | RBAC/`OrgMember`, IP allowlisting, key rotation grace window, `CredentialAccessLog`, outbound webhooks with HMAC + retry | Pass an internal security review using this blueprint's §6 as the checklist |
| **5 — Scale-out** | Multi-node LiveKit cluster, Coturn HA, MySQL replica, Prometheus/Grafana/Alertmanager, load-tested capacity numbers, **admin panel: media-node health + staff management (§4.8)** | Empirically validated concurrent-room ceiling per media node (§5.3, §7.5), not just the theoretical math |
| **6 — Enterprise-ready** | SOC2-readiness controls (§6.5), scoped API keys, negotiated enterprise plan tier, DPA published | First enterprise customer's security questionnaire answered without a single "we don't have that yet" |

Do not attempt Phase 4–6 concurrently with Phase 0–3 — the original spec's five sections read as if they're all equally first-priority, but billing correctness (Phase 3) and basic BYOS/BYOF (Phases 1–2) are what makes the product sellable at all; the hardening in Phases 4–6 is what makes it sellable to a buyer with a security team, which is a later and different customer segment.

### 8.2 Capacity & cost cheat-sheet

Rough, conservative planning numbers — validate against your actual cloud provider and instance type via the load-testing approach in §7.5 before committing to a launch capacity plan:

| Quantity | Conservative estimate | Source |
| --- | --- | --- |
| Bandwidth per video participant (pub+sub in a 10-person room) | \~15 Mbps aggregate | §5.3 |
| Concurrent 10-person video rooms per 1 Gbps media node | 60–80 | §5.3 |
| Fraction of B2B sessions needing TURN relay | 40–60% (not the 15–20% consumer figure) | §5.2 |
| Bandwidth multiplier for a relayed session vs. direct P2P | \~2× | §5.3 |
| Token TTL default / hard cap | 10 min / plan-dependent (§7.3) | §2, §7.3 |
| Redis cache TTL for API-key validation | 30s | §3.1 |
| Webhook delivery retry schedule | 6 attempts, exponential backoff from 5s | §3.6 |
| Egress temp-file TTL (zero-storage enforcement) | ≤ 2 minutes post-upload | §6.3 |
| Concurrent video viewers per 1 Gbps node, `WEBRTC_SFU` broadcast (linear, not N²) | Several hundred | §5.3, §1.7 |
| HLS segment duration / typical end-to-end latency, `HLS_CDN` broadcast | 4s segments / 3–10s | §1.7, §3.10 |

Note that `HLS_CDN`-mode viewer bandwidth doesn't belong in this table at all — it's the developer's own CDN bill, not your media-node capacity plan (§1.7).

Use this table as the starting point for your own infrastructure cost model (media-node instance-hours × expected concurrent room count × relay-rate-adjusted bandwidth), not as a substitute for measuring your actual workload once you have real usage data from Phase 0–1 customers.
