import { BadRequestException, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { financialYearOf, formatCreditNoteNumber, splitInclusiveTotal, toPaise } from './invoice-math.js';
import { isRenderableSnapshot } from './invoice.render.js';
import type { CreditNoteSnapshot } from './credit-note.render.js';

export interface IssueCreditNoteInput {
  invoiceId: string;
  /** GST-inclusive amount to credit, in rupees. */
  amount: number;
  reason: string;
  issuedByStaffId?: string;
  /** Add the amount back to the customer's wallet (default). Turn off when it is settled outside the wallet. */
  creditToWallet?: boolean;
  now?: Date;
}

@Injectable()
export class CreditNoteService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async issue(input: IssueCreditNoteInput) {
    const now = input.now ?? new Date();
    const reason = input.reason.trim();
    const creditToWallet = input.creditToWallet ?? true;
    const totalPaise = toPaise(input.amount);
    if (!(totalPaise > 0)) throw new BadRequestException('The credit amount must be more than zero.');
    if (reason.length < 5) throw new BadRequestException('Give a reason of at least 5 characters. It is printed on the credit note.');

    const invoice = await this.prisma.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (!isRenderableSnapshot(invoice.billingSnapshot)) {
      throw new UnprocessableEntityException('This invoice has no tax invoice record, so a credit note cannot refer to it.');
    }
    const invoiceSnapshot = invoice.billingSnapshot;

    const note = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.creditNote.findMany({
        where: { invoiceId: invoice.id },
        select: { taxableAmount: true, cgstAmount: true, sgstAmount: true, igstAmount: true, totalAmount: true },
      });
      const sum = (pick: (n: (typeof previous)[number]) => unknown) => previous.reduce((acc, n) => acc + toPaise(Number(pick(n))), 0);
      const creditedPaise = sum((n) => n.totalAmount);
      const invoicePaise = toPaise(Number(invoice.totalAmount));
      const remainingPaise = invoicePaise - creditedPaise;
      if (totalPaise > remainingPaise) {
        throw new BadRequestException(
          `The credit exceeds what is left on invoice ${invoice.invoiceNumber}. ₹${(remainingPaise / 100).toFixed(2)} can still be credited.`,
        );
      }

      // Same tax treatment as the original invoice. The last credit takes exactly what is left,
      // so the credit notes always add up to the invoice to the paisa.
      const intraState = toPaise(Number(invoice.igstAmount)) === 0;
      const split =
        totalPaise === remainingPaise
          ? {
              taxablePaise: toPaise(Number(invoice.subtotal)) - sum((n) => n.taxableAmount),
              cgstPaise: toPaise(Number(invoice.cgstAmount)) - sum((n) => n.cgstAmount),
              sgstPaise: toPaise(Number(invoice.sgstAmount)) - sum((n) => n.sgstAmount),
              igstPaise: toPaise(Number(invoice.igstAmount)) - sum((n) => n.igstAmount),
            }
          : splitInclusiveTotal(totalPaise, invoiceSnapshot.gstPercent, intraState);

      const financialYear = financialYearOf(now);
      const counter = await tx.invoiceCounter.upsert({
        where: { financialYear: `CN-${financialYear}` },
        create: { financialYear: `CN-${financialYear}`, lastSerial: 1 },
        update: { lastSerial: { increment: 1 } },
      });
      const creditNoteNumber = formatCreditNoteNumber(financialYear, counter.lastSerial);

      const snapshot: CreditNoteSnapshot = {
        supplier: invoiceSnapshot.supplier,
        recipient: invoiceSnapshot.recipient,
        sacCode: invoiceSnapshot.sacCode,
        gstPercent: invoiceSnapshot.gstPercent,
        placeOfSupply: invoiceSnapshot.placeOfSupply,
        reason,
        issuedAt: now.toISOString(),
        originalInvoice: { number: invoice.invoiceNumber, date: invoice.createdAt.toISOString() },
        creditedToWallet: creditToWallet,
      };

      const created = await tx.creditNote.create({
        data: {
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          creditNoteNumber,
          financialYear,
          serial: counter.lastSerial,
          reason,
          taxableAmount: split.taxablePaise / 100,
          cgstAmount: split.cgstPaise / 100,
          sgstAmount: split.sgstPaise / 100,
          igstAmount: split.igstPaise / 100,
          totalAmount: totalPaise / 100,
          snapshot: snapshot as never,
          issuedByStaffId: input.issuedByStaffId,
        },
      });

      if (creditToWallet) {
        const org = await tx.organization.update({
          where: { id: invoice.organizationId },
          data: { walletBalance: { increment: totalPaise / 100 } },
          select: { walletBalance: true },
        });
        await tx.transaction.create({
          data: {
            organizationId: invoice.organizationId,
            type: 'REFUND',
            amount: totalPaise / 100,
            status: 'SUCCESS',
            balanceAfter: org.walletBalance,
          },
        });
      }
      return created;
    });

    await this.notifications?.queue(invoice.organizationId, 'REFUND_PROCESSED', {
      creditNoteId: note.id,
      creditedToWallet: creditToWallet,
    });
    return note;
  }
}
