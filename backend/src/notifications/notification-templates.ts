import type { OutgoingEmail } from './mailer.service.js';

export interface TemplateContext {
  siteName: string;
  organizationName: string;
  /** Public web app URL, when configured (APP_URL). Used for links only. */
  appUrl?: string;
}

export interface TemplateAttachment {
  filename: string;
  content: string | Buffer;
  contentType: string;
}

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const rupees = (value: unknown) =>
  `₹${Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function wrap(ctx: TemplateContext, heading: string, paragraphs: string[], link?: { label: string; path: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${esc(p)}</p>`).join('');
  const cta =
    link && ctx.appUrl
      ? `<p style="margin:16px 0 0"><a href="${esc(ctx.appUrl.replace(/\/+$/, ''))}${esc(link.path)}" style="color:#2a3fe0">${esc(link.label)}</a></p>`
      : '';
  const html = `<div style="font-family:system-ui,sans-serif;color:#171b34;max-width:560px"><h2 style="margin:0 0 16px">${esc(heading)}</h2>${body}${cta}<p style="margin:24px 0 0;color:#566079;font-size:12px">${esc(ctx.siteName)}</p></div>`;
  const text = `${heading}\n\n${paragraphs.join('\n\n')}${link && ctx.appUrl ? `\n\n${link.label}: ${ctx.appUrl.replace(/\/+$/, '')}${link.path}` : ''}\n\n${ctx.siteName}`;
  return { html, text };
}

type Payload = Record<string, unknown>;

/** Builds the email for a notification type. Returns null for types with no email template. */
export function buildEmail(
  type: string,
  payload: Payload,
  ctx: TemplateContext,
  attachment?: TemplateAttachment,
): Omit<OutgoingEmail, 'to'> | null {
  const attachments = attachment ? [{ filename: attachment.filename, content: attachment.content, contentType: attachment.contentType }] : undefined;

  switch (type) {
    case 'LOW_BALANCE': {
      const { html, text } = wrap(
        ctx,
        'Your wallet balance is low',
        [
          `${ctx.organizationName} has ${rupees(payload.balance)} left in its wallet.`,
          'Production rooms stop accepting new tokens when the balance cannot cover the first block of a session. Add money to keep calls running.',
        ],
        { label: 'Add money', path: '/user/billing' },
      );
      return { subject: 'Your wallet balance is low', html, text };
    }
    case 'PAYMENT_RECEIVED': {
      const { html, text } = wrap(
        ctx,
        'Payment received',
        [`We added ${rupees(payload.amount)} to the wallet of ${ctx.organizationName}.`, payload.paymentId ? `Payment reference: ${payload.paymentId}` : ''].filter(Boolean),
        { label: 'View wallet', path: '/user/billing' },
      );
      return { subject: `Payment received: ${rupees(payload.amount)}`, html, text };
    }
    case 'INVOICE_GENERATED': {
      const { html, text } = wrap(
        ctx,
        'Your GST tax invoice is ready',
        [
          `Invoice ${payload.invoiceNumber} for ${payload.period} is attached. The total is ${rupees(payload.total)}, including GST.`,
          'It covers the sessions charged to your wallet in that month.',
        ],
        { label: 'View invoices', path: '/user/billing' },
      );
      return { subject: `Tax invoice ${payload.invoiceNumber}`, html, text, attachments };
    }
    case 'REFUND_PROCESSED': {
      const { html, text } = wrap(
        ctx,
        'A credit note was issued',
        [
          `Credit note ${payload.creditNoteNumber} for ${rupees(payload.total)} was issued against invoice ${payload.invoiceNumber}.`,
          payload.creditedToWallet ? 'The amount was added back to your wallet.' : 'The amount was not added to your wallet.',
          payload.reason ? `Reason: ${payload.reason}` : '',
        ].filter(Boolean),
        { label: 'View wallet', path: '/user/billing' },
      );
      return { subject: `Credit note ${payload.creditNoteNumber}`, html, text, attachments };
    }
    case 'WELCOME': {
      const { html, text } = wrap(
        ctx,
        `Welcome to ${ctx.siteName}`,
        [
          `${ctx.organizationName} is ready. Create a project to get an API key, then try a call in the sandbox.`,
          'Sandbox projects are not billed. Add money to your wallet when you are ready for production.',
        ],
        { label: 'Open console', path: '/user' },
      );
      return { subject: `Welcome to ${ctx.siteName}`, html, text };
    }
    case 'API_KEY_ROTATED': {
      const { html, text } = wrap(
        ctx,
        'An API secret was rotated',
        [
          `The secret for project "${payload.projectName}" in ${ctx.organizationName} was rotated${payload.ip ? ` from IP address ${payload.ip}` : ''}.`,
          payload.graceWindowExpiresAt
            ? `The previous secret keeps working until ${payload.graceWindowExpiresAt}. Update your servers before then.`
            : 'Update your servers with the new secret.',
          'If you did not do this, sign in and rotate the secret again, then review your team members.',
        ],
        { label: 'Open projects', path: '/user/projects' },
      );
      return { subject: `API secret rotated for ${payload.projectName}`, html, text };
    }
    case 'WEBHOOK_ENDPOINT_DEGRADED': {
      const { html, text } = wrap(
        ctx,
        'A webhook endpoint keeps failing',
        [
          `The last 5 deliveries to ${payload.url} for project "${payload.projectName}" failed.`,
          'Events are still recorded, but your server is not receiving them. Check that the URL is reachable and returns a 2xx response.',
        ],
        { label: 'Open webhooks', path: '/user/webhooks' },
      );
      return { subject: `Webhook endpoint failing for ${payload.projectName}`, html, text };
    }
    case 'SECURITY_ALERT': {
      const { html, text } = wrap(
        ctx,
        'Repeated failed API sign-ins',
        [
          `Project "${payload.projectName}" (${payload.apiKeyPrefix}) had ${payload.attempts} failed API authentication attempts${payload.ip ? `, the latest from ${payload.ip}` : ''}.`,
          `The key is locked for ${payload.lockMinutes} minutes for that address. If this was not you, rotate the project secret.`,
        ],
        { label: 'Open projects', path: '/user/projects' },
      );
      return { subject: `Security alert for ${payload.projectName}`, html, text };
    }
    case 'PLAN_LIMIT_REACHED': {
      const { html, text } = wrap(
        ctx,
        'A project reached its room limit',
        [
          `Project "${payload.projectName}" tried to open more than ${payload.limit} rooms at once, so the request was refused.`,
          'Close rooms you no longer use, or contact us to raise the limit.',
        ],
        { label: 'Open projects', path: '/user/projects' },
      );
      return { subject: `Room limit reached for ${payload.projectName}`, html, text };
    }
    case 'KYC_APPROVED': {
      const { html, text } = wrap(ctx, 'Your business is verified', [`${ctx.organizationName} passed verification. Production limits and GST tax invoices are now available.`], {
        label: 'Open console',
        path: '/user',
      });
      return { subject: 'Your business is verified', html, text };
    }
    case 'KYC_REJECTED': {
      const { html, text } = wrap(
        ctx,
        'We could not verify your business',
        [payload.reason ? `Reason: ${payload.reason}` : 'The document could not be verified.', 'Submit a clearer document to try again.'],
        { label: 'Open verification', path: '/user/kyc' },
      );
      return { subject: 'We could not verify your business', html, text };
    }
    default:
      return null;
  }
}

/** Types that are urgent enough to send by SMS even when the organization asked for critical alerts only. */
export const CRITICAL_SMS_TYPES = new Set(['LOW_BALANCE', 'API_KEY_ROTATED', 'SECURITY_ALERT']);

// DLT variable values are limited to about 30 characters, so keep them short.
const short = (v: unknown) => String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, 30);
const inr = (v: unknown) => Number(v ?? 0).toFixed(2);

const SMS_VARIABLES: Record<string, (payload: Record<string, unknown>) => Record<string, string>> = {
  LOW_BALANCE: (p) => ({ balance: inr(p.balance) }),
  PAYMENT_RECEIVED: (p) => ({ amount: inr(p.amount) }),
  API_KEY_ROTATED: (p) => ({ project: short(p.projectName) }),
  SECURITY_ALERT: (p) => ({ project: short(p.projectName) }),
  WEBHOOK_ENDPOINT_DEGRADED: (p) => ({ project: short(p.projectName) }),
  KYC_APPROVED: () => ({}),
  KYC_REJECTED: () => ({}),
};

/** Values for a type's SMS template variables. Returns null for types that are only sent by email. */
export function smsVariables(type: string, payload: Record<string, unknown>): Record<string, string> | null {
  return SMS_VARIABLES[type]?.(payload) ?? null;
}
