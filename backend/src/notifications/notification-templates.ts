import type { OutgoingEmail } from './mailer.service.js';

export interface TemplateContext {
  siteName: string;
  organizationName: string;
  /** Public web app URL, when configured (APP_URL). Used for links only. */
  appUrl?: string;
}

export interface TemplateAttachment {
  filename: string;
  content: string;
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
  const attachments = attachment ? [{ filename: attachment.filename, content: attachment.content, contentType: 'text/html' }] : undefined;

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
