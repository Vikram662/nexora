import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import {
  DEFAULT_BILLING,
  DEFAULT_BRAND,
  DEFAULT_CONTACT,
  DEFAULT_PLANS,
  DEFAULT_SOCIAL,
  SiteSettingsService,
} from '../src/settings/site-settings.service.js';
import { InvoiceService } from '../src/invoicing/invoice.service.js';
import { monthRange } from '../src/invoicing/invoice-math.js';

/**
 * Demo data for every table, so each screen of the app has something to show.
 * WARNING: this WIPES all tables first. It refuses to run in production unless SEED_ALLOW_PRODUCTION=true.
 * Nothing sensitive is committed: passwords and API secrets are generated per run and printed once.
 */

const prisma = new PrismaClient();
const DAY = 86400 * 1000;

// Deterministic pseudo-random numbers, so re-seeding gives the same usage pattern every time.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function masterKey(): Buffer {
  const hex = process.env.ENCRYPTION_MASTER_KEY;
  if (!hex || Buffer.from(hex, 'hex').length !== 32) {
    throw new Error('Set ENCRYPTION_MASTER_KEY (64 hex characters) in backend/.env before seeding. Seeded secrets are encrypted with it.');
  }
  return Buffer.from(hex, 'hex');
}

// AES-256-GCM, same format as CryptoService
function encrypt(text: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  return { ciphertext, iv: iv.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

async function wipeAllTables() {
  const tables = Prisma.dmmf.datamodel.models.map((m) => m.dbName ?? m.name);
  await prisma.$transaction([
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0'),
    ...tables.map((t) => prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``)),
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1'),
  ]);
}

async function seed() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new Error('Refusing to wipe and seed a production database. Set SEED_ALLOW_PRODUCTION=true if you really mean it.');
  }
  masterKey();

  console.log('--- SEEDING DEMO DATA (all tables) ---');
  console.log('Wiping existing rows...');
  await wipeAllTables();

  const salt = await bcrypt.genSalt(12);
  const password = process.env.SEED_STAFF_PASSWORD || crypto.randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(password, salt);
  const secrets = [1, 2, 3].map(() => `sk_test_${crypto.randomBytes(16).toString('hex')}`);
  const secretHashes = await Promise.all(secrets.map((s) => bcrypt.hash(s, salt)));

  // ---------- Site settings (contact, brand, billing, plans) ----------
  console.log('Site settings and rate cards...');
  const settings: Record<string, unknown> = {
    contact: {
      ...DEFAULT_CONTACT,
      companyName: 'Nexora Demo Pvt Ltd',
      email: 'hello@nexora.example',
      phone: '+91 00000 00000',
      address: '1 Demo Street, Bandra Kurla Complex, Mumbai 400051',
      supportHours: 'Mon to Sat, 10:00 to 19:00 IST',
    },
    brand: { ...DEFAULT_BRAND, tagline: 'Calls, broadcasts and recordings on a media server you host.' },
    social: { ...DEFAULT_SOCIAL },
    // Demo seller identity for invoices. Replace it with your real details in Admin, Settings, Tax invoice details.
    billing: {
      ...DEFAULT_BILLING,
      supplierLegalName: 'Nexora Demo Private Limited',
      supplierGstin: '27AAPFU0939F1ZV',
      supplierStateCode: '27',
      supplierAddress: '1 Demo Street, Bandra Kurla Complex, Mumbai 400051',
    },
    plans: DEFAULT_PLANS,
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.siteSetting.create({ data: { key, value: value as Prisma.InputJsonValue } });
  }

  const baseRates: Record<string, Record<string, number>> = {
    STARTER: { AUDIO_CALL: 0.0025, VIDEO_CALL: 0.0035, LIVE_BROADCAST: 0.0015 },
    GROWTH: { AUDIO_CALL: 0.002, VIDEO_CALL: 0.003, LIVE_BROADCAST: 0.001 },
    ENTERPRISE: { AUDIO_CALL: 0.0015, VIDEO_CALL: 0.0025, LIVE_BROADCAST: 0.0008 },
  };
  const rateEffectiveFrom = new Date(Date.now() - 400 * DAY);
  await prisma.planRateCard.createMany({
    data: Object.entries(baseRates).flatMap(([planTier, byType]) =>
      Object.entries(byType).map(([roomType, ratePerMinute]) => ({
        planTier: planTier as never,
        roomType: roomType as never,
        ratePerMinute,
        effectiveFrom: rateEffectiveFrom,
      })),
    ),
  });

  // ---------- Staff ----------
  console.log('Staff...');
  const staffRoles = [
    ['superadmin@nexora.io', 'SUPER_ADMIN'],
    ['support@nexora.io', 'SUPPORT'],
    ['billing@nexora.io', 'BILLING_OPS'],
    ['kyc@nexora.io', 'KYC_REVIEWER'],
    ['security@nexora.io', 'SECURITY_ADMIN'],
  ] as const;
  const staff: Record<string, { id: string }> = {};
  for (const [email, role] of staffRoles) {
    staff[role] = await prisma.staffUser.create({
      data: {
        email,
        passwordHash,
        mfaSecret: crypto.randomBytes(10).toString('hex').toUpperCase(),
        role,
        isActive: true,
        lastLoginAt: new Date(Date.now() - DAY),
      },
    });
  }

  // ---------- Organizations ----------
  console.log('Organizations...');
  const staffOpsOrgId = process.env.STAFF_OPS_ORG_ID || 'org_nexora_master_ops';
  await prisma.organization.create({
    data: {
      id: staffOpsOrgId,
      name: 'Nexora Platform Operations',
      billingEmail: 'superadmin@nexora.io',
      planTier: 'ENTERPRISE',
      walletBalance: 0,
    },
  });
  const org1 = await prisma.organization.create({
    data: {
      name: 'Acme Cloud Communications Inc',
      billingEmail: 'billing@acme.com',
      walletBalance: 8450.0,
      planTier: 'ENTERPRISE',
      autoRechargeEnabled: true,
      autoRechargeThreshold: 1000.0,
      autoRechargeAmount: 5000.0,
      rateOverrides: { create: [{ roomType: 'VIDEO_CALL', ratePerMinute: 0.003, reason: 'Enterprise volume contract discount' }] },
    },
  });
  const org2 = await prisma.organization.create({
    data: { name: 'TeleMed Health Technologies', billingEmail: 'finance@telemedhealth.in', walletBalance: 3200.5, planTier: 'GROWTH' },
  });
  const org3 = await prisma.organization.create({
    data: { name: 'Nexora Demo Org', billingEmail: 'founder@nexora.io', walletBalance: 1500.0, planTier: 'STARTER' },
  });
  const orgs = [org1, org2, org3];

  // ---------- Users and memberships ----------
  console.log('Users, memberships and OTP records...');
  const mk = (name: string, email: string, phone: string, memberships: { organizationId: string; role: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'BILLING' }[], mfa = false) =>
    prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        mfaEnabled: mfa,
        mfaSecret: mfa ? crypto.randomBytes(10).toString('hex').toUpperCase() : null,
        memberships: { create: memberships.map((m) => ({ ...m, acceptedAt: new Date(Date.now() - 30 * DAY) })) },
      },
    });
  const acmeOwner = await mk('Riya Kapoor', 'owner@acme.com', '+910000000001', [{ organizationId: org1.id, role: 'OWNER' }], true);
  const acmeBilling = await mk('Sameer Joshi', 'billing@acme.com', '+910000000002', [{ organizationId: org1.id, role: 'BILLING' }]);
  const founder = await mk('Lead WebRTC Engineer', 'founder@nexora.io', '+910000000003', [
    { organizationId: org1.id, role: 'DEVELOPER' },
    { organizationId: org2.id, role: 'OWNER' },
  ]);
  const admin = await mk('Chief Architect', 'admin@nexora.io', '+910000000004', [
    { organizationId: org3.id, role: 'OWNER' },
    { organizationId: org1.id, role: 'ADMIN' },
  ], true);

  await prisma.otpVerification.createMany({
    data: [
      { userId: admin.id, channel: 'EMAIL', destination: admin.email, purpose: 'LOGIN', codeHash: await bcrypt.hash(crypto.randomInt(100000, 999999).toString(), 8), attempts: 1, expiresAt: new Date(Date.now() - DAY + 600000), consumedAt: new Date(Date.now() - DAY) },
      { userId: null, channel: 'PHONE', destination: '+910000000099', purpose: 'SIGNUP', codeHash: await bcrypt.hash(crypto.randomInt(100000, 999999).toString(), 8), expiresAt: new Date(Date.now() + 600000) },
    ],
  });

  // ---------- Billing profiles and KYC ----------
  console.log('Billing profiles and KYC...');
  await prisma.billingProfile.createMany({
    data: [
      { organizationId: org1.id, legalBusinessName: 'Acme Cloud Communications Private Limited', gstin: '27AAACA9928F1Z4', panNumber: 'AAACA9928F', billingAddressLine1: 'Tower 4, World Trade Centre, Cuffe Parade', city: 'Mumbai', placeOfSupplyStateCode: '27', pincode: '400005', invoiceEmail: 'finance@acme.com', gstinSourcedFromKyc: true },
      { organizationId: org2.id, legalBusinessName: 'TeleMed Healthcare Solutions LLP', gstin: '29ABCDE1234F1Z5', panNumber: 'ABCDE1234F', billingAddressLine1: '42, Cyber Hub, Outer Ring Road, Bellandur', city: 'Bengaluru', placeOfSupplyStateCode: '29', pincode: '560103', invoiceEmail: 'accounts@telemedhealth.in', gstinSourcedFromKyc: true },
    ],
  });
  const kyc = (organizationId: string, documentType: 'PAN' | 'GSTIN', number: string, extra: Record<string, unknown>) => {
    const enc = encrypt(number);
    return prisma.kycVerification.create({
      data: { organizationId, documentType, encryptedDocumentNumber: enc.ciphertext, encryptionIv: enc.iv, encryptionAuthTag: enc.authTag, submittedAt: new Date(Date.now() - 20 * DAY), ...extra } as never,
    });
  };
  await kyc(org1.id, 'PAN', 'AAACA9928F', { status: 'VERIFIED', verifiedViaDigiLocker: true, reviewedByStaffId: staff.KYC_REVIEWER.id, reviewedAt: new Date(Date.now() - 19 * DAY) });
  await kyc(org2.id, 'GSTIN', '29ABCDE1234F1Z5', { status: 'PENDING_REVIEW' });
  await kyc(org3.id, 'PAN', 'ZZZZZ0000Z', { status: 'REJECTED', reviewedByStaffId: staff.KYC_REVIEWER.id, reviewedAt: new Date(Date.now() - 3 * DAY), rejectionReason: 'The PAN document was unreadable. Upload a clear scan.' });

  // ---------- Projects and integrations ----------
  console.log('Projects, storage, Firebase, AI and webhooks...');
  const proj1 = await prisma.project.create({ data: { organizationId: org1.id, name: 'Global Video Telehealth Mesh', environment: 'PRODUCTION', apiKeyPrefix: 'pk_test_seed_acme_telehealth', apiSecretHash: secretHashes[0], ipAllowlist: ['203.0.113.19', '198.51.100.4'], maxConcurrentRooms: 100, maxTokenTtlSeconds: 3600 } });
  const proj2 = await prisma.project.create({ data: { organizationId: org2.id, name: 'Interactive Virtual Classroom', environment: 'PRODUCTION', apiKeyPrefix: 'pk_test_seed_telemed_edu', apiSecretHash: secretHashes[1], ipAllowlist: ['103.21.244.0/24'], maxConcurrentRooms: 50, maxTokenTtlSeconds: 1800 } });
  const proj3 = await prisma.project.create({ data: { organizationId: org3.id, name: 'Developer Sandbox App', environment: 'SANDBOX', apiKeyPrefix: 'pk_test_seed_nexora_sandbox', apiSecretHash: secretHashes[2], maxConcurrentRooms: 10, maxTokenTtlSeconds: 600 } });

  const s3 = encrypt(JSON.stringify({ accessKey: 'DEMO_ACCESS_KEY_NOT_REAL', secretKey: 'demo-secret-not-real' }));
  const gcs = encrypt(JSON.stringify({ accessKey: 'GCS_SERVICE_ACCOUNT', secretKey: '{"type":"service_account","project_id":"demo-project"}' }));
  await prisma.storageConfig.createMany({
    data: [
      { projectId: proj1.id, provider: 'AWS_S3', label: 'aws-s3-primary', isDefault: true, bucketName: 'acme-telehealth-recordings-ap-south-1', region: 'ap-south-1', encryptedAccessKey: s3.ciphertext, encryptedSecretKey: s3.ciphertext, encryptionIv: s3.iv, encryptionAuthTag: s3.authTag, lastVerifiedAt: new Date() },
      { projectId: proj2.id, provider: 'GOOGLE_CLOUD', label: 'gcs-primary', isDefault: true, bucketName: 'telemed-classroom-archive', region: 'asia-south1', encryptedAccessKey: gcs.ciphertext, encryptedSecretKey: gcs.ciphertext, encryptionIv: gcs.iv, encryptionAuthTag: gcs.authTag, lastVerifiedAt: new Date() },
    ],
  });

  const fb = encrypt('{"type":"service_account","project_id":"acme-demo","client_email":"demo@acme-demo.iam.gserviceaccount.com"}');
  await prisma.firebaseConfig.create({ data: { projectId: proj1.id, firebaseProjectId: 'acme-demo', encryptedServiceAccountJson: fb.ciphertext, encryptionIv: fb.iv, encryptionAuthTag: fb.authTag, lastVerifiedAt: new Date() } });

  const aiKey = () => encrypt('demo-not-a-real-api-key');
  for (const [providerType, vendor, modelName] of [['LLM', 'OPENAI', 'gpt-4o-mini'], ['STT', 'DEEPGRAM', 'nova-2'], ['TTS', 'ELEVENLABS', 'eleven_turbo_v2']] as const) {
    const k = aiKey();
    await prisma.aiProviderConfig.create({ data: { projectId: proj1.id, providerType, vendor, modelName, encryptedApiKey: k.ciphertext, encryptionIv: k.iv, encryptionAuthTag: k.authTag, lastVerifiedAt: new Date() } });
  }
  const agent = await prisma.aiAgentProfile.create({ data: { projectId: proj1.id, name: 'Appointment desk', systemPrompt: 'You help patients book, move or cancel appointments. Keep answers short and confirm the date and time back.', greetingText: 'Hello, how can I help with your appointment today?', language: 'en-IN' } });
  await prisma.aiAgentSession.create({ data: { projectId: proj1.id, agentProfileId: agent.id, roomName: 'ai-desk-room-12', startedAt: new Date(Date.now() - 2 * DAY), endedAt: new Date(Date.now() - 2 * DAY + 240000), billableSeconds: 240, ratePerMinute: 0.006, amountDeducted: 0.024, endReason: 'caller_hangup' } });

  const broadcast = await prisma.broadcastSession.create({ data: { projectId: proj2.id, roomName: 'physics-live-lecture', hostIdentity: 'teacher_01', deliveryMode: 'HLS_CDN', hlsPlaylistUrl: 'https://cdn.example.com/live/physics/index.m3u8', peakViewerCount: 214, startedAt: new Date(Date.now() - 3 * DAY), endedAt: new Date(Date.now() - 3 * DAY + 3600000) } });
  const rtmp = encrypt('rtmp://live.example.com/app/demo-stream-key');
  await prisma.restreamDestination.create({ data: { broadcastSessionId: broadcast.id, label: 'YouTube Live', encryptedRtmpUrl: rtmp.ciphertext, encryptionIv: rtmp.iv, encryptionAuthTag: rtmp.authTag, status: 'ENDED' } });

  await prisma.recording.createMany({
    data: [
      { projectId: proj1.id, roomName: 'doctor-consult-room-991', livekitEgressId: 'EG_seed_0001', storageProvider: 'AWS_S3', bucketName: 'acme-telehealth-recordings-ap-south-1', objectKey: 'recordings/doctor-consult-room-991.mp4', durationSeconds: 1800, fileSizeBytes: BigInt(142_000_000), status: 'COMPLETED', startedAt: new Date(Date.now() - 2 * DAY), completedAt: new Date(Date.now() - 2 * DAY + 1860000) },
      { projectId: proj2.id, roomName: 'physics-live-lecture', livekitEgressId: 'EG_seed_0002', storageProvider: 'GOOGLE_CLOUD', bucketName: 'telemed-classroom-archive', objectKey: 'lectures/physics-live-lecture.mp4', status: 'FAILED', failureReason: 'The bucket rejected the upload: permission denied.', startedAt: new Date(Date.now() - 3 * DAY) },
    ],
  });

  const endpoint = await prisma.webhookEndpoint.create({ data: { projectId: proj1.id, url: 'https://hooks.example.com/nexora', signingSecret: `whsec_${crypto.randomBytes(24).toString('hex')}`, events: ['room.started', 'room.finished', 'participant.joined', 'participant.left', 'recording.completed'] } });
  await prisma.webhookDelivery.createMany({
    data: [
      { endpointId: endpoint.id, eventType: 'room.started', payload: { roomName: 'doctor-consult-room-991' }, responseCode: 200, succeeded: true },
      { endpointId: endpoint.id, eventType: 'recording.completed', payload: { roomName: 'doctor-consult-room-991' }, attempt: 2, responseCode: 500, succeeded: false, nextRetryAt: new Date(Date.now() + 3600000) },
    ],
  });

  // ---------- Usage: last full month for the invoice run, plus this month ----------
  console.log('Usage logs...');
  const now = new Date();
  const prev = monthRange(now.getUTCFullYear(), now.getUTCMonth() - 1);
  const overrideVideo: Record<string, number> = { [org1.id]: 0.003 };
  const gst = 1.18;
  const rateWithGst = (org: { id: string; planTier: string }, roomType: string) =>
    round4((overrideVideo[org.id] && roomType === 'VIDEO_CALL' ? overrideVideo[org.id] : baseRates[org.planTier][roomType]) * gst);

  const rand = rng(20260101);
  const roomTypes = ['VIDEO_CALL', 'VIDEO_CALL', 'VIDEO_CALL', 'AUDIO_CALL', 'LIVE_BROADCAST'];
  const usage: Prisma.UsageLogCreateManyInput[] = [];
  const addSessions = (project: { id: string }, org: { id: string; planTier: string }, count: number, from: Date, spanMs: number) => {
    for (let i = 0; i < count; i++) {
      const roomType = roomTypes[Math.floor(rand() * roomTypes.length)];
      const minutes = 2 + Math.floor(rand() * 44);
      const startedAt = new Date(from.getTime() + Math.floor(rand() * (spanMs - 3600000)));
      const rate = rateWithGst(org, roomType);
      usage.push({
        projectId: project.id,
        roomName: `room-${1000 + Math.floor(rand() * 9000)}`,
        roomType: roomType as never,
        participantIdentity: `user_${Math.floor(rand() * 900 + 100)}`,
        startedAt,
        endedAt: new Date(startedAt.getTime() + minutes * 60000),
        billableSeconds: minutes * 60,
        ratePerMinute: rate,
        amountDeducted: round4(minutes * rate),
      });
    }
  };
  const prevSpan = prev.end.getTime() - prev.start.getTime();
  addSessions(proj1, org1, 90, prev.start, prevSpan);
  addSessions(proj2, org2, 60, prev.start, prevSpan);
  const thisMonthStart = monthRange(now.getUTCFullYear(), now.getUTCMonth()).start;
  const thisSpan = Math.max(now.getTime() - thisMonthStart.getTime(), 4 * 3600000);
  addSessions(proj1, org1, 12, thisMonthStart, thisSpan);
  addSessions(proj2, org2, 8, thisMonthStart, thisSpan);
  usage.push({ projectId: proj1.id, roomName: 'live-consult-now', roomType: 'VIDEO_CALL', participantIdentity: 'patient_live_01', startedAt: new Date(now.getTime() - 5 * 60000), billableSeconds: 600, ratePerMinute: rateWithGst(org1, 'VIDEO_CALL'), amountDeducted: round4(10 * rateWithGst(org1, 'VIDEO_CALL')) });
  await prisma.usageLog.createMany({ data: usage });

  // ---------- Wallet ledger, offers ----------
  console.log('Transactions, offers and redemptions...');
  const tx = (organizationId: string, type: string, amount: number, daysAgo: number, extra: Record<string, unknown> = {}) =>
    prisma.transaction.create({ data: { organizationId, type: type as never, amount, status: 'SUCCESS', webhookVerified: true, createdAt: new Date(Date.now() - daysAgo * DAY), ...extra } as never });
  const topup1 = await tx(org1.id, 'WALLET_TOPUP', 10000, 25, { gatewayPaymentId: 'pay_seed_0001', gatewayOrderId: 'order_seed_0001', balanceAfter: 10000 });
  await tx(org1.id, 'AUTO_RECHARGE', 5000, 12, { gatewayPaymentId: 'pay_seed_0004', gatewayOrderId: 'order_seed_0004', balanceAfter: 8450 });
  await tx(org1.id, 'USAGE_DEDUCTION', 6550, 1, { balanceAfter: 8450 });
  await tx(org2.id, 'WALLET_TOPUP', 5000, 10, { gatewayPaymentId: 'pay_seed_0002', gatewayOrderId: 'order_seed_0002', balanceAfter: 5000 });
  const bonusTx = await tx(org2.id, 'PROMOTIONAL_CREDIT', 500, 10, { balanceAfter: 5500 });
  await tx(org2.id, 'MANUAL_ADJUSTMENT', -250, 4, { balanceAfter: 3200.5 });
  await tx(org3.id, 'WALLET_TOPUP', 1500, 1, { gatewayPaymentId: 'pay_seed_0003', gatewayOrderId: 'order_seed_0003', balanceAfter: 1500 });
  await tx(org3.id, 'WALLET_TOPUP', 800, 2, { gatewayPaymentId: 'pay_seed_0005', status: 'FAILED', webhookVerified: false });
  await tx(org1.id, 'REFUND', 200, 6, { gatewayRefundId: 'rfnd_seed_0001', originalTransactionId: topup1.id, balanceAfter: 9800 });

  const validFrom = new Date(Date.now() - 5 * DAY);
  await prisma.walletOffer.create({ data: { title: 'Launch offer: 25% extra credit', minRechargeAmount: 1000, bonusType: 'PERCENTAGE', bonusValue: 25, maxBonusAmount: 2500, perOrgLimit: 1, totalRedemptionCap: 500, validFrom, validUntil: new Date(Date.now() + 60 * DAY), createdByStaffId: staff.BILLING_OPS.id } });
  const welcome = await prisma.walletOffer.create({ data: { title: 'Startup welcome bonus, Rs 500 flat', minRechargeAmount: 500, bonusType: 'FIXED_AMOUNT', bonusValue: 500, perOrgLimit: 1, totalRedemptionCap: 1000, validFrom, validUntil: new Date(Date.now() + 90 * DAY), createdByStaffId: staff.BILLING_OPS.id } });
  await prisma.walletOfferRedemption.create({ data: { offerId: welcome.id, organizationId: org2.id, transactionId: bonusTx.id, bonusAmount: 500 } });

  // ---------- Tax invoices: generated by the real invoice service ----------
  console.log('Generating GST tax invoices for the previous month...');
  const invoicing = new InvoiceService(prisma as never, new SiteSettingsService(prisma as never));
  // A month closes 24 hours after it ends; if the seed runs inside that window, issue the invoice just after it.
  const issueAt = new Date(Math.max(now.getTime(), prev.end.getTime() + DAY + 60000));
  const run = await invoicing.generateForPeriod(prev.start, prev.end, issueAt);
  console.log(`  ${run.created} invoice(s) created, ${run.skipped.length} skipped`);

  // ---------- Notifications ----------
  console.log('Notifications, tickets and audit trails...');
  await prisma.notificationPreference.createMany({
    data: [
      { organizationId: org1.id, emailEnabled: true, smsEnabled: true, criticalOnlyViaSms: true },
      { organizationId: org2.id, emailEnabled: true, smsEnabled: false, criticalOnlyViaSms: true },
      { organizationId: org3.id, emailEnabled: true, smsEnabled: false, criticalOnlyViaSms: true },
    ],
  });
  await prisma.notificationLog.createMany({
    data: [
      { organizationId: org1.id, type: 'WELCOME', channel: 'EMAIL', destination: 'billing@acme.com', status: 'SENT', providerRef: 'msg_seed_1' },
      { organizationId: org1.id, type: 'KYC_APPROVED', channel: 'EMAIL', destination: 'billing@acme.com', status: 'SENT', providerRef: 'msg_seed_2' },
      { organizationId: org1.id, type: 'INVOICE_GENERATED', channel: 'EMAIL', destination: 'finance@acme.com', status: 'SENT', providerRef: 'msg_seed_3' },
      { organizationId: org2.id, type: 'PAYMENT_RECEIVED', channel: 'EMAIL', destination: 'finance@telemedhealth.in', status: 'SENT', providerRef: 'msg_seed_4' },
      { organizationId: org2.id, type: 'LOW_BALANCE', channel: 'EMAIL', destination: 'finance@telemedhealth.in', status: 'QUEUED' },
      { organizationId: org3.id, type: 'KYC_REJECTED', channel: 'EMAIL', destination: 'founder@nexora.io', status: 'FAILED', errorReason: 'Mailbox unavailable' },
    ],
  });

  const ticket = (organizationId: string, ticketNumber: string, subject: string, category: string, priority: string, status: string, messages: { sender: string; content: string }[]) =>
    prisma.supportTicket.create({ data: { organizationId, ticketNumber, subject, category: category as never, priority: priority as never, status: status as never, messages: { create: messages } } });
  await ticket(org1.id, 'TICK-9021', 'Help with S3 cross-region recording replication', 'API_INTEGRATION', 'HIGH', 'OPEN', [
    { sender: 'developer:billing@acme.com', content: 'We set up the S3 bucket for recordings and want to confirm the KMS key permissions for egress.' },
  ]);
  await ticket(org2.id, 'TICK-8840', 'GST input tax credit query for Karnataka', 'BILLING_WALLET', 'MEDIUM', 'IN_PROGRESS', [
    { sender: 'developer:finance@telemedhealth.in', content: 'Can you confirm IGST was applied on our latest invoice?' },
    { sender: 'support:support@nexora.io', content: 'Yes. Our registered state is Maharashtra (27) and your GSTIN is in Karnataka (29), so 18% IGST applies and is claimable as input credit.' },
  ]);
  await ticket(org3.id, 'TICK-8712', 'Choppy video in the sandbox on mobile data', 'MEDIA_QUALITY', 'LOW', 'RESOLVED', [
    { sender: 'developer:founder@nexora.io', content: 'Video freezes every few seconds on 4G.' },
    { sender: 'support:support@nexora.io', content: 'Enable TURN over TCP 443 in your client config. That fixed similar carrier issues.' },
  ]);

  await prisma.auditLog.createMany({
    data: [
      { organizationId: org1.id, actorUserId: acmeOwner.id, action: 'project.created', targetType: 'project', targetId: proj1.id, ip: '203.0.113.19', metadata: { environment: 'PRODUCTION' } },
      { organizationId: org1.id, actorUserId: admin.id, action: 'project.secret_rotated', targetType: 'project', targetId: proj1.id, ip: '203.0.113.19', metadata: { graceWindowHours: 24 } },
      { organizationId: org2.id, actorUserId: founder.id, action: 'project.ip_allowlist_updated', targetType: 'project', targetId: proj2.id, ip: '103.21.244.8', metadata: { entries: 1 } },
      { organizationId: org1.id, actorUserId: acmeBilling.id, action: 'billing.profile_updated', targetType: 'organization', targetId: org1.id, ip: '203.0.113.20' },
    ],
  });
  await prisma.adminActionLog.createMany({
    data: [
      { staffUserId: staff.KYC_REVIEWER.id, action: 'REVIEW_KYC', targetType: 'KycVerification', targetId: org1.id, reason: 'Documents match', ipAddress: '127.0.0.1' },
      { staffUserId: staff.BILLING_OPS.id, action: 'CREATE_OFFER', targetType: 'WalletOffer', targetId: welcome.id, ipAddress: '127.0.0.1' },
      { staffUserId: staff.SUPER_ADMIN.id, action: 'UPDATE_SITE_SETTINGS', targetType: 'SiteSetting', targetId: 'billing', ipAddress: '127.0.0.1' },
      { staffUserId: staff.BILLING_OPS.id, action: 'GENERATE_INVOICES', targetType: 'Invoice', targetId: `${prev.start.getUTCFullYear()}-${String(prev.start.getUTCMonth() + 1).padStart(2, '0')}`, ipAddress: '127.0.0.1' },
    ],
  });
  await prisma.credentialAccessLog.create({ data: { targetType: 'PROJECT_API_SECRET', targetId: proj1.id, actor: staff.SECURITY_ADMIN.id, purpose: 'Quarterly access review', ipAddress: '127.0.0.1' } });

  // ---------- Report ----------
  console.log('\nRows per table:');
  let empty = 0;
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = (prisma as never as Record<string, { count: () => Promise<number> }>)[model.name.charAt(0).toLowerCase() + model.name.slice(1)];
    const count = await delegate.count();
    if (count === 0) empty++;
    console.log(`  ${count === 0 ? '!' : ' '} ${model.name.padEnd(26)} ${count}`);
  }
  console.log(empty === 0 ? '\nEvery table has data.' : `\n${empty} table(s) are empty, see the rows marked "!".`);

  console.log('\n======================================================');
  console.log('Shown once, not stored anywhere:');
  console.log(`  Login password for all staff and demo users: ${password}`);
  console.log(`  Project secrets: acme ${secrets[0]}`);
  console.log(`                   telemed ${secrets[1]}`);
  console.log(`                   sandbox ${secrets[2]}`);
  console.log('Staff logins: superadmin@nexora.io, support@nexora.io, billing@nexora.io, kyc@nexora.io, security@nexora.io');
  console.log('User logins:  owner@acme.com, billing@acme.com, founder@nexora.io, admin@nexora.io');
  console.log('Invoices use a DEMO seller GSTIN. Set your real details in Admin, Settings, Tax invoice details.');
  console.log('======================================================\n');
}

seed()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
