import { describe, expect, it } from 'vitest';
import { dedupeById, getSearchVariants, matchesSearchQuery, normalizeSearchIndex, normalizeSearchTerm } from './search';

describe('search utils', () => {
  it('normalizes mixed values into lowercase trimmed text', () => {
    expect(normalizeSearchTerm('  Crocin  ')).toBe('crocin');
    expect(normalizeSearchIndex('  Crocin   Advance ')).toBe('crocin advance');
    expect(normalizeSearchTerm(12345)).toBe('12345');
    expect(normalizeSearchTerm(null)).toBe('');
  });

  it('builds normalized search variants without duplicates', () => {
    expect(getSearchVariants('  Crocin Advance ')).toEqual([
      'crocin advance',
      'Crocin Advance',
      'crocin advance',
      'CROCIN ADVANCE',
      'Crocin Advance',
    ].filter((value, index, list) => list.indexOf(value) === index));
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

  it('dedupes records by id while preserving first occurrence order', () => {
    expect(dedupeById([
      { id: '1', name: 'first' },
      { id: '2', name: 'second' },
      { id: '1', name: 'duplicate' },
    ])).toEqual([
      { id: '1', name: 'duplicate' },
      { id: '2', name: 'second' },
    ]);
  });
});
