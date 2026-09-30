export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

export const LEGAL_UPDATED = '29 September 2026';

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: 'What this policy covers',
    paragraphs: [
      'This policy describes the personal data the Nexora control plane and its website handle: the developer console, the public website and the token, room and recording APIs. It does not cover the LiveKit, TURN, database or storage servers that you host yourself; you decide what those systems keep.',
    ],
  },
  {
    heading: 'Data we collect',
    items: [
      'Account data: name, work email, organisation name, a bcrypt hash of your password, team roles and invitations.',
      'Business and billing data you submit: legal business name, GSTIN, PAN, billing address, invoice email, and KYC document numbers. Document numbers are stored encrypted or masked.',
      'Payment records: Razorpay order and payment identifiers, amounts, status and GST invoices. Card, UPI and bank details are entered on Razorpay and never reach our servers.',
      'Usage records: for each production token, the project, room name, participant identity you supplied, timestamp, billable duration, rate and amount charged.',
      'Recording metadata: room, storage provider, bucket name, object key, duration, size and status. The recording file itself is written to your bucket.',
      'Audit records: staff actions on customer accounts and access to stored credentials, with the IP address of the request.',
      'Credentials you connect: storage keys and Firebase service accounts, stored with AES-256-GCM encryption.',
    ],
  },
  {
    heading: 'Data we do not collect',
    items: [
      'The audio and video of your calls. Media flows through the LiveKit servers you operate.',
      'The content of in-room chat and data-channel messages. They are not written to our database.',
      'Recording files. They go directly to the bucket you connected.',
    ],
  },
  {
    heading: 'Why we use it',
    items: [
      'To run your account, issue tokens, enforce plan limits and meter usage.',
      'To bill you, issue GST tax invoices and meet statutory record-keeping duties.',
      'To verify your business where KYC is required.',
      'To secure the service, investigate abuse and support you when you write to us.',
    ],
  },
  {
    heading: 'Cookies',
    paragraphs: [
      'The console uses one essential session cookie, set as HttpOnly and SameSite, that expires after 24 hours. We do not use advertising or cross-site tracking cookies. When you pay, the Razorpay checkout script runs in your browser under Razorpay’s own terms.',
    ],
  },
  {
    heading: 'Who else processes data',
    items: [
      'Razorpay, for payment processing.',
      'The email and SMS providers configured for notifications, which see the address or number they deliver to.',
      'Your own infrastructure and cloud accounts, for media and recordings.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'Account and usage records are kept while your account is active. Invoices and payment records are kept for as long as Indian tax and accounting rules require. You can ask us to delete account data that we are not legally required to keep.',
    ],
  },
  {
    heading: 'Your rights',
    paragraphs: [
      'You can ask to access, correct or erase your personal data, withdraw consent you have given, or raise a grievance, in line with the Digital Personal Data Protection Act, 2023 and other law that applies to you. Write to the contact address below and tell us which account you mean.',
    ],
  },
  {
    heading: 'Your responsibilities when you record people',
    paragraphs: [
      'If you use Nexora to record calls, you are the party deciding to record. You are responsible for telling participants and for having a lawful basis and consent where the law requires it.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: ['We will update the date at the top of this page when the policy changes. Material changes will also be announced in the console.'],
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: 'The service',
    paragraphs: [
      'Nexora provides a control plane for real-time audio, video, broadcast, messaging and recording built on LiveKit: API keys, room tokens, room and participant management, webhooks, a developer console and prepaid billing. You run the media servers that carry your traffic.',
    ],
  },
  {
    heading: 'Accounts and keys',
    items: [
      'You must give accurate business and contact details and keep them current.',
      'Project secrets are shown once. Keep them on your servers and rotate them if you suspect exposure.',
      'You are responsible for everything done with your keys and your team members’ accounts.',
    ],
  },
  {
    heading: 'Acceptable use',
    items: [
      'Do not use the service for unlawful content or activity, or to harass, defraud or endanger others.',
      'Do not probe, disrupt or access other customers’ projects, rooms or data.',
      'Do not bypass rate limits, plan limits or billing controls.',
      'Get the consent the law requires before recording anyone.',
    ],
  },
  {
    heading: 'Payment, wallet and taxes',
    items: [
      'Production usage is prepaid. You top up a wallet in rupees, and each production token deducts from it at your plan’s per-minute rate plus GST.',
      'If the wallet cannot cover a token, the request is rejected until you top up.',
      'Rates shown on the Pricing page can change; a change applies from the time it takes effect and does not alter past usage.',
      'Top-ups are credited to your wallet in full, GST is added to each session’s charge, and we issue GST tax invoices for each billing period. You are responsible for the accuracy of the GST details you provide.',
    ],
  },
  {
    heading: 'Your data and recordings',
    paragraphs: [
      'You own your content. Recordings are written to the storage bucket you connect, and you are responsible for that bucket’s security, retention and cost. Our handling of personal data is described in the Privacy Policy.',
    ],
  },
  {
    heading: 'Availability and support',
    paragraphs: [
      'We work to keep the control plane available but do not promise uninterrupted service unless a written agreement says so. Because you host the media servers, their availability is your responsibility.',
    ],
  },
  {
    heading: 'Suspension and termination',
    paragraphs: [
      'You can stop using the service at any time. We may suspend a project that breaks these terms, puts the service or other customers at risk, or has an unresolved payment issue, and will tell you why where we can.',
    ],
  },
  {
    heading: 'Liability',
    paragraphs: [
      'The service is provided as is. To the extent the law allows, we are not liable for indirect or consequential loss, or for loss caused by systems you operate, such as your media servers and storage.',
    ],
  },
  {
    heading: 'Changes and contact',
    paragraphs: ['We may update these terms and will change the date above when we do. Questions about them can be sent to the contact address below.'],
  },
];
