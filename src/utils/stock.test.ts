import { describe, expect, it } from 'vitest';
import type { ProductBatch } from '../types';
import { allocateFefo, getValidBatchQuantity, isBatchExpired } from './stock';

const batch = (
  batchNumber: string,
  expiryDate: string,
  quantity: number,
  purchasePrice = 10
): ProductBatch => ({
  batchNumber,
  expiryDate,
  mfgDate: '2025-01-01',
  quantity,
  purchasePrice,
  salePrice: 20,
  createdAt: '2025-01-01',
});

const today = new Date(2026, 6, 23, 12, 0, 0);

describe('batch stock safety', () => {
  it('treats a batch as valid through its expiry day', () => {
    expect(isBatchExpired('2026-07-23', today)).toBe(false);
    expect(isBatchExpired('2026-07-22', today)).toBe(true);
  });

  it('excludes expired and invalid batches from saleable stock', () => {
    expect(getValidBatchQuantity([
      batch('OLD', '2026-07-22', 50),
      batch('VALID', '2026-08-01', 7),
      batch('INVALID', 'not-a-date', 20),
    ], today)).toBe(7);
  });

  it('allocates the nearest-expiry valid batch first', () => {
    const result = allocateFefo([
      batch('LATER', '2026-10-01', 10, 12),
      batch('NEAR', '2026-08-01', 3, 8),
    ], 5, today);

    expect(result.deductions).toEqual([
      expect.objectContaining({ batchNumber: 'NEAR', quantity: 3, purchaseCost: 8 }),
      expect.objectContaining({ batchNumber: 'LATER', quantity: 2, purchaseCost: 12 }),
    ]);
  });

  it('never allocates from expired stock', () => {
    expect(() => allocateFefo([
      batch('EXPIRED', '2026-06-30', 100),
      batch('VALID', '2026-08-01', 2),
    ], 3, today)).toThrow('Requested: 3, available: 2');
  });
});
