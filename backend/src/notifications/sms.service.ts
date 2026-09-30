import { Injectable } from '@nestjs/common';

export interface OutgoingSms {
  /** Mobile number in international format, e.g. +919876543210. */
  to: string;
  /** Notification type, e.g. LOW_BALANCE. Selects the DLT template. */
  type: string;
  /** Values for the template's ##variables##. */
  variables: Record<string, string>;
}

/**
 * SMS over MSG91 (Flow API). Indian SMS must use DLT-approved templates, so each notification type has its own
 * template id, set in the environment:
 *
 *   SMS_PROVIDER=MSG91
 *   SMS_API_KEY=<MSG91 authkey>
 *   MSG91_TEMPLATE_LOW_BALANCE=<template id>          variable: ##balance##
 *   MSG91_TEMPLATE_PAYMENT_RECEIVED=<template id>     variable: ##amount##
 *   MSG91_TEMPLATE_API_KEY_ROTATED=<template id>      variable: ##project##
 *   MSG91_TEMPLATE_SECURITY_ALERT=<template id>       variable: ##project##
 *   MSG91_TEMPLATE_WEBHOOK_ENDPOINT_DEGRADED=<id>     variable: ##project##
 *   MSG91_TEMPLATE_KYC_APPROVED=<template id>         no variables
 *   MSG91_TEMPLATE_KYC_REJECTED=<template id>         no variables
 *
 * A type without a template id is simply not sent by SMS.
 */
@Injectable()
export class SmsService {
  isConfigured(): boolean {
    return process.env.SMS_PROVIDER?.toUpperCase() === 'MSG91' && Boolean(process.env.SMS_API_KEY?.trim());
  }

  private templateFor(type: string): string | undefined {
    return process.env[`MSG91_TEMPLATE_${type}`]?.trim() || undefined;
  }

  /** True when SMS is set up for this notification type (provider is MSG91 and the type has a template). */
  supports(type: string): boolean {
    return process.env.SMS_PROVIDER?.toUpperCase() === 'MSG91' && Boolean(this.templateFor(type));
  }

  async send(sms: OutgoingSms): Promise<{ messageId: string }> {
    if (!this.isConfigured()) {
      throw new Error('SMS is not configured. Set SMS_PROVIDER=MSG91 and SMS_API_KEY.');
    }
    const templateId = this.templateFor(sms.type);
    if (!templateId) {
      throw new Error(`No MSG91 template id for ${sms.type}. Set MSG91_TEMPLATE_${sms.type}.`);
    }

    const res = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: process.env.SMS_API_KEY!.trim(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        short_url: '0',
        // MSG91 wants the country code without the plus sign.
        recipients: [{ mobiles: sms.to.replace(/^\+/, ''), ...sms.variables }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const json: any = await res.json().catch(() => ({}));
    // MSG91 can answer 200 with {"type":"error"}, so check the body as well as the status.
    if (!res.ok || json?.type === 'error') {
      throw new Error(json?.message || `MSG91 rejected the message (${res.status}).`);
    }
    return { messageId: String(json.message ?? '') };
  }
}
