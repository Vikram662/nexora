import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const PLAN_TIERS = ['STARTER', 'GROWTH', 'ENTERPRISE'] as const;
export const RATE_ROOM_TYPES = ['AUDIO_CALL', 'VIDEO_CALL', 'LIVE_BROADCAST'] as const;

export type PlanTierName = (typeof PLAN_TIERS)[number];
export type RateRoomType = (typeof RATE_ROOM_TYPES)[number];

export class ContactSettingsDto {
  @IsString()
  @MaxLength(120)
  @IsOptional()
  companyName?: string;

  @ValidateIf((_: any, v: any) => v !== '' && v !== undefined)
  @IsEmail()
  @IsOptional()
  email?: string;

  @ValidateIf((_: any, v: any) => v !== '' && v !== undefined)
  @Matches(/^[+0-9 ()-]{7,20}$/, { message: 'phone must be 7-20 digits, spaces, +, - or brackets' })
  @IsOptional()
  phone?: string;

  @ValidateIf((_: any, v: any) => v !== '' && v !== undefined)
  @Matches(/^[+0-9 ()-]{7,20}$/, { message: 'whatsapp must be 7-20 digits, spaces, +, - or brackets' })
  @IsOptional()
  whatsapp?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  supportHours?: string;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  address?: string;
}

const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

export class BrandSettingsDto {
  @IsString()
  @MaxLength(60)
  @IsOptional()
  siteName?: string;

  @IsString()
  @MaxLength(160)
  @IsOptional()
  tagline?: string;

  @ValidateIf((_: any, v: any) => v !== '' && v !== undefined)
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  announcement?: string;
}

export class SocialLinksDto {
  @ValidateIf((_: any, v: any) => v !== '' && v !== undefined)
  @IsUrl(URL_OPTIONS)
  @IsOptional()
  linkedin?: string;

  @ValidateIf((_: any, v: any) => v !== '' && v !== undefined)
  @IsUrl(URL_OPTIONS)
  @IsOptional()
  twitter?: string;

  @ValidateIf((_: any, v: any) => v !== '' && v !== undefined)
  @IsUrl(URL_OPTIONS)
  @IsOptional()
  github?: string;

  @ValidateIf((_: any, v: any) => v !== '' && v !== undefined)
  @IsUrl(URL_OPTIONS)
  @IsOptional()
  youtube?: string;
}

export class BillingSettingsDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  gstPercent?: number;

  @Matches(/^\d{4,8}$/, { message: 'sacCode must be 4-8 digits' })
  @IsOptional()
  sacCode?: string;
}

export class PlanDisplayDto {
  @IsIn(PLAN_TIERS)
  tier!: PlanTierName;

  @IsString()
  @MaxLength(40)
  name!: string;

  @IsString()
  @MaxLength(60)
  platformFee!: string;

  @IsString()
  @MaxLength(40)
  maxRooms!: string;

  @IsString()
  @MaxLength(40)
  maxParticipants!: string;

  @IsString()
  @MaxLength(160)
  includes!: string;
}

export class RateUpdateDto {
  @IsIn(PLAN_TIERS)
  planTier!: PlanTierName;

  @IsIn(RATE_ROOM_TYPES)
  roomType!: RateRoomType;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000)
  ratePerMinute!: number;
}

export class UpdateSiteSettingsDto {
  @ValidateNested()
  @Type(() => ContactSettingsDto)
  @IsOptional()
  contact?: ContactSettingsDto;

  @ValidateNested()
  @Type(() => BrandSettingsDto)
  @IsOptional()
  brand?: BrandSettingsDto;

  @ValidateNested()
  @Type(() => SocialLinksDto)
  @IsOptional()
  social?: SocialLinksDto;

  @ValidateNested()
  @Type(() => BillingSettingsDto)
  @IsOptional()
  billing?: BillingSettingsDto;

  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => PlanDisplayDto)
  @IsOptional()
  plans?: PlanDisplayDto[];

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => RateUpdateDto)
  @IsOptional()
  rates?: RateUpdateDto[];
}
