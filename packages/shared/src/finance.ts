/**
 * Money rules, as pure functions so they can be unit tested. All money is integer paisa
 * (NPR x 100): floats cannot represent amounts like 0.10 exactly, and paisa never round.
 */

export const INVOICE_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ['ESEWA', 'KHALTI', 'CASH', 'BANK'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['INITIATED', 'SUCCESS', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FINE_TYPES = ['FIXED', 'PER_DAY'] as const;
export type FineType = (typeof FINE_TYPES)[number];

/** Khalti refuses less than this. */
export const KHALTI_MIN_PAISA = 1000;

const NUMBER_FORMAT = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123450 becomes "Rs. 1,234.50". */
export const formatNpr = (paisa: number) => `Rs. ${NUMBER_FORMAT.format(paisa / 100)}`;

/** Parses a typed amount like "1,234.50" into paisa. Null if it is not a valid amount. */
export function rupeesToPaisa(value: string | number): number | null {
  const text = String(value).replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole = '0', fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export interface InvoiceAmounts {
  totalPaisa: number;
  finePaisa: number;
  discountPaisa: number;
  paidPaisa: number;
}

/** What is still owed. Never negative, even if a discount exceeds the balance. */
export const outstandingPaisa = (invoice: InvoiceAmounts) =>
  Math.max(0, invoice.totalPaisa + invoice.finePaisa - invoice.discountPaisa - invoice.paidPaisa);

export interface FineRuleInput {
  type: FineType;
  amountPaisa: number;
  graceDays: number;
  maxPaisa?: number | null;
}

/**
 * The fine for an invoice some days late. Nothing during the grace days. After that a
 * FIXED rule charges once, and a PER_DAY rule charges for each day beyond the grace days.
 * Either way the cap applies if there is one.
 */
export function calculateFine(rule: FineRuleInput, daysLate: number) {
  const chargeableDays = daysLate - rule.graceDays;
  if (chargeableDays <= 0) return 0;
  const fine = rule.type === 'FIXED' ? rule.amountPaisa : rule.amountPaisa * chargeableDays;
  return rule.maxPaisa === null || rule.maxPaisa === undefined
    ? fine
    : Math.min(fine, rule.maxPaisa);
}

/** Whole calendar days from one YYYY-MM-DD date to another. Zero or negative if not late. */
export function daysBetween(fromIso: string, toIso: string) {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** The status follows from the amounts and the date, so it cannot drift from them. */
export function deriveInvoiceStatus(
  invoice: InvoiceAmounts & { status: InvoiceStatus; dueDate: string },
  today: string,
): InvoiceStatus {
  if (invoice.status === 'CANCELLED') return 'CANCELLED';
  if (outstandingPaisa(invoice) === 0) return 'PAID';
  if (daysBetween(invoice.dueDate, today) > 0) return 'OVERDUE';
  return invoice.paidPaisa > 0 ? 'PARTIAL' : 'UNPAID';
}

/** Neutralises spreadsheet formulas in a CSV cell, then quotes it. */
export function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
