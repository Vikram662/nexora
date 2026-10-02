import type { AdminAuditEntry, AdminSettingsData, BillingProfile, CreditNote, LedgerTransaction, SystemHealth, TaxInvoice, UpdateSettingsPayload } from './types';

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    // In production or custom domains without explicit API URL, default to api subdomain or same host
    const port = window.location.port ? ':4000' : '';
    return `${protocol}//${hostname}${port}`;
  }
  return '';
}

export function getLivekitWsUrl(): string {
  if (process.env.NEXT_PUBLIC_LIVEKIT_URL) return process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (typeof window !== 'undefined' && window.location) {
    const isHttps = window.location.protocol === 'https:';
    const protocol = isHttps ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    const port = window.location.port ? ':7880' : '';
    return `${protocol}//${hostname}${port}`;
  }
  return '';
}

function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  return headers;
}

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
  apiSecretRolledAt: string;
  previousSecretExpiresAt?: string;
  maxConcurrentRooms: number;
  maxTokenTtlSeconds: number;
  ipAllowlist?: string[];
  storageConfigs: StorageConfig[];
  webhookEndpoints?: WebhookEndpointInfo[];
  createdAt: string;
}

export interface WebhookEndpointInfo {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface WebhookDeliveryInfo {
  id: string;
  eventType: string;
  attempt: number;
  responseCode: number | null;
  succeeded: boolean;
  nextRetryAt: string | null;
  lastError: string | null;
  createdAt: string;
  endpoint: { id: string; url: string; project: { name: string } };
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
  transactions: LedgerTransaction[];
  invoices?: TaxInvoice[];
  creditNotes?: CreditNote[];
  kycVerification?: KycVerificationData | null;
  billingProfile?: BillingProfile | null;
}

// ==========================================
// AUTHENTICATION API CALLS
// ==========================================

export async function loginUser(email: string, password?: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Login failed');
  }
  return res.json();
}

export async function signupUser(email: string, orgName: string, password: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, orgName, password }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Signup failed');
  }
  return res.json();
}

export async function logoutUser() {
  const res = await fetch(`${getApiBaseUrl()}/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  return res.json();
}

// ==========================================
// TENANT / DEVELOPER CONSOLE API CALLS
// ==========================================

export async function fetchOrganizationData(): Promise<OrganizationData> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/organization`, {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to fetch organization data');
  }
  const json = await res.json();
  return json.data;
}

export async function createNewProject(name: string, environment: 'SANDBOX' | 'PRODUCTION'): Promise<{ project: Project; rawSecret: string }> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/projects`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, environment }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create project');
  }
  const json = await res.json();
  return json.data;
}

export async function rotateProjectSecret(projectId: string): Promise<{ newSecret: string; graceWindowExpiresAt: string }> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/projects/${projectId}/rotate-secret`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to rotate secret');
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
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/projects/${projectId}/storage`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to save storage configuration');
  return res.json();
}

export async function saveFirebase(projectId: string, data: { firebaseProjectId: string; serviceAccountJson: string }) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/projects/${projectId}/firebase`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to save Firebase configuration');
  return res.json();
}

async function readError(res: Response, fallback: string): Promise<Error> {
  const json = await res.json().catch(() => ({}));
  return new Error(Array.isArray(json.message) ? json.message.join(', ') : json.message || fallback);
}

export async function addWebhookEndpoint(projectId: string, data: { url: string; events: string[] }) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/projects/${projectId}/webhooks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) throw await readError(res, 'Failed to add webhook endpoint');
  return res.json() as Promise<{ data: { endpoint: WebhookEndpointInfo; signingSecret: string } }>;
}

export async function deleteWebhookEndpoint(id: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/webhooks/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw await readError(res, 'Failed to delete the webhook endpoint');
}

export async function fetchWebhookDeliveries(): Promise<WebhookDeliveryInfo[]> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/webhooks/deliveries`, { credentials: 'include' });
  if (!res.ok) throw await readError(res, 'Failed to load webhook deliveries');
  return (await res.json()).data;
}

export async function resendWebhookDelivery(id: string): Promise<{ succeeded: boolean; responseCode: number; error: string | null }> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/webhooks/deliveries/${id}/resend`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw await readError(res, 'Failed to resend the delivery');
  return (await res.json()).data;
}

export async function submitKycVerification(data: {
  documentType: string;
  documentNumber: string;
  digilockerOtp?: string;
}) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/kyc/submit`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to submit KYC');
  }
  return res.json();
}

export async function fetchTeamMembers() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/team`, {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch team');
  const json = await res.json();
  return json.data;
}

export async function inviteMember(email: string, role: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/team/invite`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ email, role }),
    credentials: 'include',
  });
  if (!res.ok) throw await readError(res, 'Failed to invite member');
  return (await res.json()) as { data: { id: string; email: string; token: string } };
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  token: string;
}

export async function fetchTeamInvites(): Promise<PendingInvite[]> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/team/invites`, { credentials: 'include' });
  if (!res.ok) throw await readError(res, 'Failed to load invitations');
  return (await res.json()).data;
}

export async function revokeTeamInvite(id: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/team/invites/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw await readError(res, 'Failed to cancel the invitation');
}

export interface InvitePreview {
  email: string;
  role: string;
  organizationName: string;
  expiresAt: string;
  hasAccount: boolean;
}

export async function fetchInvitePreview(token: string): Promise<InvitePreview> {
  const res = await fetch(`${getApiBaseUrl()}/v1/auth/invite/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (!res.ok) throw await readError(res, 'This invitation link is not valid.');
  return (await res.json()).data;
}

export async function acceptInvite(token: string, password: string, name: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/auth/invite/accept`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ token, password, name }),
  });
  if (!res.ok) throw await readError(res, 'Could not accept the invitation');
  return (await res.json()).data;
}

export async function acceptInviteExisting(token: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/auth/invite/accept-existing`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ token }),
  });
  if (res.status === 401) throw new Error('SIGN_IN_REQUIRED');
  if (!res.ok) throw await readError(res, 'Could not accept the invitation');
  return (await res.json()).data;
}

export interface OrganizationChoice {
  organizationId: string;
  name: string;
  role: string;
  current: boolean;
}

export async function fetchOrganizations(): Promise<OrganizationChoice[]> {
  const res = await fetch(`${getApiBaseUrl()}/v1/auth/organizations`, { credentials: 'include' });
  if (!res.ok) return [];
  return (await res.json()).data;
}

export async function switchOrganization(organizationId: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/auth/switch-org`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ organizationId }),
  });
  if (!res.ok) throw await readError(res, 'Could not switch organization');
}

export async function fetchUsageAndRecordings() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/usage`, {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch usage');
  const json = await res.json();
  return json.data;
}

export async function fetchAuditLogs() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/audit-log`, {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch audit log');
  const json = await res.json();
  return json.data;
}

export async function fetchSupportTickets() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/tickets`, {
    cache: 'no-store',
    credentials: 'include',
  });
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
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/tickets`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to create ticket');
  return res.json();
}

export async function createPaymentOrder(amount: number) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/payments/create-order`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ amount }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(Array.isArray(err.message) ? err.message.join(', ') : err.message || 'Failed to create payment order');
  }
  return res.json();
}

export async function verifyPayment(data: {
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
}) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/payments/verify`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to verify payment');
  }
  return res.json();
}

export async function fetchNotificationPreferences() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/notifications/preferences`, {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) return { emailEnabled: true, smsEnabled: false, criticalOnlyViaSms: true };
  const json = await res.json();
  return json.data || { emailEnabled: true, smsEnabled: false, criticalOnlyViaSms: true };
}

export async function updateNotificationPreferences(data: {
  emailEnabled: boolean;
  smsEnabled: boolean;
  criticalOnlyViaSms: boolean;
}) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/notifications/preferences`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    credentials: 'include',
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
  canPublishSources?: string[];
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
        ...(params.canPublishSources ? { canPublishSources: params.canPublishSources } : {}),
        canSubscribe: true,
        canPublishData: true,
      },
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = Array.isArray(errorData.message)
      ? errorData.message.join(', ')
      : errorData.message || errorData.error || 'Failed to mint LiveKit token';
    throw new Error(message);
  }

  return res.json();
}

export interface UserProfile {
  name: string | null;
  email: string;
  phone: string | null;
  role: string;
  organizationName: string;
}

export async function fetchProfile(): Promise<UserProfile> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/profile`, { credentials: 'include' });
  if (!res.ok) throw new Error('Could not load your profile');
  return (await res.json()).data;
}

export async function updateProfile(payload: { name?: string; phone?: string }): Promise<UserProfile> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/profile`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(json.message) ? json.message.join(', ') : json.message || 'Could not save your profile');
  return json.data;
}

export interface AutoRechargeStatus {
  enabled: boolean;
  threshold: number | null;
  amount: number | null;
  hasPaymentMethod: boolean;
  failures: number;
  lastError: string | null;
  noticeSentAt: string | null;
  noticeHours: number;
  maxAmount: number;
  maxFailures: number;
}

export async function fetchAutoRecharge(): Promise<AutoRechargeStatus> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/auto-recharge`, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw await readError(res, 'Could not load auto recharge');
  return (await res.json()).data;
}

export async function saveAutoRecharge(settings: { enabled: boolean; threshold: number; amount: number }): Promise<AutoRechargeStatus> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/auto-recharge/settings`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw await readError(res, 'Could not save auto recharge');
  return (await res.json()).data;
}

export async function startAutoRechargeSetup(amount: number): Promise<{ orderId: string; customerId: string; keyId: string; amount: number }> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/auto-recharge/setup`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) throw await readError(res, 'Could not start saving the card');
  return (await res.json()).data;
}

export async function confirmAutoRechargeSetup(data: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }): Promise<AutoRechargeStatus> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/auto-recharge/confirm`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await readError(res, 'Could not save the card');
  return (await res.json()).data;
}

export async function removeAutoRechargeCard(): Promise<AutoRechargeStatus> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/auto-recharge/method`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw await readError(res, 'Could not remove the card');
  return (await res.json()).data;
}

export async function fetch2faSetup() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/profile/2fa/setup`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load 2FA setup');
  const json = await res.json();
  return json.data;
}

export async function verifyAndToggle2fa(code: string, enable: boolean) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/profile/2fa/verify`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ code, enable }),
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update 2FA status');
  }
  return res.json();
}

export async function updateProjectIpAllowlist(projectId: string, ipAllowlist: string[]) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/projects/${projectId}/security`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ipAllowlist }),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to update IP allowlist');
  return res.json();
}

export async function updateCustomerBillingProfile(profileData: BillingProfile) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/billing/profile`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(profileData),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to update billing profile');
  return res.json();
}

// ==========================================
// MASTER ADMIN / OPS CONSOLE API CALLS
// ==========================================

export async function fetchAdminOverview() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/overview`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load admin overview metrics');
  const json = await res.json();
  return json.data;
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/system-health`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to check system health');
  const json = await res.json();
  return json.data;
}

export async function fetchAdminAuditLog(): Promise<AdminAuditEntry[]> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/audit-log`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load the audit log');
  const json = await res.json();
  return json.data;
}

export async function fetchAdminKycList() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/kyc`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load KYC verification list');
  const json = await res.json();
  return json.data;
}

export async function reviewAdminKyc(id: string, action: 'APPROVE' | 'REJECT', reason?: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/kyc/${id}/review`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ action, reason }),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to review KYC submission');
  return res.json();
}

export async function fetchAdminOrganizations() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/organizations`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load organizations list');
  const json = await res.json();
  return json.data;
}

export async function adjustOrgBalance(id: string, amount: number, reason: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/organizations/${id}/adjust-balance`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ amount, reason }),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to adjust organization balance');
  return res.json();
}

export async function fetchAdminTickets() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/tickets`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load support tickets');
  const json = await res.json();
  return json.data;
}

export async function replyAdminTicket(id: string, message: string, status?: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/tickets/${id}/reply`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message, status }),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to reply to ticket');
  return res.json();
}

export async function fetchAdminBillingOverview() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/billing/overview`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch admin billing overview');
  return res.json();
}

export interface InvoiceRunResult {
  created: number;
  skipped: { organizationId: string; reason?: string }[];
}

export async function generateInvoices(month: string, organizationId?: string): Promise<InvoiceRunResult> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/invoices/generate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ month, ...(organizationId ? { organizationId } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(Array.isArray(json.message) ? json.message.join(', ') : json.message || 'Could not generate invoices');
  }
  return json.data;
}

export async function issueCreditNote(payload: { invoiceId: string; amount: number; reason: string; creditToWallet: boolean }) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/credit-notes`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(Array.isArray(json.message) ? json.message.join(', ') : json.message || 'Could not issue the credit note');
  }
  return json.data as CreditNote;
}

export async function processQueuedEmails(): Promise<{ sent: number; failed: number; retrying: number; skipped?: string }> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/notifications/process`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || 'Could not send queued emails');
  return json.data;
}

export async function fetchAdminOffers() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/offers`, {
    credentials: 'include',
  });
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
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to create offer');
  return res.json();
}

export async function toggleAdminOffer(id: string) {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/offers/${id}/toggle`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to toggle offer status');
  return res.json();
}

export async function fetchAdminSettings(): Promise<{ data: AdminSettingsData }> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/settings`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load platform settings');
  return res.json();
}

export async function updateAdminSettings(payload: UpdateSettingsPayload): Promise<{ data: AdminSettingsData }> {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/settings`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const detail = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new Error(detail || 'Failed to save settings');
  }
  return res.json();
}

export async function fetchGstr1Report() {
  const res = await fetch(`${getApiBaseUrl()}/v1/portal/admin/billing/gstr-1`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to generate GSTR-1 Report');
  return res.json();
}
