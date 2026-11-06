import { describe, expect, it } from 'vitest';
import {
  calculateFine,
  csvCell,
  daysBetween,
  deriveInvoiceStatus,
  formatNpr,
  outstandingPaisa,
  rupeesToPaisa,
} from './finance.js';

describe('formatNpr', () => {
  it('formats paisa as rupees', () => {
    expect(formatNpr(123450)).toBe('Rs. 1,234.50');
    expect(formatNpr(0)).toBe('Rs. 0.00');
    expect(formatNpr(5)).toBe('Rs. 0.05');
  });
  it('groups the Nepali way', () => {
    expect(formatNpr(12345678900)).toBe('Rs. 12,34,56,789.00');
  });
});

describe('rupeesToPaisa', () => {
  it.each([
    ['100', 10000],
    ['100.5', 10050],
    ['100.05', 10005],
    ['1,000.0', 100000],
    [19.99, 1999],
    ['0.10', 10],
  ])('%s is %d paisa', (input, paisa) => {
    expect(rupeesToPaisa(input)).toBe(paisa);
  });
  it.each(['abc', '-5', '1.234', '', '1e5'])('refuses %s', (input) => {
    expect(rupeesToPaisa(input)).toBeNull();
  });
});

describe('calculateFine', () => {
  const fixed = { type: 'FIXED' as const, amountPaisa: 50000, graceDays: 3 };
  const perDay = { type: 'PER_DAY' as const, amountPaisa: 10000, graceDays: 3 };

  it('charges nothing before or during the grace days', () => {
    for (const days of [-5, 0, 1, 3]) {
      expect(calculateFine(fixed, days)).toBe(0);
      expect(calculateFine(perDay, days)).toBe(0);
    }
  });

  it('charges a FIXED fine once, however late', () => {
    expect(calculateFine(fixed, 4)).toBe(50000);
    expect(calculateFine(fixed, 400)).toBe(50000);
  });

  it('charges PER_DAY only for days beyond the grace days', () => {
    expect(calculateFine(perDay, 4)).toBe(10000);
    expect(calculateFine(perDay, 10)).toBe(70000);
  });

  it('caps a PER_DAY fine', () => {
    const capped = { ...perDay, maxPaisa: 25000 };
    expect(calculateFine(capped, 5)).toBe(20000);
    expect(calculateFine(capped, 6)).toBe(25000);
    expect(calculateFine(capped, 100)).toBe(25000);
  });

  it('caps a FIXED fine', () => {
    expect(calculateFine({ ...fixed, maxPaisa: 100 }, 10)).toBe(100);
  });

  it('works with no grace days', () => {
    expect(calculateFine({ ...perDay, graceDays: 0 }, 0)).toBe(0);
    expect(calculateFine({ ...perDay, graceDays: 0 }, 1)).toBe(10000);
  });

  it('treats a null cap as no cap', () => {
    expect(calculateFine({ ...perDay, maxPaisa: null }, 103)).toBe(1000000);
  });
});

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
    expect(daysBetween('2026-03-01', '2026-03-02')).toBe(1);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2026-03-05', '2026-03-01')).toBe(-4);
  });
});

describe('outstandingPaisa', () => {
  const base = { totalPaisa: 1000, finePaisa: 0, discountPaisa: 0, paidPaisa: 0 };
  it('adds fines and takes off discounts and payments', () => {
    expect(
      outstandingPaisa({ totalPaisa: 1000, finePaisa: 200, discountPaisa: 100, paidPaisa: 300 }),
    ).toBe(800);
  });
  it('is never negative', () => {
    expect(outstandingPaisa({ ...base, discountPaisa: 5000 })).toBe(0);
  });
});

describe('deriveInvoiceStatus', () => {
  const base = {
    status: 'UNPAID' as const,
    dueDate: '2026-03-10',
    totalPaisa: 1000,
    finePaisa: 0,
    discountPaisa: 0,
    paidPaisa: 0,
  };
  it('is UNPAID before the due date, including on it', () => {
    expect(deriveInvoiceStatus(base, '2026-03-10')).toBe('UNPAID');
  });
  it('is PARTIAL when part paid and not late', () => {
    expect(deriveInvoiceStatus({ ...base, paidPaisa: 1 }, '2026-03-01')).toBe('PARTIAL');
  });
  it('is OVERDUE after the due date, even when part paid', () => {
    expect(deriveInvoiceStatus(base, '2026-03-11')).toBe('OVERDUE');
    expect(deriveInvoiceStatus({ ...base, paidPaisa: 1 }, '2026-03-11')).toBe('OVERDUE');
  });
  it('is PAID when nothing is outstanding, even when late', () => {
    expect(deriveInvoiceStatus({ ...base, paidPaisa: 1000 }, '2026-04-01')).toBe('PAID');
  });
  it('is PAID when a discount covers it', () => {
    expect(deriveInvoiceStatus({ ...base, discountPaisa: 1000 }, '2026-03-01')).toBe('PAID');
  });
  it('stays CANCELLED', () => {
    expect(deriveInvoiceStatus({ ...base, status: 'CANCELLED' }, '2026-04-01')).toBe('CANCELLED');
  });
});

describe('csvCell', () => {
  it('leaves ordinary text alone', () => {
    expect(csvCell('Sita Sharma')).toBe('Sita Sharma');
    expect(csvCell(100)).toBe('100');
  });
  it('quotes commas and quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1')).toBe(`'+1`);
    expect(csvCell('@cmd')).toBe(`'@cmd`);
  });
});
