import { describe, expect, it } from 'vitest';
import { formatMedicineMonthYear } from './date';

describe('medicine month/year formatting', () => {
  it('prints pharmacy dates without an artificial day', () => {
    expect(formatMedicineMonthYear('2028-01-31')).toBe('01/2028');
  });

  it('prints a dash for an unavailable date', () => {
    expect(formatMedicineMonthYear(null)).toBe('—');
  });
});
