import type { ProductBatch } from '../types';

export interface BatchDeduction {
  batchNumber: string;
  quantity: number;
  purchaseCost: number;
  salePrice: number;
  expiryDate: any;
}

const parseInventoryDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === 'object' && 'date' in value) {
    const date = new Date(value.date);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isBatchExpired = (expiryDate: any, now: Date = new Date()): boolean => {
  const expiry = parseInventoryDate(expiryDate);
  if (!expiry) return true;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return expiry.getTime() < startOfToday.getTime();
};

export const getValidBatchQuantity = (
  batches: ProductBatch[] = [],
  now: Date = new Date()
): number => batches.reduce((total, batch) => {
  if (isBatchExpired(batch.expiryDate, now)) return total;
  return total + Math.max(0, Number(batch.quantity) || 0);
}, 0);

export const getFefoAvailableBatch = (
  batches: ProductBatch[] = [],
  now: Date = new Date()
): ProductBatch | null => {
  return batches
    .filter(batch => (Number(batch.quantity) || 0) > 0 && !isBatchExpired(batch.expiryDate, now))
    .sort((left, right) => {
      const leftDate = parseInventoryDate(left.expiryDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDate = parseInventoryDate(right.expiryDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    })[0] ?? null;
};

export const allocateFefo = (
  sourceBatches: ProductBatch[],
  requestedQuantity: number,
  now: Date = new Date()
): { batches: ProductBatch[]; deductions: BatchDeduction[] } => {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error('Sale quantity must be greater than zero.');
  }

  const batches = sourceBatches
    .map(batch => ({ ...batch, quantity: Math.max(0, Number(batch.quantity) || 0) }))
    .sort((left, right) => {
      const leftDate = parseInventoryDate(left.expiryDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDate = parseInventoryDate(right.expiryDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    });

  let remaining = requestedQuantity;
  const deductions: BatchDeduction[] = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    if (batch.quantity <= 0 || isBatchExpired(batch.expiryDate, now)) continue;

    const quantity = Math.min(batch.quantity, remaining);
    deductions.push({
      batchNumber: batch.batchNumber,
      quantity,
      purchaseCost: Number(batch.purchasePrice) || 0,
      salePrice: Number(batch.salePrice) || 0,
      expiryDate: batch.expiryDate ?? null,
    });
    batch.quantity -= quantity;
    remaining -= quantity;
  }

  if (remaining > 0) {
    const available = getValidBatchQuantity(sourceBatches, now);
    throw new Error(
      `Insufficient valid batch stock. Requested: ${requestedQuantity}, available: ${available}.`
    );
  }

  return { batches, deductions };
};
