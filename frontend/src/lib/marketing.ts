export type Availability = 'live' | 'testing' | 'planned';

export interface ApiSurface {
  area: string;
  routes: string[];
  note: string;
  status: Availability;
}

export const API_SURFACE: ApiSurface[] = [
  {
    area: 'Room tokens',
    routes: ['POST /v1/tokens'],
    note: 'Your backend mints a short-lived token; the client joins the SFU directly. Restrict a listener to the microphone with canPublishSources.',
    status: 'live',
  },
  {
    area: 'Rooms and participants',
    routes: ['POST /v1/rooms', 'GET /v1/rooms/{room}/participants', 'DELETE …/participants/{id}', 'PATCH …/permissions'],
    note: 'Create, list and close rooms. Kick, mute, or promote a viewer to speaker mid-broadcast. Room names are scoped per project, so two customers can both use "standup".',
    status: 'live',
  },
  {
    area: 'Messaging',
    routes: ['POST /v1/rooms/{room}/messages'],
    note: 'Push a system message to everyone or to named identities. Peer chat rides the data channel; nothing is written to a database.',
    status: 'live',
  },
  {
    area: 'Recording',
    routes: ['POST …/recording/start', 'POST …/recording/stop', 'GET /v1/recordings'],
    note: 'Room composite egress uploads to the S3, R2 or GCS bucket you connected in the console. Status and duration arrive by signed webhook.',
    status: 'testing',
  },
  {
    area: 'Event webhooks',
    routes: ['room.finished', 'participant.joined', 'recording.completed'],
    note: 'HMAC-SHA256 signed, delivered to endpoints you register in the console.',
    status: 'live',
  },
  {
    area: 'RTMP restream and OBS ingest',
    routes: ['POST /v1/ingress'],
    note: 'Designed in the blueprint, not built yet.',
    status: 'planned',
  },
];

export const STATUS_LABEL: Record<Availability, string> = {
  live: 'Live',
  testing: 'In testing',
  planned: 'Planned',
};

export const STATUS_STYLE: Record<Availability, string> = {
  live: 'text-emerald-800 bg-emerald-50 border-emerald-200',
  testing: 'text-amber-800 bg-amber-50 border-amber-200',
  planned: 'text-muted bg-paper-deep border-line',
};

export const TOKEN_REQUEST = `curl -X POST $NEXORA_API/v1/tokens \\
  -H "x-api-key: pk_live_…" \\
  -H "x-api-secret: sk_live_…" \\
  -H "content-type: application/json" \\
  -d '{
    "roomName": "consult-2291",
    "participantIdentity": "patient_456",
    "grants": { "canPublish": true }
  }'`;

export const TOKEN_RESPONSE = `{
  "status": "success",
  "data": {
    "token": "eyJhbGciOi…",
    "ttlSeconds": 600,
    "livekitUrl": "wss://rtc.yourdomain.com:7880"
  }
}`;

export const SOCIAL_LABELS = { linkedin: 'LinkedIn', twitter: 'X', github: 'GitHub', youtube: 'YouTube' } as const;

export const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/security', label: 'Data & security' },
  { href: '/docs', label: 'Reference' },
  { href: '/contact', label: 'Contact' },
] as const;

export const FOOTER_GROUPS = [
  {
    heading: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/security', label: 'Data & security' },
    ],
  },
  {
    heading: 'Developers',
    links: [
      { href: '/docs', label: 'API reference' },
      { href: '/user/sandbox', label: 'Sandbox' },
      { href: '/login', label: 'Sign in' },
      { href: '/signup', label: 'Create an account' },
    ],
  },
] as const;

export interface Step { title: string; body: string }

export const HOW_IT_WORKS: Step[] = [
  {
    title: 'Your backend asks for a token',
    body: 'POST /v1/tokens with your project key and secret. The secret never ships in an app; the token lifetime defaults to 10 minutes.',
  },
  {
    title: 'The client joins your media server',
    body: 'The web, Android, iOS or Flutter app connects to your LiveKit node with that token. Audio, video and data channels go peer-to-server, not through Nexora.',
  },
  {
    title: 'You control the room from the server',
    body: 'Kick or mute a participant, promote a viewer to speaker, push a message, start a recording. Every call is scoped to your project.',
  },
  {
    title: 'Events come back signed',
    body: 'room.finished, participant.joined and recording.completed arrive at your endpoint with an HMAC-SHA256 signature you can verify.',
  },
];

export interface UseCase { name: string; detail: string; recipe: string }

export const USE_CASES: UseCase[] = [
  {
    name: 'Doctor and patient consults',
    detail: 'One-to-one video with an optional recording written to the clinic’s own bucket.',
    recipe: 'Video token for each side, recording/start when the consult begins, recording.completed to file the link.',
  },
  {
    name: 'Live classes and webinars',
    detail: 'A teacher publishes; students watch and can be promoted to speak for a question.',
    recipe: 'Host token with canPublish, audience tokens with canPublish false, PATCH permissions to raise a hand.',
  },
  {
    name: 'Support hotlines',
    detail: 'Audio-only calls that cannot turn a camera on, billed at the audio rate.',
    recipe: 'Token with canPublishSources ["microphone"]; the API bills it as an audio session.',
  },
  {
    name: 'In-app announcements',
    detail: 'Send a system message into a running room without a chat server.',
    recipe: 'POST /v1/rooms/{room}/messages to everyone or to named identities.',
  },
];

export interface FaqItem { q: string; a: string }

export const FAQ: FaqItem[] = [
  {
    q: 'Do I have to run LiveKit myself?',
    a: 'Yes. Nexora is the control plane: tokens, rooms, billing, webhooks and the console. You host LiveKit, Coturn and the egress worker; a Docker Compose file for all three is in the repository.',
  },
  {
    q: 'Where do recordings go?',
    a: 'Into the S3, R2 or GCS bucket you connect in the console. We store a metadata row (room, object key, duration, size, status), never the file.',
  },
  {
    q: 'Can a client app start a recording?',
    a: 'No. Recording, room deletion and permission changes are server-to-server calls with your project secret, so a leaked app build cannot trigger billable actions.',
  },
  {
    q: 'How does billing work?',
    a: 'Production projects draw from a prepaid rupee wallet at the per-minute rate for your plan. Each token reserves up to the first 10 minutes; if the wallet cannot cover it, the token request is rejected. Sandbox projects are not billed.',
  },
  {
    q: 'Is chat history stored?',
    a: 'No. Messages ride the LiveKit data channel and are not written to a database. If you need history, store it in your own system from the data events.',
  },
  {
    q: 'Which client SDKs do I use?',
    a: 'The official LiveKit SDKs for web, Android, iOS and Flutter. Nexora only issues the tokens they connect with; integration guides are in the API reference.',
  },
  {
    q: 'Are you SOC 2 or HIPAA certified?',
    a: 'No. We are working toward SOC 2 readiness and have not been audited. Talk to us before relying on Nexora for HIPAA or DPDP obligations.',
  },
];

export interface SdkTarget { platform: string; package: string; note: string }

export const CLIENT_SDKS: SdkTarget[] = [
  { platform: 'Web / React', package: 'livekit-client', note: 'Browser and React apps, including screen share.' },
  { platform: 'Android', package: 'io.livekit:livekit-android', note: 'Kotlin, camera and microphone permissions included in the guide.' },
  { platform: 'iOS', package: 'client-sdk-swift', note: 'Swift and SwiftUI, with a call-manager example.' },
  { platform: 'Flutter', package: 'livekit_client', note: 'One codebase for both mobile platforms.' },
];

export interface SecuritySection { title: string; points: string[] }

export const SECURITY_SECTIONS: SecuritySection[] = [
  {
    title: 'Credentials and secrets',
    points: [
      'Bucket keys are encrypted with AES-256-GCM and decrypted only when a recording starts.',
      'Project API secrets are stored as bcrypt hashes and shown once, at creation or rotation.',
      'Rotating a secret keeps the old one valid for a grace window so deployments do not break.',
      'The server refuses to start without its encryption key and LiveKit credentials; there are no built-in fallback secrets.',
    ],
  },
  {
    title: 'Isolation between customers',
    points: [
      'Room names are prefixed with the project id on the media server, so two projects can both use "standup".',
      'Every console and API call is scoped to the authenticated organisation or project.',
      'Staff-only operations sit behind a separate role check.',
    ],
  },
  {
    title: 'Sessions and abuse limits',
    points: [
      'Console sessions are signed JWTs in HttpOnly, SameSite cookies that expire after 24 hours.',
      'Login and signup are rate-limited per IP; all endpoints have a global request limit.',
      'A per-project ceiling on token lifetime and on rooms created through the API.',
    ],
  },
  {
    title: 'Webhooks and payments',
    points: [
      'Outbound events are signed with HMAC-SHA256 so your server can verify the sender.',
      'Payment webhooks are verified against the raw request body and are idempotent by payment id.',
      'Wallet deductions are atomic, so concurrent token requests cannot overdraw a balance.',
    ],
  },
];

export const CONSOLE_AREAS = [
  'Projects and API keys, with secret rotation',
  'Storage buckets: S3, Cloudflare R2, Google Cloud',
  'Outbound webhook endpoints and event filters',
  'Wallet top-ups, GST profile and invoices',
  'Team members and roles',
  'Business KYC submission',
  'Usage logs and recordings list',
  'Audit trail and support tickets',
  'Email and SMS alert preferences',
];

export const BILLING_FAQ: FaqItem[] = FAQ.filter((item) => item.q.startsWith('How does billing') || item.q.startsWith('Is chat') || item.q.startsWith('Are you SOC'));

export const rateFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
