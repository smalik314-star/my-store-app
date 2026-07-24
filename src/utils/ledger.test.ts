import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../types';
import { buildRunningLedger } from './ledger';

const entry = (id: string, debit: number, credit: number, createdAt: Date): LedgerEntry => ({
  id,
  tenantId: 'tenant-1',
  partyType: 'customer',
  partyId: 'customer-1',
  partyName: 'Customer',
  voucherType: 'test',
  voucherId: id,
  voucherNumber: id,
  debit,
  credit,
  createdBy: 'user-1',
  createdAt,
});

describe('customer ledger running balance', () => {
  it('sorts chronologically and applies debit minus credit with paise precision', () => {
    const rows = buildRunningLedger([
      entry('receipt', 0, 40.15, new Date('2026-01-02')),
      entry('sale', 100.1, 0, new Date('2026-01-01')),
      entry('return', 0, 10, new Date('2026-01-03')),
    ]);

    expect(rows.map(row => row.id)).toEqual(['sale', 'receipt', 'return']);
    expect(rows.map(row => row.runningBalance)).toEqual([100.1, 59.95, 49.95]);
  });
});
