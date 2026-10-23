export type Availability = 'live' | 'testing' | 'planned';

export interface ApiSurface {
  area: string;
  routes: string[];
  note: string;
  status: Availability;
}

export const API_SURFACE: ApiSurface[] = [
  {
    area: 'Passes to join a call',
    routes: ['POST /v1/tokens'],
    note: 'Your server asks for a short-lived pass; the app uses it to join your media server. You can limit someone to voice only.',
    status: 'live',
  },
  {
    area: 'Rooms and the people in them',
    routes: ['/v1/rooms', '…/participants', '…/permissions'],
    note: 'Open and close rooms, see who’s there, mute or remove someone, let a viewer speak. Two customers can both call a room “standup” without clashing.',
    status: 'live',
  },
  {
    area: 'Messages into a call',
    routes: ['POST /v1/rooms/{room}/messages'],
    note: 'Send a note to everyone in a room, or to named people. Chat between people stays inside the call and isn’t saved.',
    status: 'live',
  },
  {
    area: 'Signed updates to your server',
    routes: ['room.finished', 'participant.joined', 'recording.completed'],
    note: 'We tell you when someone joins, a room ends or a recording is ready. If your server is down we try again after 1 minute, 5, 30 and 2 hours.',
    status: 'live',
  },
  {
    area: 'Recording',
    routes: ['POST …/recording/start', 'POST …/recording/stop', 'GET /v1/recordings'],
    note: 'Start and stop recording a room; the file is uploaded to your S3, R2 or Google Cloud bucket. You can use it now; we’re still testing it.',
    status: 'testing',
  },
  {
    area: 'Streaming in from OBS, restreaming out over RTMP',
    routes: ['POST /v1/ingress'],
    note: 'Designed, not built yet. We’ll say so here when it is.',
    status: 'planned',
  },
];

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
  { href: '/features', label: 'What it does' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/security', label: 'Your data' },
  { href: '/docs', label: 'Docs' },
  { href: '/contact', label: 'Contact' },
] as const;

export const FOOTER_GROUPS = [
  {
    heading: 'Product',
    links: [
      { href: '/features', label: 'What it does' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/security', label: 'Your data' },
    ],
  },
  {
    heading: 'Developers',
    links: [
      { href: '/docs', label: 'Docs' },
      { href: '/user/sandbox', label: 'Sandbox' },
      { href: '/login', label: 'Log in' },
      { href: '/signup', label: 'Start free' },
    ],
  },
] as const;

export interface Step { title: string; body: string }

export const HOW_IT_WORKS: Step[] = [
  {
    title: 'Your app asks your server for a pass.',
    body: 'Your server asks Nexora, using a secret key that never leaves it. The pass is good for ten minutes.',
  },
  {
    title: 'The phone or browser joins your media server.',
    body: 'Sound and video go there directly. They never pass through us.',
  },
  {
    title: 'You stay in charge of the room.',
    body: 'Mute someone, remove them, let a viewer speak, send a message, start recording.',
  },
  {
    title: 'We tell you when things happen.',
    body: 'Someone joined, the room ended, the recording is ready. Each message is signed so you know it came from us.',
  },
];

export interface UseCase { name: string; detail: string; image: ImageSlotKey }

export const USE_CASES: UseCase[] = [
  {
    name: 'Clinics',
    detail: 'One doctor, one patient, one private room. If the consult is recorded, the file goes straight to the clinic’s own storage.',
    image: 'useClinic',
  },
  {
    name: 'Classrooms and webinars',
    detail: 'The teacher speaks, students watch. When someone raises a hand, you let them talk for a moment, then put them back.',
    image: 'useClassroom',
  },
  {
    name: 'Support lines',
    detail: 'Voice-only calls where nobody can switch a camera on by accident, charged at the cheaper audio rate.',
    image: 'useSupport',
  },
];

export interface CallKind { name: string; detail: string; image: ImageSlotKey }

export const CALL_KINDS: CallKind[] = [
  { name: 'Video call', detail: 'Camera, mic and screen sharing. Charged at the video rate.', image: 'kindVideo' },
  { name: 'Voice call', detail: 'Microphone only; the camera can’t be switched on. Charged at the audio rate.', image: 'kindVoice' },
  {
    name: 'Broadcast',
    detail: 'One host talks, everyone else watches; any viewer can be invited to speak. Charged at the broadcast rate.',
    image: 'kindBroadcast',
  },
];

export interface FaqItem { q: string; a: string }

export const FAQ: FaqItem[] = [
  {
    q: 'Do I need to run my own media server?',
    a: 'Yes. You run LiveKit, Coturn and the recording worker, and there’s a ready-made Docker Compose file for all three. Nexora handles the passes, rooms, billing and dashboard.',
  },
  {
    q: 'Where do recordings end up?',
    a: 'In the S3, R2 or Google Cloud bucket you connect. We only keep a note that the file exists, never the file itself.',
  },
  {
    q: 'Could someone start a recording from a hacked app?',
    a: 'No. Recording, closing rooms and changing permissions can only be done from your server with your secret key.',
  },
  {
    q: 'Is chat saved?',
    a: 'No. Messages travel inside the call and aren’t written down anywhere. If you need a history, save it on your side.',
  },
];

export const BILLING_FAQ: FaqItem[] = [
  {
    q: 'What happens if my wallet runs low?',
    a: 'Each new pass sets aside up to the first 10 minutes. If the wallet can’t cover that, the pass is refused, so you never end up owing money. Sandbox projects are never charged.',
  },
  {
    q: 'Do you store chat?',
    a: 'No. Messages travel inside the call and aren’t written down.',
  },
  {
    q: 'Are you SOC 2 or HIPAA certified?',
    a: 'Not yet. We’re working toward SOC 2 and haven’t been audited. If you need HIPAA or DPDP, talk to us first.',
  },
];

export const CLIENT_PLATFORMS = ['Web and React', 'Android', 'iPhone and iPad', 'Flutter'];

export interface SecuritySection { title: string; points: string[] }

export const SECURITY_SECTIONS: SecuritySection[] = [
  {
    title: 'Keys and passwords',
    points: [
      'Project secrets are stored as bcrypt hashes and shown to you once.',
      'When you swap a secret, the old one keeps working for a short while so nothing breaks.',
      'The server won’t start at all without its encryption key and LiveKit credentials.',
    ],
  },
  {
    title: 'Keeping customers apart',
    points: [
      'Every room name is tagged with its project on the media server.',
      'Every request is checked against the organisation or project that made it.',
      'Staff-only tools sit behind a separate role check.',
    ],
  },
  {
    title: 'Logins and limits',
    points: [
      'Dashboard sessions use secure, HttpOnly cookies that expire after 24 hours.',
      'Login and sign-up are rate-limited; so is every endpoint.',
      'Each project has caps on pass lifetime and on rooms created through the API.',
    ],
  },
  {
    title: 'Updates and payments',
    points: [
      'Every update we send is signed (HMAC-SHA256) so your server can check it’s really us.',
      'Payment notifications are verified and only ever counted once.',
      'Wallet charges can’t overlap, so two calls at once can’t overdraw your balance.',
    ],
  },
];

/**
 * Photo slots on the public pages. `src` is a file in public/ (e.g. '/images/home-hero.jpg'); to use your
 * own photo, replace that file or point `src` at a new one, and update `alt` to describe it. An empty `src`
 * shows a labelled placeholder built from `hint`. Current photos are free stock under the Unsplash License
 * (commercial use allowed, no attribution required); `source` records where each came from.
 */
export interface ImageSlotSpec { src: string; alt: string; hint: string; source: string }

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}`;

export const SITE_IMAGES = {
  homeHero: {
    src: '/images/home-hero.jpg',
    alt: 'A doctor talking with a patient over a video call on a laptop',
    hint: 'a doctor on a video consult with a patient',
    source: unsplash('1758691461932-d0aa0ebf6b31'),
  },
  useClinic: {
    src: '/images/use-clinic.jpg',
    alt: 'A doctor in a clinic consulting a patient over a laptop video call',
    hint: 'clinic consult',
    source: unsplash('1758691462743-f9fc9e430d39'),
  },
  useClassroom: {
    src: '/images/use-classroom.jpg',
    alt: 'A teacher working on a laptop in front of a chalkboard',
    hint: 'teacher running a live class',
    source: unsplash('1758685848174-e061c6486651'),
  },
  useSupport: {
    src: '/images/use-support.jpg',
    alt: 'Support agents wearing headsets at their desks',
    hint: 'support agent on a headset',
    source: unsplash('1626863905121-3b0c0ed7b94c'),
  },
  homeTeam: {
    src: '/images/home-team.jpg',
    alt: 'A small team gathered around a laptop in an office',
    hint: 'the team, or a customer’s office',
    source: unsplash('1572021335469-31706a17aaef'),
  },
  featuresHero: {
    src: '/images/features-hero.jpg',
    alt: 'A developer testing an app on a phone next to a laptop',
    hint: 'developer testing a call on phone and laptop',
    source: unsplash('1563986768609-322da13575f3'),
  },
  kindVideo: {
    src: '/images/kind-video.jpg',
    alt: 'A woman waving during a video call on her laptop',
    hint: 'two people on video',
    source: unsplash('1758521541324-d304c5303fe5'),
  },
  kindVoice: {
    src: '/images/kind-voice.jpg',
    alt: 'A woman smiling while talking on her phone',
    hint: 'voice call on a phone',
    source: unsplash('1758876201450-cf77ab8b95bc'),
  },
  kindBroadcast: {
    src: '/images/kind-broadcast.jpg',
    alt: 'An audience watching a speaker on a large bright screen',
    hint: 'one speaker, many viewers',
    source: unsplash('1627931539006-d5c4677e05ea'),
  },
  securityHero: {
    src: '/images/security-hero.jpg',
    alt: 'A server rack with rows of green status lights',
    hint: 'your own servers',
    source: unsplash('1762163516269-3c143e04175c'),
  },
  contactHero: {
    src: '/images/contact-hero.jpg',
    alt: 'A smiling support agent wearing a headset at her computer',
    hint: 'someone from the support team',
    source: unsplash('1766066014237-00645c74e9c6'),
  },
  signIn: {
    src: '/images/sign-in.jpg',
    alt: 'A woman on a phone call at her laptop in a bright room',
    hint: 'someone on a call in a bright office',
    source: unsplash('1758611974917-f7f7a58b74b0'),
  },
  signUp: {
    src: '/images/sign-up.jpg',
    alt: 'A small team trying something out together on a laptop',
    hint: 'a small team trying their first call',
    source: unsplash('1603201667141-5a2d4c673378'),
  },
} satisfies Record<string, ImageSlotSpec>;

export type ImageSlotKey = keyof typeof SITE_IMAGES;

export const rateFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const inrFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
