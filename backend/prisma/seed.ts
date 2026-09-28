import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// AES-256-GCM helper matching CryptoService
function encrypt(text: string) {
  const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const masterKey = Buffer.from(masterKeyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag,
  };
}

async function seed() {
  console.log('--- STARTING COMPREHENSIVE PRODUCTION DB SEED ---');

  // 1. Clean existing records safely in order
  console.log('Cleaning existing demo data...');
  try {
    await prisma.ticketMessage.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.walletOfferRedemption.deleteMany();
    await prisma.walletOffer.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.usageLog.deleteMany();
    await prisma.recording.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.credentialAccessLog.deleteMany();
    await prisma.storageConfig.deleteMany();
    await prisma.billingProfile.deleteMany();
    await prisma.kycVerification.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.project.deleteMany();
    await prisma.orgMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  } catch (err: any) {
    console.warn('Initial cleanup note:', err.message);
  }

  // 2. Hash developer API secrets
  const salt = await bcrypt.genSalt(12);
  const secret1Hash = await bcrypt.hash('sk_live_enterprise_ultra_2026', salt);
  const secret2Hash = await bcrypt.hash('sk_live_fintech_secure_8819', salt);

  // 3. Create Organizations
  console.log('Creating Real Organizations...');
  const org1 = await prisma.organization.create({
    data: {
      name: 'Acme Cloud Communications Inc',
      billingEmail: 'billing@acme.com',
      walletBalance: 8450.00,
      planTier: 'ENTERPRISE',
      autoRechargeEnabled: true,
      autoRechargeThreshold: 1000.0,
      autoRechargeAmount: 5000.0,
      rateOverrides: {
        create: [
          {
            roomType: 'VIDEO_CALL',
            ratePerMinute: 0.0030,
            reason: 'Enterprise volume contract discount',
          },
        ],
      },
    },
  });

  const org2 = await prisma.organization.create({
    data: {
      name: 'TeleMed Health Technologies',
      billingEmail: 'finance@telemedhealth.in',
      walletBalance: 3200.50,
      planTier: 'GROWTH',
      autoRechargeEnabled: false,
    },
  });

  const org3 = await prisma.organization.create({
    data: {
      name: 'Nexora Demo Org',
      billingEmail: 'founder@nexora.io',
      walletBalance: 1500.00,
      planTier: 'STARTER',
    },
  });

  // 4. Create Users & Memberships
  console.log('Creating Users & Roles...');
  const adminUser = await prisma.user.create({
    data: {
      name: 'Chief Architect',
      email: 'admin@nexora.io',
      phone: '+919876543210',
      mfaEnabled: true,
      mfaSecret: process.env.DEFAULT_2FA_FALLBACK_SECRET || 'NXRA7729837190',
      memberships: {
        create: [
          { organizationId: org3.id, role: 'OWNER' },
          { organizationId: org1.id, role: 'ADMIN' },
        ],
      },
    },
  });

  const devUser = await prisma.user.create({
    data: {
      name: 'Lead WebRTC Engineer',
      email: 'founder@nexora.io',
      phone: '+919811223344',
      memberships: {
        create: [
          { organizationId: org1.id, role: 'DEVELOPER' },
          { organizationId: org2.id, role: 'OWNER' },
        ],
      },
    },
  });

  // 5. Create Billing Profiles (GSTIN, PAN, Address)
  console.log('Creating Indian GST Billing Profiles...');
  await prisma.billingProfile.create({
    data: {
      organizationId: org1.id,
      legalBusinessName: 'Acme Cloud Communications Private Limited',
      gstin: '27AAACA9928F1Z4',
      panNumber: 'AAACA9928F',
      billingAddressLine1: 'Tower 4, World Trade Centre, Cuffe Parade',
      city: 'Mumbai',
      placeOfSupplyStateCode: '27 - Maharashtra',
      pincode: '400005',
      invoiceEmail: 'finance@acme.com',
      gstinSourcedFromKyc: true,
    },
  });

  await prisma.billingProfile.create({
    data: {
      organizationId: org2.id,
      legalBusinessName: 'TeleMed Healthcare Solutions LLP',
      gstin: '29ABCDE1234F1Z5',
      panNumber: 'ABCDE1234F',
      billingAddressLine1: '42, Cyber Hub, Outer Ring Road, Bellandur',
      city: 'Bengaluru',
      placeOfSupplyStateCode: '29 - Karnataka',
      pincode: '560103',
      invoiceEmail: 'accounts@telemedhealth.in',
      gstinSourcedFromKyc: true,
    },
  });

  // 6. Create Projects
  console.log('Creating WebRTC Projects...');
  const proj1 = await prisma.project.create({
    data: {
      organizationId: org1.id,
      name: 'Global Video Telehealth Mesh',
      environment: 'PRODUCTION',
      apiKeyPrefix: 'pk_live_acme_telehealth_99',
      apiSecretHash: secret1Hash,
      ipAllowlist: ['203.0.113.19', '198.51.100.4'],
      maxConcurrentRooms: 100,
      maxTokenTtlSeconds: 3600,
    },
  });

  const proj2 = await prisma.project.create({
    data: {
      organizationId: org2.id,
      name: 'Interactive Virtual Classroom',
      environment: 'PRODUCTION',
      apiKeyPrefix: 'pk_live_telemed_edu_44',
      apiSecretHash: secret2Hash,
      ipAllowlist: ['103.21.244.0/24'],
      maxConcurrentRooms: 50,
      maxTokenTtlSeconds: 1800,
    },
  });

  const proj3 = await prisma.project.create({
    data: {
      organizationId: org3.id,
      name: 'Developer Sandbox App',
      environment: 'SANDBOX',
      apiKeyPrefix: 'pk_test_nexora_sandbox',
      apiSecretHash: secret1Hash,
      maxConcurrentRooms: 10,
      maxTokenTtlSeconds: 600,
    },
  });

  // 7. Create BYOS Storage Configs (Zero-storage architecture)
  console.log('Creating Customer BYOS Storage configurations...');
  const encS3 = encrypt('AKIA_PROD_DEMO_KEY_9921');
  await prisma.storageConfig.create({
    data: {
      projectId: proj1.id,
      provider: 'AWS_S3',
      label: 'aws-s3-primary',
      bucketName: 'acme-telehealth-recordings-ap-south-1',
      region: 'ap-south-1',
      encryptedAccessKey: encS3.ciphertext,
      encryptedSecretKey: encS3.ciphertext,
      encryptionIv: encS3.iv,
      encryptionAuthTag: encS3.authTag,
      lastVerifiedAt: new Date(),
    },
  });

  // 8. Create KYC Verification records with encrypted documents
  console.log('Creating Encrypted KYC Records...');
  const encPan = encrypt('AAACA9928F');
  await prisma.kycVerification.create({
    data: {
      organizationId: org1.id,
      documentType: 'PAN',
      encryptedDocumentNumber: encPan.ciphertext,
      encryptionIv: encPan.iv,
      encryptionAuthTag: encPan.authTag,
      status: 'VERIFIED',
      verifiedViaDigiLocker: true,
      reviewedByStaffId: 'staff_master_admin',
      reviewedAt: new Date(),
      submittedAt: new Date(),
    },
  });

  const encGstin = encrypt('29ABCDE1234F1Z5');
  await prisma.kycVerification.create({
    data: {
      organizationId: org2.id,
      documentType: 'GSTIN',
      encryptedDocumentNumber: encGstin.ciphertext,
      encryptionIv: encGstin.iv,
      encryptionAuthTag: encGstin.authTag,
      status: 'PENDING_REVIEW',
      submittedAt: new Date(),
    },
  });

  // 9. Create Transactions (Wallet topups & history)
  console.log('Creating Wallet Ledger Transactions...');
  await prisma.transaction.create({
    data: {
      organizationId: org1.id,
      type: 'WALLET_TOPUP',
      amount: 10000.0,
      status: 'SUCCESS',
      gatewayPaymentId: 'pay_rzp_live_9921820491',
      webhookVerified: true,
      createdAt: new Date(Date.now() - 5 * 86400 * 1000),
    },
  });

  await prisma.transaction.create({
    data: {
      organizationId: org2.id,
      type: 'WALLET_TOPUP',
      amount: 5000.0,
      status: 'SUCCESS',
      gatewayPaymentId: 'pay_rzp_live_8849201940',
      webhookVerified: true,
      createdAt: new Date(Date.now() - 2 * 86400 * 1000),
    },
  });

  await prisma.transaction.create({
    data: {
      organizationId: org3.id,
      type: 'WALLET_TOPUP',
      amount: 1500.0,
      status: 'SUCCESS',
      gatewayPaymentId: 'pay_rzp_mock_init_500',
      webhookVerified: true,
      createdAt: new Date(),
    },
  });

  // 10. Create Real Invoices with SAC 998314 and 18% GST Breakdown
  console.log('Creating SAC 998314 Compliant GST Invoices...');
  await prisma.invoice.create({
    data: {
      organizationId: org1.id,
      invoiceNumber: 'NXRA-2026-00101',
      periodStart: new Date(Date.now() - 30 * 86400 * 1000),
      periodEnd: new Date(),
      subtotal: 5000.0,
      cgstAmount: 450.0,
      sgstAmount: 450.0,
      igstAmount: 0.0,
      totalAmount: 5900.0,
      sacCode: '998314',
      billingSnapshot: {
        callMinutes: 16666,
        ratePerMinute: 0.0030,
        currency: 'INR',
      },
    },
  });

  await prisma.invoice.create({
    data: {
      organizationId: org2.id,
      invoiceNumber: 'NXRA-2026-00102',
      periodStart: new Date(Date.now() - 30 * 86400 * 1000),
      periodEnd: new Date(),
      subtotal: 2500.0,
      cgstAmount: 0.0,
      sgstAmount: 0.0,
      igstAmount: 450.0,
      totalAmount: 2950.0,
      sacCode: '998314',
      billingSnapshot: {
        callMinutes: 7142,
        ratePerMinute: 0.0035,
        currency: 'INR',
      },
    },
  });

  // 11. Create Promotional Wallet Offers & Coupons
  console.log('Creating Promo Offers & Coupons...');
  await prisma.walletOffer.create({
    data: {
      title: 'Diwali Cloud Launch 25% Extra Credit',
      minRechargeAmount: 1000.0,
      bonusType: 'PERCENTAGE',
      bonusValue: 25.0,
      maxBonusAmount: 2500.0,
      perOrgLimit: 1,
      totalRedemptionCap: 500,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 60 * 86400 * 1000),
      createdByStaffId: 'staff_master_admin',
      isActive: true,
    },
  });

  await prisma.walletOffer.create({
    data: {
      title: 'Startup Welcome Bonus ₹500 Flat',
      minRechargeAmount: 500.0,
      bonusType: 'FIXED_AMOUNT',
      bonusValue: 500.0,
      perOrgLimit: 1,
      totalRedemptionCap: 1000,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 90 * 86400 * 1000),
      createdByStaffId: 'staff_master_admin',
      isActive: true,
    },
  });

  // 12. Create Support Tickets with Threaded Messages
  console.log('Creating Support Tickets & Messages...');
  const ticket1 = await prisma.supportTicket.create({
    data: {
      organizationId: org1.id,
      ticketNumber: 'TICK-9021',
      subject: 'Assistance setting up AWS S3 Cross-Region BYOS replication',
      category: 'API_INTEGRATION',
      priority: 'HIGH',
      status: 'OPEN',
      messages: {
        create: [
          {
            sender: 'developer:billing@acme.com',
            content: 'Hello team, we configured our AWS S3 bucket for recording storage but want to confirm KMS key permissions for livekit egress.',
          },
        ],
      },
    },
  });

  await prisma.supportTicket.create({
    data: {
      organizationId: org2.id,
      ticketNumber: 'TICK-8840',
      subject: 'GST Invoice Input Tax Credit (ITC) query for Karnataka POS',
      category: 'BILLING_WALLET',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      messages: {
        create: [
          {
            sender: 'developer:finance@telemedhealth.in',
            content: 'Can you please verify if IGST was applied on our latest invoice NXRA-2026-00102?',
          },
          {
            sender: 'support:staff_agent',
            content: 'Hi Team, yes! Since our billing entity is in Maharashtra (27) and your company GSTIN is Karnataka (29), 18% IGST is applied for full ITC claim.',
          },
        ],
      },
    },
  });

  // 13. Create Realistic Usage Logs & Audit Records
  console.log('Creating Real-time WebRTC Usage Logs & Audit Trails...');
  await prisma.usageLog.create({
    data: {
      projectId: proj1.id,
      roomName: 'doctor-consult-room-991',
      roomType: 'VIDEO_CALL',
      participantIdentity: 'patient_mumbai_01',
      startedAt: new Date(Date.now() - 40 * 60 * 1000),
      endedAt: new Date(Date.now() - 10 * 60 * 1000),
      billableSeconds: 1800,
      ratePerMinute: 0.0035,
      amountDeducted: 0.105,
    },
  });

  await prisma.credentialAccessLog.create({
    data: {
      targetType: 'PROJECT_API_SECRET',
      targetId: proj1.id,
      actor: 'staff_master_admin',
      purpose: 'System Audit Check for SOC2 Type II compliance',
      ipAddress: '127.0.0.1',
    },
  });

  console.log('\n======================================================');
  console.log('🎉 COMPREHENSIVE PRODUCTION DB SEED COMPLETE!');
  console.log('======================================================');
  console.log(`✓ Organizations : 3 (Enterprise, Growth, Starter)`);
  console.log(`✓ Live Projects : 3 (with custom IP Allowlist & Secrets)`);
  console.log(`✓ GST Profiles  : Full B2B GSTIN & Address details`);
  console.log(`✓ KYC Records   : 1 Verified, 1 Pending Review`);
  console.log(`✓ Ledger Data   : Invoices, Transactions, Topups & GST`);
  console.log(`✓ Support Desk  : Threaded Tickets & Staff Replies`);
  console.log(`✓ Active Offers : Percentage bonus & Flat coupons`);
  console.log('======================================================\n');
}

seed()
  .catch((e) => {
    console.error('Seed execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
