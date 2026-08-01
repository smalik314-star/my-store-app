import { describe, expect, it } from 'vitest';
import { matchesSearchQuery, normalizeSearchTerm } from './search';

describe('search utils', () => {
  it('normalizes mixed values into lowercase trimmed text', () => {
    expect(normalizeSearchTerm('  Crocin  ')).toBe('crocin');
    expect(normalizeSearchTerm(12345)).toBe('12345');
    expect(normalizeSearchTerm(null)).toBe('');
  });

  it('matches against any provided field', () => {
    expect(matchesSearchQuery('cro', 'Crocin Advance', 'Paracetamol')).toBe(true);
    expect(matchesSearchQuery('9988', 'Walk-in', '9988776655')).toBe(true);
    expect(matchesSearchQuery('inv-1', 'CUST-4', 'INV-1001')).toBe(true);
  });

  it('returns true for empty queries and false for missing matches', () => {
    expect(matchesSearchQuery('', 'Anything')).toBe(true);
    expect(matchesSearchQuery('azith', 'Crocin', 'Paracetamol')).toBe(false);
  });
});
