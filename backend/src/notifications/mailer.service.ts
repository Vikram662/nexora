import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}

/** Thin SMTP wrapper. Settings come from the environment: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM. */
@Injectable()
export class MailerService {
  private transporter?: Transporter;

  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
  }

  async send(email: OutgoingEmail): Promise<{ messageId: string }> {
    if (!this.isConfigured()) {
      throw new Error('Email is not configured. Set SMTP_HOST and EMAIL_FROM.');
    }
    if (!this.transporter) {
      const port = Number(process.env.SMTP_PORT) || 587;
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' } : undefined,
      });
    }
    const info = await this.transporter.sendMail({ from: process.env.EMAIL_FROM, ...email });
    return { messageId: String(info.messageId ?? '') };
  }
}
