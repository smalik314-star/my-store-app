import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type {
  Product,
  StockAdjustmentReason,
  StockAdjustmentRecord,
  StockMovement,
  UserRole,
} from '../types';
import {
  calculateStockAdjustment,
  validateAdjustmentDirection,
} from '../utils/stock-adjustment';
import { toJsDate } from '../utils/date';

interface CreateStockAdjustmentInput {
  requestId: string;
  productId: string;
  batchNumber: string;
  expectedBatchQuantity: number;
  newBatchQuantity: number;
  reason: StockAdjustmentReason;
  reasonNote: string;
  notes?: string;
}

const normalizeBatch = (value: string) => value.trim().toUpperCase();
const allowedReasons: StockAdjustmentReason[] = [
  'physical_increase',
  'physical_decrease',
  'damage',
  'breakage',
  'expired',
  'lost',
  'found',
  'correction',
  'other',
];

export const stockAdjustmentService = {
  async create(
    tenantId: string,
    input: CreateStockAdjustmentInput
  ): Promise<StockAdjustmentRecord> {
    const actorId = auth.currentUser?.uid;
    if (!tenantId || !actorId) throw new Error('You must be signed in to adjust stock.');
    if (!input.requestId) throw new Error('Stock adjustment request ID is required.');
    if (!input.productId || !input.batchNumber.trim()) {
      throw new Error('Select a product and an existing batch.');
    }
    if (!allowedReasons.includes(input.reason)) {
      throw new Error('Select a valid adjustment reason.');
    }
    if (!input.reasonNote.trim()) {
      throw new Error('Explain why this stock adjustment is required.');
    }

    const adjustmentRef = doc(db, 'stockAdjustments', `${tenantId}_${input.requestId}`);
    const movementRef = doc(db, 'stockMovements', `adjustment_${tenantId}_${input.requestId}`);
    const productRef = doc(db, 'products', input.productId);
    const userRef = doc(db, 'users', actorId);

    return runTransaction(db, async transaction => {
      const existing = await transaction.get(adjustmentRef);
      if (existing.exists()) {
        return { id: existing.id, ...existing.data() } as StockAdjustmentRecord;
      }

      const [userSnap, productSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(productRef),
      ]);
      if (
        !userSnap.exists()
        || userSnap.data().tenantId !== tenantId
        || userSnap.data().status !== 'active'
        || !(['owner', 'admin'] as UserRole[]).includes(userSnap.data().role)
      ) {
        throw new Error('Only an owner or administrator can post stock adjustments.');
      }
      if (!productSnap.exists() || productSnap.data().tenantId !== tenantId) {
        throw new Error('The selected product was not found or is not authorized.');
      }

      const product = { id: productSnap.id, ...productSnap.data() } as Product;
      const batches = (product.batches || []).map(batch => ({ ...batch }));
      const normalizedBatch = normalizeBatch(input.batchNumber);
      const batch = batches.find(
        candidate => normalizeBatch(candidate.batchNumber) === normalizedBatch
      );
      if (!batch) {
        throw new Error(
          'The selected batch no longer exists. Add a new batch through Opening Stock or Purchase.'
        );
      }

      const currentBatchQuantity = Number(batch.quantity) || 0;
      const expectedBatchQuantity = Number(input.expectedBatchQuantity);
      if (
        !Number.isInteger(expectedBatchQuantity)
        || currentBatchQuantity !== expectedBatchQuantity
      ) {
        throw new Error(
          `Batch stock changed while this form was open. Current quantity: ${currentBatchQuantity}. Refresh and review before posting.`
        );
      }

      const previousProductStock = Number(product.stockQuantity) || 0;
      const reconciledBatchStock = batches.reduce(
        (sum, candidate) => sum + (Number(candidate.quantity) || 0),
        0
      );
      if (reconciledBatchStock !== previousProductStock) {
        throw new Error(
          `Product stock is not reconciled with its batches (${previousProductStock} total vs ${reconciledBatchStock} batch stock). Review the stock ledger before adjustment.`
        );
      }

      const { difference, newProductStock } = calculateStockAdjustment(
        currentBatchQuantity,
        Number(input.newBatchQuantity),
        previousProductStock
      );
      validateAdjustmentDirection(input.reason, difference);
      batch.quantity = Number(input.newBatchQuantity);
      batches.sort(
        (left, right) =>
          toJsDate(left.expiryDate).getTime() - toJsDate(right.expiryDate).getTime()
      );
      const activeBatch = batches.find(candidate => candidate.quantity > 0) || batches[0];
      const adjustmentNumber = `ADJ-${new Date().getFullYear()}-${adjustmentRef.id
        .slice(-8)
        .toUpperCase()}`;

      const record: Omit<StockAdjustmentRecord, 'id'> = {
        tenantId,
        requestId: input.requestId,
        adjustmentNumber,
        productId: product.id,
        productName: product.name,
        batchNumber: normalizedBatch,
        reason: input.reason,
        reasonNote: input.reasonNote.trim(),
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        previousBatchQuantity: currentBatchQuantity,
        newBatchQuantity: Number(input.newBatchQuantity),
        quantityDifference: difference,
        previousProductStock,
        newProductStock,
        status: 'posted',
        createdBy: actorId,
        createdAt: serverTimestamp(),
      };

      transaction.set(adjustmentRef, record);
      transaction.set(movementRef, {
        id: movementRef.id,
        tenantId,
        type: 'MANUAL_ADJUST',
        productId: product.id,
        productName: product.name,
        batchNumber: normalizedBatch,
        quantity: difference,
        previousStock: previousProductStock,
        newStock: newProductStock,
        userId: actorId,
        reason: input.reason,
        notes: [input.reasonNote.trim(), input.notes?.trim()].filter(Boolean).join(' · '),
        createdAt: serverTimestamp(),
      } satisfies StockMovement);
      transaction.update(productRef, {
        stockQuantity: newProductStock,
        batches,
        ...(activeBatch
          ? {
              batchNumber: activeBatch.batchNumber,
              expiryDate: activeBatch.expiryDate,
              manufacturingDate: activeBatch.mfgDate,
              purchasePrice: activeBatch.purchasePrice,
              sellingPrice: activeBatch.salePrice,
            }
          : {}),
        updatedAt: serverTimestamp(),
      });

      const auditRef = doc(collection(db, 'tenants', tenantId, 'logs'));
      transaction.set(auditRef, {
        action: 'CREATE_STOCK_ADJUSTMENT',
        targetId: adjustmentRef.id,
        productId: product.id,
        batchNumber: normalizedBatch,
        quantityDifference: difference,
        userId: actorId,
        timestamp: serverTimestamp(),
      });

      return { id: adjustmentRef.id, ...record } as StockAdjustmentRecord;
    });
  },

  async list(tenantId: string): Promise<StockAdjustmentRecord[]> {
    if (!tenantId) return [];
    const snapshot = await getDocs(
      query(collection(db, 'stockAdjustments'), where('tenantId', '==', tenantId))
    );
    return snapshot.docs
      .map(row => ({ id: row.id, ...row.data() }) as StockAdjustmentRecord)
      .sort((left, right) => {
        const leftTime =
          typeof left.createdAt?.toMillis === 'function' ? left.createdAt.toMillis() : 0;
        const rightTime =
          typeof right.createdAt?.toMillis === 'function' ? right.createdAt.toMillis() : 0;
        return rightTime - leftTime;
      });
  },
};
