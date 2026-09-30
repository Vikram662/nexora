import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsBoolean,
  Min,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(['SANDBOX', 'PRODUCTION'])
  @IsOptional()
  environment?: 'SANDBOX' | 'PRODUCTION';
}

export class UpdateProjectSecurityDto {
  @IsArray()
  @IsString({ each: true })
  ipAllowlist!: string[];
}

export class SaveStorageDto {
  @IsEnum(['AWS_S3', 'CLOUDFLARE_R2', 'GOOGLE_CLOUD'])
  provider!: 'AWS_S3' | 'CLOUDFLARE_R2' | 'GOOGLE_CLOUD';

  @IsString()
  @IsNotEmpty()
  bucketName!: string;

  @IsString()
  @IsOptional()
  region?: string;

  @IsString()
  @IsOptional()
  endpoint?: string;

  @IsString()
  @IsOptional()
  accessKey?: string;

  @IsString()
  @IsOptional()
  secretKey?: string;

  @IsString()
  @IsOptional()
  gcsServiceAccountJson?: string;
}

export class SaveFirebaseDto {
  @IsString()
  @IsNotEmpty()
  firebaseProjectId!: string;

  @IsString()
  @IsNotEmpty()
  serviceAccountJson!: string;
}

export class AddWebhookDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  events?: string[];
}

export class UpdateBillingProfileDto {
  @IsString()
  @IsNotEmpty()
  legalBusinessName!: string;

  @IsString()
  @IsOptional()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
    message: 'Invalid GSTIN format',
  })
  gstin?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, {
    message: 'Invalid PAN format',
  })
  panNumber!: string;

  @IsString()
  @IsNotEmpty()
  billingAddressLine1!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  placeOfSupplyStateCode!: string;

  @IsString()
  @IsNotEmpty()
  pincode!: string;

  @IsString()
  @IsNotEmpty()
  invoiceEmail!: string;
}

export class SubmitKycDto {
  @IsEnum(['PAN', 'AADHAAR', 'GSTIN', 'COMPANY_CIN'])
  documentType!: 'PAN' | 'AADHAAR' | 'GSTIN' | 'COMPANY_CIN';

  @IsString()
  @IsNotEmpty()
  documentNumber!: string;

  @IsString()
  @IsOptional()
  digilockerOtp?: string;
}

export class InviteTeamMemberDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsEnum(['ADMIN', 'DEVELOPER', 'BILLING'])
  role!: 'ADMIN' | 'DEVELOPER' | 'BILLING';
}

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsEnum(['MEDIA_QUALITY', 'RECORDING_EGRESS', 'BILLING_WALLET', 'API_INTEGRATION', 'FEATURE_REQUEST'])
  category!: 'MEDIA_QUALITY' | 'RECORDING_EGRESS' | 'BILLING_WALLET' | 'API_INTEGRATION' | 'FEATURE_REQUEST';

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority!: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

  @IsString()
  @IsNotEmpty()
  message!: string;
}

export class CreatePaymentOrderDto {
  @IsNumber()
  @Min(100) // Minimum ₹100 order
  amount!: number;
}

export class VerifyPaymentDto {
  @IsString()
  @IsOptional()
  gatewayOrderId?: string;

  @IsString()
  @IsOptional()
  gatewayPaymentId?: string;

  @IsString()
  @IsOptional()
  razorpayOrderId?: string;

  @IsString()
  @IsOptional()
  razorpayPaymentId?: string;

  @IsString()
  @IsNotEmpty({ message: 'razorpaySignature is mandatory' })
  razorpaySignature!: string;
}

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  emailEnabled!: boolean;

  @IsBoolean()
  smsEnabled!: boolean;

  @IsBoolean()
  criticalOnlyViaSms!: boolean;
}

export class ReviewKycDto {
  @IsEnum(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT';

  @IsString()
  @IsOptional()
  reason?: string;
}

export class AdjustBalanceDto {
  @IsNumber()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ReplyTicketDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsEnum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  @IsOptional()
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
}

export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsNumber()
  @Min(0)
  minRechargeAmount!: number;

  @IsEnum(['PERCENTAGE', 'FIXED_AMOUNT'])
  bonusType!: 'PERCENTAGE' | 'FIXED_AMOUNT';

  @IsNumber()
  @Min(1)
  bonusValue!: number;

  @IsNumber()
  @IsOptional()
  maxBonusAmount?: number;

  @IsNumber()
  @IsOptional()
  perOrgLimit?: number;

  @IsNumber()
  @IsOptional()
  totalRedemptionCap?: number;

  @IsNumber()
  @IsOptional()
  validDays?: number;
}

export class IssueCreditNoteDto {
  @IsString()
  @IsNotEmpty()
  invoiceId!: string;

  // GST-inclusive amount to credit, in rupees.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsBoolean()
  @IsOptional()
  creditToWallet?: boolean;
}

export class GenerateInvoicesDto {
  // Billing month as YYYY-MM, e.g. 2026-08.
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must look like 2026-08' })
  month!: string;

  @IsString()
  @IsOptional()
  organizationId?: string;
}
