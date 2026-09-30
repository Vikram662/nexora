// Pure GST helpers. All money is handled in paise (integers) so totals always add up exactly.

export interface TaxSplit {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

/**
 * The wallet is debited GST-inclusive, so the invoice backs the tax out of the total:
 * taxable = total / (1 + rate). Intra-state supplies split tax equally into CGST and SGST
 * (any odd paisa goes to SGST); inter-state supplies carry it all as IGST.
 */
export function splitInclusiveTotal(totalPaise: number, gstPercent: number, intraState: boolean): TaxSplit {
  const taxablePaise = Math.round(totalPaise / (1 + gstPercent / 100));
  const taxPaise = totalPaise - taxablePaise;
  if (intraState) {
    const cgstPaise = Math.floor(taxPaise / 2);
    return { taxablePaise, cgstPaise, sgstPaise: taxPaise - cgstPaise, igstPaise: 0, totalPaise };
  }
  return { taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise, totalPaise };
}

/** Indian financial year (April to March) as "2026-27". */
export function financialYearOf(date: Date): string {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Rule 46 allows at most 16 characters of letters, digits, "/" and "-": e.g. NXR/2627/000123. */
export function formatInvoiceNumber(financialYear: string, serial: number): string {
  const compact = `${financialYear.slice(2, 4)}${financialYear.slice(5, 7)}`;
  return `NXR/${compact}/${String(serial).padStart(6, '0')}`;
}

/** Credit notes run their own consecutive series, e.g. NXC/2627/000001. */
export function formatCreditNoteNumber(financialYear: string, serial: number): string {
  const compact = `${financialYear.slice(2, 4)}${financialYear.slice(5, 7)}`;
  return `NXC/${compact}/${String(serial).padStart(6, '0')}`;
}

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatRupees(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** First instant of the month (UTC) and the first instant of the following month. */
export function monthRange(year: number, monthIndex: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

// GST state codes (Schedule of state and UT codes) used for place of supply.
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};
