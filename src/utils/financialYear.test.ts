import { describe, expect, it } from 'vitest';
import { formatDocumentNumber, getIndianFinancialYear } from './financialYear';

describe('Indian financial year document numbering', () => {
  it('uses previous year through 31 March', () => {
    expect(getIndianFinancialYear(new Date(2027, 2, 31)).key).toBe('2026-27');
  });
  it('starts a new year on 1 April', () => {
    const fy = getIndianFinancialYear(new Date(2027, 3, 1));
    expect(fy.key).toBe('2027-28');
    expect(formatDocumentNumber('INV', fy, 12)).toBe('INV-2027-28-000012');
  });
});
