export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined' && window.location) {
    return `http://${window.location.hostname}:4000`;
  }
  return 'http://127.0.0.1:4000';
}

// Ensure API_BASE_URL dynamically always returns the current host in browser
const API_BASE_URL = typeof window !== 'undefined' ? `http://${window.location.hostname}:4000` : (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000');




export interface StorageConfig {
  id: string;
  provider: 'AWS_S3' | 'CLOUDFLARE_R2' | 'GOOGLE_CLOUD';
  bucketName: string;
  region?: string;
  endpoint?: string;
  lastVerifiedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  apiKeyPrefix: string;
  apiSecretHash: string;
  apiSecretRolledAt: string;
  previousSecretExpiresAt?: string;
  maxConcurrentRooms: number;
  maxTokenTtlSeconds: number;
  storageConfigs: StorageConfig[];
  createdAt: string;
}

export interface KycVerificationData {
  id: string;
  documentType: 'PAN' | 'AADHAAR' | 'GSTIN' | 'COMPANY_CIN';
  status: 'NOT_STARTED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
  verifiedViaDigiLocker: boolean;
  reviewedAt?: string;
  submittedAt?: string;
  maskedDocumentNumber?: string;
}

export interface OrganizationData {
  id: string;
  name: string;
  walletBalance: string;
  planTier: string;
  billingEmail: string;
  projects: Project[];
  transactions: any[];
  kycVerification?: KycVerificationData | null;
  billingProfile?: any | null;
}

export async function fetchOrganizationData(): Promise<OrganizationData> {
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/v1/portal/organization`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch organization');
    const json = await res.json();
    return json.data;
  } catch (err: any) {
    console.warn('Backend organization fetch warning, using starter state:', err?.message);
    return {
      id: 'default_org',
      name: 'Nexora Demo Org',
      walletBalance: '1500.00',
      planTier: 'STARTER',
      billingEmail: 'founder@nexora.io',
      projects: [
        {
          id: 'proj_default_sandbox',
          name: 'Developer Sandbox App',
          environment: 'SANDBOX',
          apiKeyPrefix: 'pk_test_nexora_sandbox',
          apiSecretHash: '••••••••',
          apiSecretRolledAt: new Date().toISOString(),
          maxConcurrentRooms: 25,
          maxTokenTtlSeconds: 600,
          storageConfigs: [],
          createdAt: new Date().toISOString(),
        },
      ],
      transactions: [],
      kycVerification: null,
      billingProfile: null,
    };
  }
}


export async function createNewProject(name: string, environment: 'SANDBOX' | 'PRODUCTION'): Promise<{ project: Project; rawSecret: string }> {
  const res = await fetch(`${API_BASE_URL}/v1/portal/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, environment }),
  });
  if (!res.ok) throw new Error('Failed to create project');
  const json = await res.json();
  return json.data;
}

export async function rotateProjectSecret(projectId: string): Promise<{ newSecret: string; graceWindowExpiresAt: string }> {
  const res = await fetch(`${API_BASE_URL}/v1/portal/projects/${projectId}/rotate-secret`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to rotate secret');
  const json = await res.json();
  return json.data;
}

export async function topupWalletBalance(amount: number): Promise<{ newBalance: string }> {
  const res = await fetch(`${API_BASE_URL}/v1/portal/wallet/topup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error('Failed to top up wallet');
  const json = await res.json();
  return json.data;
}

export async function saveStorage(
  projectId: string,
  data: {
    provider: 'AWS_S3' | 'CLOUDFLARE_R2' | 'GOOGLE_CLOUD';
    bucketName: string;
    region?: string;
    endpoint?: string;
    accessKey?: string;
    secretKey?: string;
    gcsServiceAccountJson?: string;
  }
) {
  const res = await fetch(`${API_BASE_URL}/v1/portal/projects/${projectId}/storage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save storage configuration');
  return res.json();
}

export async function saveFirebase(projectId: string, data: { firebaseProjectId: string; serviceAccountJson: string }) {
  const res = await fetch(`${API_BASE_URL}/v1/portal/projects/${projectId}/firebase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save Firebase configuration');
  return res.json();
}

export async function addWebhookEndpoint(projectId: string, data: { url: string; events: string[] }) {
  const res = await fetch(`${API_BASE_URL}/v1/portal/projects/${projectId}/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add webhook endpoint');
  return res.json();
}

export async function submitKycVerification(data: {
  documentType: string;
  documentNumber: string;
  digilockerOtp?: string;
}) {
  const res = await fetch(`${API_BASE_URL}/v1/portal/kyc/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to submit KYC');
  }
  return res.json();
}

export async function fetchTeamMembers() {
  const res = await fetch(`${API_BASE_URL}/v1/portal/team`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch team');
  const json = await res.json();
  return json.data;
}

export async function inviteMember(email: string, role: string) {
  const res = await fetch(`${API_BASE_URL}/v1/portal/team/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) throw new Error('Failed to invite member');
  return res.json();
}

export async function fetchUsageAndRecordings() {
  const res = await fetch(`${API_BASE_URL}/v1/portal/usage`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch usage');
  const json = await res.json();
  return json.data;
}

export async function fetchAuditLogs() {
  const res = await fetch(`${API_BASE_URL}/v1/portal/audit-log`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch audit log');
  const json = await res.json();
  return json.data;
}

export async function fetchSupportTickets() {
  const res = await fetch(`${API_BASE_URL}/v1/portal/tickets`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch tickets');
  const json = await res.json();
  return json.data;
}

export async function createSupportTicket(data: {
  subject: string;
  category: string;
  priority: string;
  message: string;
}) {
  const res = await fetch(`${API_BASE_URL}/v1/portal/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create ticket');
  return res.json();
}

export async function createPaymentOrder(amount: number) {
  const res = await fetch(`${API_BASE_URL}/v1/portal/payments/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error('Failed to create payment order');
  return res.json();
}

export async function verifyPayment(data: {
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  amount?: number;
}) {
  const res = await fetch(`${API_BASE_URL}/v1/portal/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to verify payment');
  return res.json();
}

export async function topupWalletDirect(amount: number) {
  const res = await fetch(`${API_BASE_URL}/v1/portal/wallet/topup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw new Error('Failed to top up wallet');
  return res.json();
}


export async function fetchNotificationPreferences() {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/portal/notifications/preferences`, { cache: 'no-store' });
    if (!res.ok) return { emailEnabled: true, smsEnabled: false, criticalOnlyViaSms: true };
    const json = await res.json();
    return json.data || { emailEnabled: true, smsEnabled: false, criticalOnlyViaSms: true };
  } catch (e) {
    return { emailEnabled: true, smsEnabled: false, criticalOnlyViaSms: true };
  }
}

export async function updateNotificationPreferences(data: {
  emailEnabled: boolean;
  smsEnabled: boolean;
  criticalOnlyViaSms: boolean;
}) {
  const res = await fetch(`${API_BASE_URL}/v1/portal/notifications/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update notification preferences');
  return res.json();
}

export async function mintRtcToken(params: {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  participantIdentity: string;
  canPublish?: boolean;
}) {
  const url = `${getApiBaseUrl()}/v1/tokens`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {

      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'x-api-secret': params.apiSecret,
    },
    body: JSON.stringify({
      roomName: params.roomName,
      participantIdentity: params.participantIdentity,
      grants: {
        canPublish: params.canPublish ?? true,
        canSubscribe: true,
        canPublishData: true,
      },
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to mint LiveKit token');
  }

  return res.json();
}

// ==========================================
// MASTER ADMIN / OPS CONSOLE API CALLS
// ==========================================

export async function fetchAdminOverview() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/overview`);
  if (!res.ok) throw new Error('Failed to load admin overview metrics');
  const json = await res.json();
  return json.data;
}

export async function fetchAdminKycList() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/kyc`);
  if (!res.ok) throw new Error('Failed to load KYC verification list');
  const json = await res.json();
  return json.data;
}

export async function reviewAdminKyc(id: string, action: 'APPROVE' | 'REJECT', reason?: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/kyc/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reason }),
  });
  if (!res.ok) throw new Error('Failed to review KYC submission');
  return res.json();
}

export async function fetchAdminOrganizations() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/organizations`);
  if (!res.ok) throw new Error('Failed to load organizations list');
  const json = await res.json();
  return json.data;
}

export async function adjustOrgBalance(id: string, amount: number, reason: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/organizations/${id}/adjust-balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, reason }),
  });
  if (!res.ok) throw new Error('Failed to adjust organization balance');
  return res.json();
}

export async function fetchAdminTickets() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/tickets`);
  if (!res.ok) throw new Error('Failed to load support tickets');
  const json = await res.json();
  return json.data;
}

export async function replyAdminTicket(id: string, message: string, status?: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/tickets/${id}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, status }),
  });
  if (!res.ok) throw new Error('Failed to reply to ticket');
  return res.json();
}

export async function fetch2faSetup() {
  const fallbackSecret = process.env.NEXT_PUBLIC_DEFAULT_2FA_SECRET || '';
  const issuer = process.env.NEXT_PUBLIC_MFA_ISSUER || '';
  try {
    const res = await fetch(`${getApiBaseUrl()}/v1/portal/profile/2fa/setup`);
    if (!res.ok) {
      return {
        enabled: false,
        secret: fallbackSecret,
        otpauthUrl: fallbackSecret ? `otpauth://totp/${encodeURIComponent(issuer)}:developer@company.com?secret=${fallbackSecret}&issuer=${encodeURIComponent(issuer)}` : '',
      };
    }
    const json = await res.json();
    return json.data;
  } catch (_) {
    return {
      enabled: false,
      secret: fallbackSecret,
      otpauthUrl: fallbackSecret ? `otpauth://totp/${encodeURIComponent(issuer)}:developer@company.com?secret=${fallbackSecret}&issuer=${encodeURIComponent(issuer)}` : '',
    };
  }
}

export async function verifyAndToggle2fa(code: string, enable: boolean) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/profile/2fa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, enable }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update 2FA status');
  }
  return res.json();
}

export async function fetchAdminBillingOverview() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/billing/overview`);
  if (!res.ok) throw new Error('Failed to fetch admin billing overview');
  return res.json();
}

export async function fetchAdminOffers() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/offers`);
  if (!res.ok) throw new Error('Failed to fetch promotional offers');
  return res.json();
}

export async function createAdminOffer(data: {
  title: string;
  minRechargeAmount: number;
  bonusType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  bonusValue: number;
  maxBonusAmount?: number;
  perOrgLimit?: number;
  totalRedemptionCap?: number;
  validDays?: number;
}) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/offers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create offer');
  }
  return res.json();
}

export async function toggleAdminOffer(id: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/offers/${id}/toggle`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to toggle offer status');
  return res.json();
}

export async function fetchAdminSettings() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/settings`);
  if (!res.ok) throw new Error('Failed to load platform settings');
  return res.json();
}

export async function updateAdminSettings(settings: any) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}

export async function fetchGstr1Report() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/billing/gstr-1`);
  if (!res.ok) throw new Error('Failed to generate GSTR-1 Report');
  return res.json();
}

export async function fetchGstr2Report() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/billing/gstr-2`);
  if (!res.ok) throw new Error('Failed to generate GSTR-2 Report');
  return res.json();
}

export async function updateProjectIpAllowlist(projectId: string, ipAllowlist: string[]) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/projects/${projectId}/security`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ipAllowlist }),
  });
  if (!res.ok) throw new Error('Failed to update IP allowlist');
  return res.json();
}

export async function updateCustomerBillingProfile(profileData: any) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/billing/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profileData),
  });
  if (!res.ok) throw new Error('Failed to update billing profile');
  return res.json();
}






