// Response shapes returned by the control plane. Decimal columns arrive as strings, so money is `Money`.
export type Money = string | number;

export interface OrgRef {
  name?: string;
  billingEmail?: string;
}

export interface LedgerTransaction {
  id: string;
  type: string;
  status: string;
  amount: Money;
  createdAt: string;
  gatewayPaymentId?: string | null;
  organization?: OrgRef | null;
}

export interface TaxInvoice {
  id: string;
  invoiceNumber?: string;
  customerName?: string;
  customerGstin?: string;
  placeOfSupply?: string;
  periodStart: string;
  periodEnd: string;
  status?: string;
  subtotal?: Money;
  taxableValue?: Money;
  cgst?: Money;
  sgst?: Money;
  cgstAmount?: Money;
  sgstAmount?: Money;
  igstAmount?: Money;
  totalAmount?: Money;
  totalInvoiceValue?: Money;
  organization?: OrgRef | null;
}

export interface BillingProfile {
  legalBusinessName?: string;
  gstin?: string;
  panNumber?: string;
  billingAddressLine1?: string;
  city?: string;
  placeOfSupplyStateCode?: string;
  pincode?: string;
  invoiceEmail?: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  billingEmail?: string;
  planTier?: string;
  walletBalance: Money;
  createdAt: string;
  projects?: unknown[];
  kycVerification?: { status: string } | null;
  _count?: { projects?: number };
}

export interface AdminBillingOverview {
  transactions?: LedgerTransaction[];
  invoices?: TaxInvoice[];
  organizations?: OrgSummary[];
  summary?: Record<string, Money>;
}

export interface Gstr1Report {
  filingPeriod?: string;
  b2b?: TaxInvoice[];
  summary?: { totalTaxCollected?: Money; totalTaxable?: Money };
}

export interface Gstr2Row {
  invoiceNo?: string;
  vendorName?: string;
  vendorGstin?: string;
  natureOfSupply?: string;
  sacCode?: string;
  taxableValue?: Money;
  itcAvailable?: Money;
}

export interface Gstr2Report {
  itcEligible?: Gstr2Row[];
  summary?: { totalInputTaxCredit?: Money };
}

export interface AdminOverview {
  pendingKycCount: number;
  totalOrgs: number;
  totalProjects: number;
  totalSystemWalletBalance: Money;
  recentTransactions: LedgerTransaction[];
}

export interface KycSubmission {
  id: string;
  documentType?: string;
  documentNumber?: string;
  organizationName?: string;
  organizationEmail?: string;
  status: string;
  rejectionReason?: string | null;
  submittedAt?: string;
  verifiedViaDigiLocker?: boolean;
}

export interface PromoOffer {
  id: string;
  title: string;
  bonusType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  bonusValue: Money;
  minRechargeAmount: Money;
  maxBonusAmount?: Money | null;
  isActive: boolean;
  validUntil: string;
  _count?: { redemptions?: number };
}

export interface TicketMessage {
  id: string;
  message: string;
  senderName?: string;
  senderType?: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber?: string;
  subject: string;
  description?: string;
  status: string;
  category?: string;
  priority?: string;
  createdAt: string;
  organization?: OrgRef | null;
  messages?: TicketMessage[];
}

export interface AuditEntry {
  id: string;
  actor?: string;
  purpose?: string;
  targetType?: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  role: string;
  acceptedAt?: string | null;
  user?: { email?: string };
}

export interface UsageLogEntry {
  id: string;
  roomName: string;
  roomType?: string;
  participantIdentity?: string;
  billableSeconds?: number;
  ratePerMinute?: Money;
  amountDeducted?: Money;
}

export interface RecordingEntry {
  id: string;
  roomName: string;
  status: string;
  bucketName?: string;
  objectKey?: string;
  storageProvider?: string;
}

export type PlanTier = 'STARTER' | 'GROWTH' | 'ENTERPRISE';
export type RateRoomType = 'AUDIO_CALL' | 'VIDEO_CALL' | 'LIVE_BROADCAST';

export interface ContactSettings {
  companyName: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  supportHours: string;
}

export interface BrandSettings {
  siteName: string;
  tagline: string;
  logoUrl: string;
  announcement: string;
}

export interface SocialLinks {
  linkedin: string;
  twitter: string;
  github: string;
  youtube: string;
}

export interface BillingSettings {
  gstPercent: number;
  sacCode: string;
  supplierLegalName: string;
  supplierGstin: string;
  supplierStateCode: string;
  supplierAddress: string;
}

export interface PlanDisplay {
  tier: PlanTier;
  name: string;
  platformFee: string;
  maxRooms: string;
  maxParticipants: string;
  includes: string;
}

export type RateTable = Record<PlanTier, Partial<Record<RateRoomType, number>>>;

export interface RateUpdate {
  planTier: PlanTier;
  roomType: RateRoomType;
  ratePerMinute: number;
}

export interface AdminSettingsData {
  contact: ContactSettings;
  brand: BrandSettings;
  social: SocialLinks;
  billing: BillingSettings;
  plans: PlanDisplay[];
  rates: RateTable;
  livekitHost: string;
  coturnHost: string;
  razorpayKeyIdSet: boolean;
  razorpayKeySecretSet: boolean;
  razorpayWebhookSecretSet: boolean;
  smtpHost: string;
  smtpUserSet: boolean;
  smtpPasswordSet: boolean;
  emailFromAddress: string;
  smsProvider: string;
  smsApiKeySet: boolean;
  smsSenderId: string;
}

export interface UpdateSettingsPayload {
  contact?: Partial<ContactSettings>;
  brand?: Partial<BrandSettings>;
  social?: Partial<SocialLinks>;
  billing?: Partial<BillingSettings>;
  plans?: PlanDisplay[];
  rates?: RateUpdate[];
}

export interface PublicPlan extends PlanDisplay {
  videoRatePerMinute: number | null;
}

export interface PublicSite {
  brand: BrandSettings;
  contact: ContactSettings;
  social: SocialLinks;
  sacCode: string;
  gstPercent: number;
  plans: PublicPlan[];
}

export interface PaymentOrder {
  orderId: string;
  amount: number;
}

export interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: { error: { description: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}
