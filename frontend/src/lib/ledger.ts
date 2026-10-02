import type { LedgerTransaction } from './types';

/** Usage deductions are stored as positive amounts but take money out of the wallet. */
export function signedAmount(tx: Pick<LedgerTransaction, 'type' | 'amount'>): number {
  const amount = Number(tx.amount);
  return tx.type === 'USAGE_DEDUCTION' ? -Math.abs(amount) : amount;
}

/** "+₹1,500.00" or "−₹250.00". */
export function formatSignedInr(amount: number): string {
  const abs = Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? '−' : '+'}₹${abs}`;
}
