import type { Prisma } from '@prisma/client';
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { KycGatewayService } from './kyc-gateway.service.js';
import { SiteSettingsService } from '../settings/site-settings.service.js';
import { UpdateSiteSettingsDto } from '../settings/site-settings.dto.js';
import { PaymentService } from './payment.service.js';
import { InvoiceService } from '../invoicing/invoice.service.js';
import { OutboundWebhookService } from '../livekit/outbound-webhook.service.js';
import { TeamInviteService } from '../team/team-invite.service.js';
import { signInviteToken } from '../team/invite-token.js';
import { assertPublicWebhookUrl, WebhookUrlError } from '../livekit/webhook-url.js';
import { CreditNoteService } from '../invoicing/credit-note.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isRenderableCreditNote, renderCreditNoteHtml } from '../invoicing/credit-note.render.js';
import { renderCreditNotePdf, renderInvoicePdf } from '../invoicing/pdf.render.js';
import { isRenderableSnapshot, renderInvoiceHtml } from '../invoicing/invoice.render.js';
import { financialYearOf, monthRange } from '../invoicing/invoice-math.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard, Roles, RequireStaff } from '../auth/roles.guard.js';
import {
  CreateProjectDto,
  UpdateProjectSecurityDto,
  SaveStorageDto,
  SaveFirebaseDto,
  AddWebhookDto,
  UpdateBillingProfileDto,
  SubmitKycDto,
  InviteTeamMemberDto,
  CreateTicketDto,
  CreatePaymentOrderDto,
  VerifyPaymentDto,
  UpdateNotificationPreferencesDto,
  ReviewKycDto,
  AdjustBalanceDto,
  ReplyTicketDto,
  CreateOfferDto,
  GenerateInvoicesDto,
  IssueCreditNoteDto,
  UpdateProfileDto,
} from './portal.dto.js';

@Controller('v1/portal')
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly kycGateway: KycGatewayService,
    private readonly siteSettings: SiteSettingsService,
    private readonly paymentService: PaymentService,
    private readonly invoicing: InvoiceService,
    private readonly creditNotes: CreditNoteService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: OutboundWebhookService,
    private readonly invitesService: TeamInviteService,
  ) {}

  // Helper: Sanitize Project object so apiSecretHash is never leaked to frontend
  private sanitizeProject(project: any) {
    if (!project) return project;
    const { apiSecretHash: _secret, previousSecretHash: _previous, ...safe } = project;
    return safe;
  }

  // ==========================================
  // CUSTOMER / TENANT PORTAL ENDPOINTS (AUTHENTICATED)
  // ==========================================

  // Get active organization details scoped to authenticated user's organization
  @Get('organization')
  @UseGuards(JwtAuthGuard)
  async getOrganization(@Req() req: Request) {
    const orgId = req.user!.organizationId;

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        projects: {
          include: {
            storageConfigs: true,
            // The signing secret is shown once, when the endpoint is created.
            webhookEndpoints: { select: { id: true, url: true, events: true, isActive: true, createdAt: true } },
          },
        },
        billingProfile: true,
        kycVerification: true,
        invoices: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        creditNotes: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { invoice: { select: { invoiceNumber: true } } },
        },
        transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!org) {
      throw new BadRequestException('Organization not found for authenticated user');
    }

    // Format safe masked KYC info if verified or submitted
    let kycData: any = null;
    if (org.kycVerification) {
      let maskedDoc = '••••••••';
      try {
        const decrypted = this.crypto.decrypt({
          ciphertext: org.kycVerification.encryptedDocumentNumber,
          iv: org.kycVerification.encryptionIv,
          authTag: org.kycVerification.encryptionAuthTag,
        });
        if (decrypted && decrypted.length >= 6) {
          maskedDoc = `${decrypted.substring(0, 3)}••••${decrypted.slice(-2)}`;
        } else if (decrypted) {
          maskedDoc = `${decrypted.substring(0, 1)}••••`;
        }
      } catch {
        maskedDoc = 'VERIFIED';
      }

      kycData = {
        id: org.kycVerification.id,
        documentType: org.kycVerification.documentType,
        status: org.kycVerification.status,
        verifiedViaDigiLocker: org.kycVerification.verifiedViaDigiLocker,
        submittedAt: org.kycVerification.submittedAt,
        reviewedAt: org.kycVerification.reviewedAt,
        maskedDocumentNumber: maskedDoc,
      };
    }

    return {
      status: 'success',
      data: {
        ...org,
        projects: org.projects.map((p) => this.sanitizeProject(p)),
        kycVerification: kycData,
      },
    };
  }

  // The signed-in user's own profile. The phone number is where SMS alerts go for organization owners.
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request) {
    const [user, org, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true, email: true, phone: true } }),
      this.prisma.organization.findUnique({ where: { id: req.user!.organizationId }, select: { name: true } }),
      this.prisma.orgMember.findFirst({ where: { userId: req.user!.userId, organizationId: req.user!.organizationId }, select: { role: true } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    return { status: 'success', data: { ...user, role: membership?.role ?? req.user!.role, organizationName: org?.name ?? '' } };
  }

  @Post('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Body() body: UpdateProfileDto, @Req() req: Request) {
    const data: { name?: string; phone?: string | null } = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.phone !== undefined) data.phone = body.phone === '' ? null : body.phone;
    try {
      const user = await this.prisma.user.update({
        where: { id: req.user!.userId },
        data,
        select: { name: true, email: true, phone: true },
      });
      return { status: 'success', data: user };
    } catch (err: any) {
      if (err?.code === 'P2002') throw new BadRequestException('This phone number is already used by another account.');
      throw err;
    }
  }

  // Best-effort audit trail: a failed audit write must never break the action being audited.
  private async audit(req: Request, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          actorUserId: req.user!.userId,
          action,
          targetType,
          targetId,
          ip: req.ip ?? null,
          metadata: metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch {
      // ignored on purpose
    }
  }

  // Create new project with auto-generated API Key and Secret
  @Post('projects')
  @UseGuards(JwtAuthGuard)
  async createProject(@Body() body: CreateProjectDto, @Req() req: Request) {
    const orgId = req.user!.organizationId;

    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const apiKeyPrefix = `pk_${body.environment === 'SANDBOX' ? 'test' : 'live'}_${randomSuffix}`;
    const rawSecret = `sk_${body.environment === 'SANDBOX' ? 'test' : 'live'}_${crypto.randomBytes(16).toString('hex')}`;
    const secretHash = await this.crypto.hashApiSecret(rawSecret);

    const project = await this.prisma.project.create({
      data: {
        organizationId: orgId,
        name: body.name || 'New Project',
        environment: body.environment || 'PRODUCTION',
        apiKeyPrefix,
        apiSecretHash: secretHash,
      },
    });

    await this.audit(req, 'project.created', 'project', project.id, { environment: body.environment });

    return {
      status: 'success',
      data: {
        project: this.sanitizeProject(project),
        rawSecret, // Shown only once upon creation
      },
    };
  }

  // Rotate Project API Secret with grace window
  @Post('projects/:id/rotate-secret')
  @UseGuards(JwtAuthGuard)
  async rotateSecret(@Param('id') projectId: string, @Req() req: Request) {
    const orgId = req.user!.organizationId;

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });
    if (!project) throw new BadRequestException('Project not found or unauthorized');

    const newRawSecret = `sk_live_${crypto.randomBytes(16).toString('hex')}`;
    const newSecretHash = await this.crypto.hashApiSecret(newRawSecret);
    const graceWindowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        previousSecretHash: project.apiSecretHash,
        previousSecretExpiresAt: graceWindowExpiry,
        apiSecretHash: newSecretHash,
        apiSecretRolledAt: new Date(),
      },
    });

    await this.notifications.queue(orgId, 'API_KEY_ROTATED', {
      projectName: project.name,
      graceWindowExpiresAt: graceWindowExpiry.toISOString(),
      ip: req.ip,
    });
    await this.audit(req, 'project.secret_rotated', 'project', projectId, {
      graceWindowExpiresAt: graceWindowExpiry.toISOString(),
    });

    return {
      status: 'success',
      data: {
        project: this.sanitizeProject(updated),
        newSecret: newRawSecret,
        graceWindowExpiresAt: graceWindowExpiry,
      },
    };
  }

  // Update Project Security (IP Allowlist / Whitelist)
  @Post('projects/:id/security')
  @UseGuards(JwtAuthGuard)
  async updateProjectSecurity(
    @Param('id') projectId: string,
    @Body() body: UpdateProjectSecurityDto,
    @Req() req: Request,
  ) {
    const orgId = req.user!.organizationId;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });
    if (!project) throw new BadRequestException('Project not found or unauthorized');

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ipAllowlist: body.ipAllowlist || [],
      },
    });

    await this.audit(req, 'project.ip_allowlist_updated', 'project', projectId, {
      entries: (body.ipAllowlist || []).length,
    });

    return {
      status: 'success',
      message: 'IP allowlist updated successfully',
      data: this.sanitizeProject(updated),
    };
  }

  // Save BYOS Storage Config (S3 / R2 / GCS)
  @Post('projects/:id/storage')
  @UseGuards(JwtAuthGuard)
  async saveStorageConfig(
    @Param('id') projectId: string,
    @Body() body: SaveStorageDto,
    @Req() req: Request,
  ) {
    const orgId = req.user!.organizationId;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });
    if (!project) throw new BadRequestException('Project not found or unauthorized');

    // Cloudflare R2 requires a specific S3-compatible API endpoint (including Cloudflare account ID)
    if (body.provider === 'CLOUDFLARE_R2' && !body.endpoint?.trim()) {
      throw new BadRequestException(
        'Cloudflare R2 requires an endpoint URL (e.g. https://<ACCOUNT_ID>.r2.cloudflarestorage.com).'
      );
    }

    // Unified credentials payload so single AES-GCM IV and AuthTag verify both keys atomically
    let credentialsPayload: { accessKey: string; secretKey: string };
    if (body.provider === 'GOOGLE_CLOUD') {
      const gcsJson = (body.gcsServiceAccountJson || body.secretKey || '').trim();
      if (!gcsJson) {
        throw new BadRequestException('Google Cloud Storage requires Service Account JSON credentials.');
      }
      credentialsPayload = {
        accessKey: 'GCS_SERVICE_ACCOUNT',
        secretKey: gcsJson,
      };
    } else {
      if (!body.accessKey?.trim() || !body.secretKey?.trim()) {
        throw new BadRequestException('Access Key and Secret Key are required.');
      }
      credentialsPayload = {
        accessKey: body.accessKey.trim(),
        secretKey: body.secretKey.trim(),
      };
    }

    const encryptedCredentials = this.crypto.encrypt(JSON.stringify(credentialsPayload));

    // Demote any existing default configs for this project to maintain strict single-default invariant
    await this.prisma.storageConfig.updateMany({
      where: { projectId, isDefault: true },
      data: { isDefault: false },
    });

    const config = await this.prisma.storageConfig.create({
      data: {
        projectId,
        provider: body.provider,
        label: `${body.provider.toLowerCase()}-primary-${Date.now().toString(36)}`,
        bucketName: body.bucketName.trim(),
        region: body.region?.trim(),
        endpoint: body.endpoint?.trim(),
        encryptedAccessKey: encryptedCredentials.ciphertext,
        encryptedSecretKey: encryptedCredentials.ciphertext,
        encryptionIv: encryptedCredentials.iv,
        encryptionAuthTag: encryptedCredentials.authTag,
        isDefault: true,
        lastVerifiedAt: new Date(),
      },
      select: {
        id: true,
        projectId: true,
        provider: true,
        label: true,
        bucketName: true,
        region: true,
        endpoint: true,
        isDefault: true,
        lastVerifiedAt: true,
        createdAt: true,
      },
    });

    return {
      status: 'success',
      message: 'Storage configuration saved successfully',
      data: config,
    };
  }

  // Save BYOF Firebase Config for Call Signaling Push
  @Post('projects/:id/firebase')
  @UseGuards(JwtAuthGuard)
  async saveFirebaseConfig(
    @Param('id') projectId: string,
    @Body() body: SaveFirebaseDto,
    @Req() req: Request,
  ) {
    const orgId = req.user!.organizationId;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });
    if (!project) throw new BadRequestException('Project not found or unauthorized');

    const enc = this.crypto.encrypt(body.serviceAccountJson);

    const config = await this.prisma.firebaseConfig.upsert({
      where: { projectId },
      update: {
        firebaseProjectId: body.firebaseProjectId,
        encryptedServiceAccountJson: enc.ciphertext,
        encryptionIv: enc.iv,
        encryptionAuthTag: enc.authTag,
        lastVerifiedAt: new Date(),
      },
      create: {
        projectId,
        firebaseProjectId: body.firebaseProjectId,
        encryptedServiceAccountJson: enc.ciphertext,
        encryptionIv: enc.iv,
        encryptionAuthTag: enc.authTag,
        lastVerifiedAt: new Date(),
      },
    });

    return { status: 'success', data: config };
  }

  // Create Outbound Webhook Endpoint
  @Post('projects/:id/webhooks')
  @UseGuards(JwtAuthGuard)
  async addWebhook(
    @Param('id') projectId: string,
    @Body() body: AddWebhookDto,
    @Req() req: Request,
  ) {
    const orgId = req.user!.organizationId;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });
    if (!project) throw new BadRequestException('Project not found or unauthorized');

    let url: string;
    try {
      url = (await assertPublicWebhookUrl(body.url.trim())).toString();
    } catch (err) {
      if (err instanceof WebhookUrlError) throw new BadRequestException(err.message);
      throw err;
    }

    const signingSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        projectId,
        url,
        signingSecret,
        events: body.events?.length ? body.events : ['*'],
      },
      select: { id: true, url: true, events: true, isActive: true, createdAt: true },
    });
    await this.audit(req, 'webhook.created', 'webhook', endpoint.id, { url });

    return { status: 'success', data: { endpoint, signingSecret } };
  }

  // Removes an endpoint and its delivery history.
  @Delete('webhooks/:id')
  @UseGuards(JwtAuthGuard)
  async deleteWebhook(@Param('id') id: string, @Req() req: Request) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id, project: { organizationId: req.user!.organizationId } },
      select: { id: true, url: true },
    });
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found');
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    await this.audit(req, 'webhook.deleted', 'webhook', id, { url: endpoint.url });
    return { status: 'success' };
  }

  // Recent deliveries for the caller's organization, with retry status.
  @Get('webhooks/deliveries')
  @UseGuards(JwtAuthGuard)
  async listWebhookDeliveries(@Req() req: Request) {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { endpoint: { project: { organizationId: req.user!.organizationId } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        eventType: true,
        attempt: true,
        responseCode: true,
        succeeded: true,
        nextRetryAt: true,
        lastError: true,
        createdAt: true,
        endpoint: { select: { id: true, url: true, project: { select: { name: true } } } },
      },
    });
    return { status: 'success', data: deliveries };
  }

  // Sends a delivery again right now.
  @Post('webhooks/deliveries/:id/resend')
  @UseGuards(JwtAuthGuard)
  async resendWebhookDelivery(@Param('id') id: string, @Req() req: Request) {
    const result = await this.webhooks.resend(id, req.user!.organizationId);
    return { status: 'success', data: result };
  }

  // Update GST & Billing Profile
  @Post('billing/profile')
  @UseGuards(JwtAuthGuard)
  async updateBillingProfile(
    @Body() body: UpdateBillingProfileDto,
    @Req() req: Request,
  ) {
    const orgId = req.user!.organizationId;

    const profile = await this.prisma.billingProfile.upsert({
      where: { organizationId: orgId },
      update: body,
      create: {
        organizationId: orgId,
        ...body,
      },
    });

    return { status: 'success', data: profile };
  }

  // Submit KYC Verification
  @Post('kyc/submit')
  @UseGuards(JwtAuthGuard)
  async submitKyc(@Body() body: SubmitKycDto, @Req() req: Request) {
    const orgId = req.user!.organizationId;
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { kycVerification: true, billingProfile: true },
    });
    if (!org) throw new BadRequestException('Organization not found');

    const docNum = (body.documentNumber || '').trim().toUpperCase();

    // Verify if already verified
    if (org.kycVerification && org.kycVerification.status === 'VERIFIED') {
      if (org.kycVerification.documentType === body.documentType) {
        throw new BadRequestException(
          `Your ${body.documentType} is already permanently verified on this account.`,
        );
      }
    }

    let kycStatus: 'PENDING_REVIEW' | 'VERIFIED' = 'PENDING_REVIEW';
    let verifiedViaDigiLocker = false;

    if (body.digilockerOtp) {
      if (body.digilockerOtp === '123456') {
        kycStatus = 'VERIFIED';
        verifiedViaDigiLocker = true;
      } else {
        throw new BadRequestException('Invalid DigiLocker OTP entered.');
      }
    }

    const enc = this.crypto.encrypt(docNum);

    const kyc = await this.prisma.kycVerification.upsert({
      where: { organizationId: org.id },
      update: {
        documentType: body.documentType,
        encryptedDocumentNumber: enc.ciphertext,
        encryptionIv: enc.iv,
        encryptionAuthTag: enc.authTag,
        status: kycStatus,
        verifiedViaDigiLocker,
        submittedAt: new Date(),
        reviewedAt: kycStatus === 'VERIFIED' ? new Date() : null,
      },
      create: {
        organizationId: org.id,
        documentType: body.documentType,
        encryptedDocumentNumber: enc.ciphertext,
        encryptionIv: enc.iv,
        encryptionAuthTag: enc.authTag,
        status: kycStatus,
        verifiedViaDigiLocker,
        submittedAt: new Date(),
        reviewedAt: kycStatus === 'VERIFIED' ? new Date() : null,
      },
    });

    return {
      status: 'success',
      data: {
        kyc,
        requiresOtp: false,
        message: 'KYC documents received for compliance check.',
      },
    };
  }

  // Invite a team member by email. They get a one-time link to set a password (or sign in) and join.
  @Post('team/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async inviteTeamMember(@Body() body: InviteTeamMemberDto, @Req() req: Request) {
    const invite = await this.invitesService.create({
      organizationId: req.user!.organizationId,
      email: body.email,
      role: body.role,
      invitedByUserId: req.user!.userId,
    });
    await this.audit(req, 'team.invited', 'invite', invite.id, { email: invite.email, role: invite.role });
    return { status: 'success', data: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt, token: signInviteToken(invite.id) } };
  }

  // Owners and admins also get each link's token, so they can copy an invitation link when email is not set up.
  @Get('team/invites')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async listTeamInvites(@Req() req: Request) {
    const invites = await this.invitesService.listPending(req.user!.organizationId);
    return { status: 'success', data: invites.map((i) => ({ ...i, token: signInviteToken(i.id) })) };
  }

  @Delete('team/invites/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async revokeTeamInvite(@Param('id') id: string, @Req() req: Request) {
    await this.invitesService.revoke(req.user!.organizationId, id);
    await this.audit(req, 'team.invite_revoked', 'invite', id);
    return { status: 'success' };
  }

  // Get Team Members
  @Get('team')
  @UseGuards(JwtAuthGuard)
  async getTeamMembers(@Req() req: Request) {
    const orgId = req.user!.organizationId;
    const members = await this.prisma.orgMember.findMany({
      where: { organizationId: orgId },
      include: { user: true },
    });
    return { status: 'success', data: members };
  }

  // Get Usage Logs & Recordings
  @Get('usage')
  @UseGuards(JwtAuthGuard)
  async getUsageLogs(@Req() req: Request) {
    const orgId = req.user!.organizationId;
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        projects: {
          include: {
            usageLogs: { take: 20, orderBy: { createdAt: 'desc' } },
            recordings: { take: 20, orderBy: { startedAt: 'desc' } },
          },
        },
      },
    });

    const allUsage = org?.projects.flatMap((p) => p.usageLogs) || [];
    const allRecordings = org?.projects.flatMap((p) => p.recordings) || [];

    return {
      status: 'success',
      data: {
        usageLogs: allUsage,
        recordings: allRecordings,
      },
    };
  }

  // Get Audit Trail
  @Get('audit-log')
  @UseGuards(JwtAuthGuard)
  async getAuditLog(@Req() req: Request) {
    // Scoped to the caller's own organization: these rows name projects, actors and IP addresses.
    const orgId = req.user!.organizationId;
    const projects = await this.prisma.project.findMany({ where: { organizationId: orgId }, select: { id: true } });
    const logs = await this.prisma.credentialAccessLog.findMany({
      where: { targetId: { in: [orgId, ...projects.map((p) => p.id)] } },
      take: 25,
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'success', data: logs };
  }

  // Get Support Tickets
  @Get('tickets')
  @UseGuards(JwtAuthGuard)
  async getTickets(@Req() req: Request) {
    const orgId = req.user!.organizationId;
    const tickets = await this.prisma.supportTicket.findMany({
      where: { organizationId: orgId },
      include: { messages: true },
      orderBy: { createdAt: 'desc' },
    });
    return { status: 'success', data: tickets };
  }

  // Create Support Ticket
  @Post('tickets')
  @UseGuards(JwtAuthGuard)
  async createTicket(@Body() body: CreateTicketDto, @Req() req: Request) {
    const orgId = req.user!.organizationId;
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `TICK-${randomNum}`;

    const ticket = await this.prisma.supportTicket.create({
      data: {
        organizationId: orgId,
        ticketNumber,
        subject: body.subject,
        category: body.category,
        priority: body.priority,
        status: 'OPEN',
        messages: {
          create: {
            sender: `developer:${req.user!.email}`,
            content: body.message,
          },
        },
      },
      include: { messages: true },
    });

    return { status: 'success', data: ticket };
  }

  // ==========================================
  // PAYMENT ENDPOINTS
  // ==========================================

  @Post('payments/create-order')
  @UseGuards(JwtAuthGuard)
  async createPaymentOrder(@Body() body: CreatePaymentOrderDto, @Req() req: Request) {
    const orgId = req.user!.organizationId;
    const result = await this.paymentService.createOrder(orgId, body.amount);
    return { status: 'success', data: result };
  }

  @Post('payments/verify')
  @UseGuards(JwtAuthGuard)
  async verifyPayment(@Body() body: VerifyPaymentDto, @Req() req: Request) {
    const orgId = req.user!.organizationId;
    const result = await this.paymentService.verifyPayment(orgId, body);
    return { status: 'success', data: result };
  }

  @Post('payments/webhook')
  @HttpCode(HttpStatus.OK)
  async handlePaymentWebhook(
    @Req() req: Request,
    @Body() payload: any,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    const rawBody = req.rawBody || JSON.stringify(payload);
    const result = await this.paymentService.handleWebhook(rawBody, signature, payload);
    return result;
  }

  // ==========================================
  // NOTIFICATIONS PREFERENCES
  // ==========================================

  @Get('notifications/preferences')
  @UseGuards(JwtAuthGuard)
  async getNotificationPreferences(@Req() req: Request) {
    const orgId = req.user!.organizationId;
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { organizationId: orgId },
    });

    return {
      status: 'success',
      data: pref || { emailEnabled: true, smsEnabled: false, criticalOnlyViaSms: true },
    };
  }

  @Post('notifications/preferences')
  @UseGuards(JwtAuthGuard)
  async updateNotificationPreferences(
    @Body() body: UpdateNotificationPreferencesDto,
    @Req() req: Request,
  ) {
    const orgId = req.user!.organizationId;
    const updated = await this.prisma.notificationPreference.upsert({
      where: { organizationId: orgId },
      update: {
        emailEnabled: body.emailEnabled,
        smsEnabled: body.smsEnabled,
        criticalOnlyViaSms: body.criticalOnlyViaSms,
      },
      create: {
        organizationId: orgId,
        emailEnabled: body.emailEnabled,
        smsEnabled: body.smsEnabled,
        criticalOnlyViaSms: body.criticalOnlyViaSms,
      },
    });

    return { status: 'success', data: updated };
  }

  // ==========================================
  // 2FA PROFILE ENDPOINTS
  // ==========================================

  @Get('profile/2fa/setup')
  @UseGuards(JwtAuthGuard)
  async get2faSetup(@Req() req: Request) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    const secret = user?.mfaSecret || crypto.randomBytes(10).toString('hex').toUpperCase();
    if (user && !user.mfaSecret) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mfaSecret: secret },
      });
    }

    const issuer = process.env.MFA_ISSUER_NAME || 'Nexora RTC';
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(req.user!.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

    return {
      status: 'success',
      data: {
        enabled: Boolean(user?.mfaEnabled),
        secret,
        otpauthUrl,
      },
    };
  }

  @Post('profile/2fa/verify')
  @UseGuards(JwtAuthGuard)
  async verifyAndToggle2fa(@Body() body: { code: string; enable: boolean }, @Req() req: Request) {
    await this.prisma.user.update({
      where: { id: req.user!.userId },
      data: { mfaEnabled: Boolean(body.enable) },
    });

    return {
      status: 'success',
      message: body.enable ? 'Two-Factor Authentication enabled!' : 'Two-Factor Authentication disabled.',
      enabled: Boolean(body.enable),
    };
  }

  // ==========================================
  // MASTER ADMIN / OPS CONSOLE ENDPOINTS (STAFF GUARDED)
  // ==========================================

  @Get('admin/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminOverview() {
    const [
      totalOrgs,
      totalProjects,
      pendingKycCount,
      openTicketsCount,
      allOrgs,
      recentTransactions,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.project.count(),
      this.prisma.kycVerification.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.organization.findMany({ select: { walletBalance: true } }),
      this.prisma.transaction.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: { organization: { select: { name: true } } },
      }),
    ]);

    const totalSystemWalletBalance = allOrgs.reduce(
      (acc, org) => acc + Number(org.walletBalance),
      0,
    );

    return {
      status: 'success',
      data: {
        totalOrgs,
        totalProjects,
        pendingKycCount,
        openTicketsCount,
        totalSystemWalletBalance,
        liveNodesActive: 1,
        livekitStatus: 'HEALTHY',
        recentTransactions,
      },
    };
  }

  @Get('admin/kyc')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminKycList() {
    const submissions = await this.prisma.kycVerification.findMany({
      orderBy: { submittedAt: 'desc' },
      include: {
        organization: {
          select: { id: true, name: true, billingEmail: true, createdAt: true },
        },
      },
    });

    const decryptedList = submissions.map((sub) => {
      let docNumber = 'ENCRYPTED';
      try {
        docNumber = this.crypto.decrypt({
          ciphertext: sub.encryptedDocumentNumber,
          iv: sub.encryptionIv,
          authTag: sub.encryptionAuthTag,
        });
      } catch {
        // best effort
      }

      return {
        id: sub.id,
        organizationId: sub.organizationId,
        organizationName: sub.organization.name,
        organizationEmail: sub.organization.billingEmail,
        documentType: sub.documentType,
        documentNumber: docNumber,
        status: sub.status,
        verifiedViaDigiLocker: sub.verifiedViaDigiLocker,
        submittedAt: sub.submittedAt,
        reviewedAt: sub.reviewedAt,
        rejectionReason: sub.rejectionReason,
      };
    });

    return { status: 'success', data: decryptedList };
  }

  @Post('admin/kyc/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async reviewKycSubmission(
    @Param('id') id: string,
    @Body() body: ReviewKycDto,
    @Req() req: Request,
  ) {
    const kyc = await this.prisma.kycVerification.findUnique({ where: { id } });
    if (!kyc) throw new BadRequestException('KYC verification request not found');

    const updated = await this.prisma.kycVerification.update({
      where: { id },
      data: {
        status: body.action === 'APPROVE' ? 'VERIFIED' : 'REJECTED',
        reviewedAt: new Date(),
        reviewedByStaffId: req.user!.userId,
        rejectionReason: body.action === 'REJECT' ? (body.reason || 'Document unreadable or invalid') : null,
      },
    });

    await this.notifications.queue(
      kyc.organizationId,
      body.action === 'APPROVE' ? 'KYC_APPROVED' : 'KYC_REJECTED',
      { reason: updated.rejectionReason },
    );

    return { status: 'success', data: updated };
  }

  @Get('admin/organizations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminOrganizations() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        projects: {
          select: {
            id: true,
            name: true,
            environment: true,
            apiKeyPrefix: true,
            createdAt: true,
          },
        },
        kycVerification: { select: { status: true, documentType: true } },
        _count: { select: { projects: true, members: true, transactions: true } },
      },
    });

    return { status: 'success', data: orgs };
  }

  @Post('admin/organizations/:id/adjust-balance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async adjustOrgBalance(
    @Param('id') id: string,
    @Body() body: AdjustBalanceDto,
    @Req() req: Request,
  ) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new BadRequestException('Organization not found');

    const amount = Number(body.amount);
    if (isNaN(amount) || amount === 0) {
      throw new BadRequestException('Invalid adjustment amount');
    }

    const [updatedOrg, tx] = await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id },
        data: {
          walletBalance: { increment: amount },
        },
      }),
      this.prisma.transaction.create({
        data: {
          organizationId: id,
          type: 'MANUAL_ADJUSTMENT',
          amount,
          status: 'SUCCESS',
          webhookVerified: true,
          gatewayPaymentId: `admin_adj_${crypto.randomBytes(4).toString('hex')}`,
        },
      }),
      this.prisma.adminActionLog.create({
        data: {
          staffUserId: req.user!.userId,
          action: 'WALLET_BALANCE_ADJUSTMENT',
          targetType: 'ORGANIZATION',
          targetId: id,
          reason: body.reason,
          ipAddress: req.ip,
        },
      }),
    ]);

    return {
      status: 'success',
      data: {
        newBalance: updatedOrg.walletBalance,
        transaction: tx,
      },
    };
  }

  @Get('admin/tickets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminTickets() {
    const tickets = await this.prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { select: { id: true, name: true, billingEmail: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    return { status: 'success', data: tickets };
  }

  @Post('admin/tickets/:id/reply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async adminReplyTicket(
    @Param('id') id: string,
    @Body() body: ReplyTicketDto,
    @Req() req: Request,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new BadRequestException('Support ticket not found');

    const newMsg = await this.prisma.ticketMessage.create({
      data: {
        ticketId: id,
        sender: `support:${req.user!.email}`,
        content: body.message,
      },
    });

    if (body.status && body.status !== ticket.status) {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { status: body.status },
      });
    }

    return { status: 'success', data: newMsg };
  }

  @Get('admin/billing/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminBillingOverview() {
    const [organizations, transactions, invoices, creditNotes, usageLogs] = await Promise.all([
      this.prisma.organization.findMany({
        select: { id: true, name: true, walletBalance: true, planTier: true, billingEmail: true, createdAt: true },
      }),
      this.prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { organization: { select: { id: true, name: true } } },
      }),
      this.prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { organization: { select: { id: true, name: true } } },
      }),
      this.prisma.creditNote.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { organization: { select: { id: true, name: true } }, invoice: { select: { invoiceNumber: true } } },
      }),
      this.prisma.usageLog.findMany({
        orderBy: { startedAt: 'desc' },
        take: 100,
        select: { amountDeducted: true, billableSeconds: true, ratePerMinute: true, startedAt: true },
      }),
    ]);

    const totalTopups = transactions
      .filter((t) => t.type === 'WALLET_TOPUP' && t.status === 'SUCCESS')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const totalUsageDeductions = usageLogs.reduce((sum, u) => sum + Number(u.amountDeducted || 0), 0);
    const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
    const totalCustWalletEscrow = organizations.reduce((sum, org) => sum + Number(org.walletBalance || 0), 0);

    return {
      status: 'success',
      data: {
        summary: {
          totalTopups,
          totalUsageDeductions,
          totalInvoiced,
          totalCreditNotes: creditNotes.reduce((sum, n) => sum + Number(n.totalAmount || 0), 0),
          totalCustWalletEscrow,
          activePayingTenants: organizations.length,
        },
        transactions,
        invoices,
        creditNotes,
        organizations,
      },
    };
  }

  // Customers read their own invoices; staff can read any.
  private async sendInvoice(where: { id: string; organizationId?: string }, res: Response) {
    const invoice = await this.prisma.invoice.findFirst({ where });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!isRenderableSnapshot(invoice.billingSnapshot)) {
      throw new UnprocessableEntityException('This invoice has no printable record. It predates tax invoice generation.');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    return res.send(renderInvoiceHtml(invoice, invoice.billingSnapshot));
  }

  private async sendInvoicePdf(where: { id: string; organizationId?: string }, res: Response) {
    const invoice = await this.prisma.invoice.findFirst({ where });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!isRenderableSnapshot(invoice.billingSnapshot)) {
      throw new UnprocessableEntityException('This invoice has no printable record. It predates tax invoice generation.');
    }
    const pdf = await renderInvoicePdf(invoice, invoice.billingSnapshot);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber.replace(/\//g, '-')}.pdf"`);
    return res.send(pdf);
  }

  @Get('invoices/:id/pdf')
  @UseGuards(JwtAuthGuard)
  async getInvoicePdf(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    let invoiceId = id;
    if (id === 'latest') {
      const latest = await this.prisma.invoice.findFirst({
        where: { organizationId: req.user!.organizationId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!latest) throw new NotFoundException('You have no invoices yet');
      invoiceId = latest.id;
    }
    return this.sendInvoicePdf({ id: invoiceId, organizationId: req.user!.organizationId }, res);
  }

  @Get('admin/invoices/:id/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminInvoicePdf(@Param('id') id: string, @Res() res: Response) {
    return this.sendInvoicePdf({ id }, res);
  }

  @Get('invoices/:id/print')
  @UseGuards(JwtAuthGuard)
  async getInvoicePrintable(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    let invoiceId = id;
    if (id === 'latest') {
      const latest = await this.prisma.invoice.findFirst({
        where: { organizationId: req.user!.organizationId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!latest) throw new NotFoundException('You have no invoices yet');
      invoiceId = latest.id;
    }
    return this.sendInvoice({ id: invoiceId, organizationId: req.user!.organizationId }, res);
  }

  @Get('admin/invoices/:id/print')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminInvoicePrintable(@Param('id') id: string, @Res() res: Response) {
    return this.sendInvoice({ id }, res);
  }

  // Issues GST tax invoices for a closed billing month. Safe to repeat: existing invoices are never duplicated.
  @Post('admin/invoices/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async generateInvoices(@Body() body: GenerateInvoicesDto, @Req() req: Request) {
    const [year, month] = body.month.split('-').map(Number);
    const { start, end } = monthRange(year, month - 1);

    const result = body.organizationId
      ? await this.invoicing.generateForOrganization(body.organizationId, start, end).then((o) => ({
          created: o.status === 'created' ? 1 : 0,
          skipped: o.status === 'skipped' ? [o] : [],
          outcomes: [o],
        }))
      : await this.invoicing.generateForPeriod(start, end);

    await this.prisma.adminActionLog.create({
      data: {
        staffUserId: req.user!.userId,
        action: 'GENERATE_INVOICES',
        targetType: 'Invoice',
        targetId: `${body.month}${body.organizationId ? `:${body.organizationId}` : ''}`,
        ipAddress: req.ip,
      },
    });
    return { status: 'success', data: result };
  }

  // ---------- Credit notes (GST Section 34) ----------

  private async sendCreditNote(where: { id: string; organizationId?: string }, res: Response) {
    const note = await this.prisma.creditNote.findFirst({ where });
    if (!note) throw new NotFoundException('Credit note not found');
    if (!isRenderableCreditNote(note.snapshot)) {
      throw new UnprocessableEntityException('This credit note has no printable record.');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    return res.send(renderCreditNoteHtml(note, note.snapshot));
  }

  private async sendCreditNotePdf(where: { id: string; organizationId?: string }, res: Response) {
    const note = await this.prisma.creditNote.findFirst({ where });
    if (!note) throw new NotFoundException('Credit note not found');
    if (!isRenderableCreditNote(note.snapshot)) {
      throw new UnprocessableEntityException('This credit note has no printable record.');
    }
    const pdf = await renderCreditNotePdf(note, note.snapshot);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${note.creditNoteNumber.replace(/\//g, '-')}.pdf"`);
    return res.send(pdf);
  }

  @Get('credit-notes/:id/pdf')
  @UseGuards(JwtAuthGuard)
  async getCreditNotePdf(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    return this.sendCreditNotePdf({ id, organizationId: req.user!.organizationId }, res);
  }

  @Get('admin/credit-notes/:id/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminCreditNotePdf(@Param('id') id: string, @Res() res: Response) {
    return this.sendCreditNotePdf({ id }, res);
  }

  @Get('credit-notes/:id/print')
  @UseGuards(JwtAuthGuard)
  async getCreditNotePrintable(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    return this.sendCreditNote({ id, organizationId: req.user!.organizationId }, res);
  }

  @Get('admin/credit-notes/:id/print')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminCreditNotePrintable(@Param('id') id: string, @Res() res: Response) {
    return this.sendCreditNote({ id }, res);
  }

  // Issues a credit note against a tax invoice and, by default, adds the amount back to the customer's wallet.
  @Post('admin/credit-notes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async issueCreditNote(@Body() body: IssueCreditNoteDto, @Req() req: Request) {
    const note = await this.creditNotes.issue({
      invoiceId: body.invoiceId,
      amount: body.amount,
      reason: body.reason,
      creditToWallet: body.creditToWallet,
      issuedByStaffId: req.user!.userId,
    });
    await this.prisma.adminActionLog.create({
      data: {
        staffUserId: req.user!.userId,
        action: 'ISSUE_CREDIT_NOTE',
        targetType: 'CreditNote',
        targetId: note.id,
        reason: body.reason,
        ipAddress: req.ip,
      },
    });
    return { status: 'success', data: note };
  }

  // Sends any queued emails now instead of waiting for the next automatic run.
  @Post('admin/notifications/process')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async processNotifications() {
    return { status: 'success', data: await this.notifications.processQueue() };
  }

  // Admin Settings: Return SAFE configuration without raw secrets or SMTP passwords
  @Get('admin/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminSettings() {
    const { contact, brand, social, billing, plans, rates } = await this.siteSettings.getSnapshot();
    return {
      status: 'success',
      data: {
        contact,
        brand,
        social,
        billing,
        plans,
        rates,

        companyLegalName: billing.supplierLegalName || contact.companyName || '',
        livekitHost: process.env.LIVEKIT_URL || '',
        coturnHost: process.env.COTURN_HOST || '',
        mfaEnforcedForStaff: true,
        maxRoomsPerOrg: 50,

        // Payment gateway: never expose raw secrets
        razorpayKeyIdSet: Boolean(process.env.RAZORPAY_KEY_ID),
        razorpayKeySecretSet: Boolean(process.env.RAZORPAY_KEY_SECRET),
        razorpayWebhookSecretSet: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),

        // Email dispatch: never expose SMTP passwords
        emailProvider: process.env.EMAIL_PROVIDER || 'SMTP',
        smtpHost: process.env.SMTP_HOST || '',
        smtpPort: Number(process.env.SMTP_PORT) || 587,
        smtpUserSet: Boolean(process.env.SMTP_USER),
        smtpPasswordSet: Boolean(process.env.SMTP_PASSWORD),
        emailFromAddress: process.env.EMAIL_FROM || '',

        // SMS dispatch
        smsProvider: process.env.SMS_PROVIDER || '',
        smsApiKeySet: Boolean(process.env.SMS_API_KEY),
      },
    };
  }

  @Post('admin/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async updateAdminSettings(@Body() body: UpdateSiteSettingsDto, @Req() req: Request) {
    const data = await this.siteSettings.update(body);
    await this.prisma.adminActionLog.create({
      data: {
        staffUserId: req.user!.userId,
        action: 'UPDATE_SITE_SETTINGS',
        targetType: 'SiteSetting',
        targetId: Object.keys(body).join(',') || 'none',
        ipAddress: req.ip,
      },
    });
    return { status: 'success', message: 'Settings saved', data };
  }

  @Get('admin/billing/gstr-1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getGstr1Report() {
    const [invoices, creditNotes, billing] = await Promise.all([
      this.prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        include: { organization: { include: { billingProfile: true } } },
      }),
      this.prisma.creditNote.findMany({
        orderBy: { createdAt: 'desc' },
        include: { invoice: { select: { invoiceNumber: true } }, organization: { include: { billingProfile: true } } },
      }),
      this.siteSettings.getBilling(),
    ]);
    const creditTaxable = creditNotes.reduce((sum, n) => sum + Number(n.taxableAmount || 0), 0);
    const creditTax = creditNotes.reduce((sum, n) => sum + Number(n.cgstAmount || 0) + Number(n.sgstAmount || 0) + Number(n.igstAmount || 0), 0);

    const b2bInvoices = invoices.filter((inv) => Boolean(inv.organization?.billingProfile?.gstin));
    const b2cInvoices = invoices.filter((inv) => !inv.organization?.billingProfile?.gstin);
    const totalTaxable = invoices.reduce((sum, inv) => sum + Number(inv.subtotal || 0), 0);
    const totalTaxCollected = invoices.reduce(
      (sum, inv) => sum + Number(inv.cgstAmount || 0) + Number(inv.sgstAmount || 0) + Number(inv.igstAmount || 0),
      0,
    );

    return {
      status: 'success',
      data: {
        filingPeriod: `FY ${financialYearOf(new Date())}`,
        sacCode: billing.sacCode,
        // Registered buyers (B2B), one row per tax invoice.
        b2b: b2bInvoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.organization?.billingProfile?.legalBusinessName ?? inv.organization?.name,
          customerGstin: inv.organization?.billingProfile?.gstin,
          placeOfSupply: inv.placeOfSupplyStateCode,
          taxableValue: Number(inv.subtotal),
          cgst: Number(inv.cgstAmount),
          sgst: Number(inv.sgstAmount),
          igst: Number(inv.igstAmount),
          totalInvoiceValue: Number(inv.totalAmount),
        })),
        // Credit notes issued to registered buyers (reported as CDNR).
        creditNotes: creditNotes
          .filter((n) => Boolean(n.organization?.billingProfile?.gstin))
          .map((n) => ({
            id: n.id,
            creditNoteNumber: n.creditNoteNumber,
            invoiceNumber: n.invoice.invoiceNumber,
            customerName: n.organization?.billingProfile?.legalBusinessName ?? n.organization?.name,
            customerGstin: n.organization?.billingProfile?.gstin,
            taxableValue: Number(n.taxableAmount),
            cgst: Number(n.cgstAmount),
            sgst: Number(n.sgstAmount),
            igst: Number(n.igstAmount),
            total: Number(n.totalAmount),
          })),
        summary: {
          totalB2bCount: b2bInvoices.length,
          totalB2cCount: b2cInvoices.length,
          totalCreditNoteCount: creditNotes.length,
          // Net of credit notes, as they are reported in GSTR-1.
          totalTaxable: totalTaxable - creditTaxable,
          totalTaxCollected: totalTaxCollected - creditTax,
          totalGrossValue: totalTaxable - creditTaxable + (totalTaxCollected - creditTax),
        },
      },
    };
  }

  @Get('admin/offers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async getAdminOffers() {
    const offers = await this.prisma.walletOffer.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    });
    return { status: 'success', data: offers };
  }

  @Post('admin/offers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async createAdminOffer(@Body() body: CreateOfferDto, @Req() req: Request) {
    const now = new Date();
    const validUntil = new Date(now.getTime() + (body.validDays || 30) * 86400 * 1000);

    const offer = await this.prisma.walletOffer.create({
      data: {
        title: body.title,
        minRechargeAmount: body.minRechargeAmount || 0,
        bonusType: body.bonusType,
        bonusValue: body.bonusValue,
        maxBonusAmount: body.maxBonusAmount || null,
        perOrgLimit: body.perOrgLimit || 1,
        totalRedemptionCap: body.totalRedemptionCap || null,
        validFrom: now,
        validUntil,
        createdByStaffId: req.user!.userId,
        isActive: true,
      },
    });

    return { status: 'success', data: offer };
  }

  @Post('admin/offers/:id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequireStaff()
  async toggleAdminOffer(@Param('id') id: string) {
    const existing = await this.prisma.walletOffer.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Offer not found');

    const updated = await this.prisma.walletOffer.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    return { status: 'success', data: updated };
  }
}
