import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type {
  Product,
  Purchase,
  PurchaseItem,
  PurchaseReturnLine,
  PurchaseReturnRecord,
  StockMovement,
} from '../types';
import { addMoney, roundMoney, subtractMoney } from '../utils/currency';
import { toJsDate } from '../utils/date';
import { settleReturnAgainstOutstanding, validateReturnQuantity } from '../utils/transactions';

interface PurchaseReturnRequestLine {
  purchaseItemId: string;
  quantity: number;
  reason: PurchaseReturnLine['reason'];
}

interface CreatePurchaseReturnInput {
  requestId: string;
  purchaseId: string;
  lines: PurchaseReturnRequestLine[];
}

const normalizeBatch = (value: string) => value.trim().toUpperCase();

export const purchaseReturnService = {
  async createReturn(tenantId: string, input: CreatePurchaseReturnInput): Promise<PurchaseReturnRecord> {
    const actorId = auth.currentUser?.uid;
    if (!tenantId || !actorId) throw new Error('You must be signed in to create a purchase return.');
    if (!input.requestId) throw new Error('Purchase return request ID is required.');
    const requestedLines = input.lines.filter(line => Number(line.quantity) > 0);
    if (requestedLines.length === 0) throw new Error('Select at least one item quantity to return.');
    if (new Set(requestedLines.map(line => line.purchaseItemId)).size !== requestedLines.length) {
      throw new Error('A purchase line can be returned only once in the same return.');
    }

    const itemSnapshot = await getDocs(query(
      collection(db, 'purchaseItems'),
      where('tenantId', '==', tenantId),
      where('purchaseId', '==', input.purchaseId)
    ));
    const sourceItems = new Map(
      itemSnapshot.docs.map(item => [item.id, { id: item.id, ...item.data() } as PurchaseItem])
    );
    const prepared = requestedLines.map(requested => {
      const item = sourceItems.get(requested.purchaseItemId);
      if (!item) throw new Error('A selected purchase item was not found.');
      const quantity = Number(requested.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`Return quantity for ${item.productName} must be a whole number greater than zero.`);
      }
      const amount = roundMoney((roundMoney(item.total) / item.quantity) * quantity);
      return { requested, item, quantity, amount };
    });

    const returnRef = doc(db, 'purchaseReturns', `${tenantId}_${input.requestId}`);
    const purchaseRef = doc(db, 'purchases', input.purchaseId);
    const summaryRef = doc(db, 'purchaseReturnSummaries', input.purchaseId);

    return runTransaction(db, async transaction => {
      const existing = await transaction.get(returnRef);
      if (existing.exists()) return { id: existing.id, ...existing.data() } as PurchaseReturnRecord;

      const purchaseSnap = await transaction.get(purchaseRef);
      if (!purchaseSnap.exists() || purchaseSnap.data().tenantId !== tenantId) {
        throw new Error('Original purchase was not found or does not belong to this store.');
      }
      const purchase = { id: purchaseSnap.id, ...purchaseSnap.data() } as Purchase;
      if (purchase.status === 'cancelled') throw new Error('A cancelled purchase cannot be returned.');
      if (!purchase.supplierLedgerTracked) {
        throw new Error('This legacy purchase is not linked to the supplier ledger. Reconcile it before creating a return.');
      }

      const summarySnap = await transaction.get(summaryRef);
      const returnedByItem: Record<string, number> = summarySnap.exists()
        ? { ...(summarySnap.data().returnedByItem || {}) }
        : {};
      const supplierRef = doc(db, 'suppliers', purchase.supplierId);
      const supplierSnap = await transaction.get(supplierRef);
      if (!supplierSnap.exists() || supplierSnap.data().tenantId !== tenantId) {
        throw new Error('Supplier record was not found or is not authorized.');
      }

      const productSnaps = new Map<string, any>();
      for (const row of prepared) {
        if (!productSnaps.has(row.item.productId)) {
          productSnaps.set(row.item.productId, await transaction.get(doc(db, 'products', row.item.productId)));
        }
      }

      for (const row of prepared) {
        const previouslyReturned = Number(returnedByItem[row.item.id]) || 0;
        try {
          validateReturnQuantity(row.item.quantity, previouslyReturned, row.quantity);
        } catch (error) {
          throw new Error(`${row.item.productName}: ${(error as Error).message}`);
        }
        const productSnap = productSnaps.get(row.item.productId);
        if (!productSnap.exists() || productSnap.data().tenantId !== tenantId) {
          throw new Error(`${row.item.productName} is no longer available in this store.`);
        }
        const product = productSnap.data() as Product;
        const batch = (product.batches || []).find(candidate =>
          normalizeBatch(candidate.batchNumber) === normalizeBatch(row.item.batchNumber)
        );
        if (!batch || batch.quantity < row.quantity) {
          throw new Error(
            `Insufficient stock in ${row.item.productName}, batch ${row.item.batchNumber}. Available: ${batch?.quantity || 0}, requested return: ${row.quantity}.`
          );
        }
      }

      const totalAmount = roundMoney(prepared.reduce((sum, row) => addMoney(sum, row.amount), 0));
      const currentReturnAmount = roundMoney(Number(purchase.returnAmount) || 0);
      if (addMoney(currentReturnAmount, totalAmount) > roundMoney(purchase.totalAmount)) {
        throw new Error('Purchase return value cannot exceed the original purchase total.');
      }
      const currentPayable = roundMoney(
        Number.isFinite(Number(purchase.payableAmount))
          ? Number(purchase.payableAmount)
          : subtractMoney(purchase.totalAmount, Number(purchase.paidAmount) || 0)
      );
      const settlement = settleReturnAgainstOutstanding(totalAmount, currentPayable);
      const payableAdjusted = settlement.outstandingAdjusted;
      const supplierCredit = settlement.creditCreated;
      const newPayable = settlement.newOutstanding;
      const newReturnAmount = addMoney(currentReturnAmount, totalAmount);
      const returnNumber = `PRN-${new Date().getFullYear()}-${returnRef.id.slice(-8).toUpperCase()}`;

      const lines: PurchaseReturnLine[] = prepared.map(row => ({
        purchaseItemId: row.item.id,
        productId: row.item.productId,
        productName: row.item.productName,
        batchNumber: normalizeBatch(row.item.batchNumber),
        quantity: row.quantity,
        reason: row.requested.reason,
        amount: row.amount,
      }));
      const record: Omit<PurchaseReturnRecord, 'id'> = {
        tenantId,
        requestId: input.requestId,
        returnNumber,
        purchaseId: purchase.id,
        purchaseNumber: purchase.purchaseNumber,
        supplierId: purchase.supplierId,
        supplierName: purchase.supplierName,
        lines,
        totalAmount,
        payableAdjusted,
        supplierCredit,
        status: 'posted',
        createdBy: actorId,
        createdAt: serverTimestamp(),
      };

      transaction.set(returnRef, record);
      for (const row of prepared) returnedByItem[row.item.id] = (Number(returnedByItem[row.item.id]) || 0) + row.quantity;
      transaction.set(summaryRef, {
        tenantId,
        purchaseId: purchase.id,
        returnedByItem,
        totalReturnedAmount: newReturnAmount,
        updatedAt: serverTimestamp(),
      });

      const rowsByProduct = new Map<string, typeof prepared>();
      for (const row of prepared) {
        const rows = rowsByProduct.get(row.item.productId) || [];
        rows.push(row);
        rowsByProduct.set(row.item.productId, rows);
      }
      for (const [productId, rows] of rowsByProduct) {
        const productRef = doc(db, 'products', productId);
        const product = productSnaps.get(productId).data() as Product;
        let stock = Number(product.stockQuantity) || 0;
        const batches = (product.batches || []).map(batch => ({ ...batch }));
        for (const row of rows) {
          const previousStock = stock;
          stock -= row.quantity;
          const batch = batches.find(candidate =>
            normalizeBatch(candidate.batchNumber) === normalizeBatch(row.item.batchNumber)
          );
          if (!batch) throw new Error(`Batch ${row.item.batchNumber} is missing.`);
          batch.quantity -= row.quantity;
          const movementRef = doc(collection(db, 'stockMovements'));
          transaction.set(movementRef, {
            id: movementRef.id,
            tenantId,
            type: 'PURCHASE_RETURN',
            productId,
            productName: row.item.productName,
            batchNumber: normalizeBatch(row.item.batchNumber),
            quantity: -row.quantity,
            previousStock,
            newStock: stock,
            purchaseId: purchase.id,
            userId: actorId,
            reason: row.requested.reason,
            createdAt: serverTimestamp(),
          } satisfies StockMovement);
        }
        batches.sort((left, right) => toJsDate(left.expiryDate).getTime() - toJsDate(right.expiryDate).getTime());
        const activeBatch = batches.find(batch => batch.quantity > 0) || batches[0];
        transaction.update(productRef, {
          stockQuantity: stock,
          batches,
          ...(activeBatch ? {
            batchNumber: activeBatch.batchNumber,
            expiryDate: activeBatch.expiryDate,
            manufacturingDate: activeBatch.mfgDate,
            purchasePrice: activeBatch.purchasePrice,
            sellingPrice: activeBatch.salePrice,
          } : {}),
          updatedAt: serverTimestamp(),
        });
      }

      transaction.update(purchaseRef, {
        returnAmount: newReturnAmount,
        returnCount: increment(1),
        payableAmount: newPayable,
        paymentStatus: newPayable === 0 ? 'paid' : (Number(purchase.paidAmount) || 0) > 0 ? 'partial' : 'due',
      });
      transaction.update(supplierRef, {
        totalPurchases: increment(-totalAmount),
        payableBalance: increment(-payableAdjusted),
        creditBalance: increment(supplierCredit),
        updatedAt: serverTimestamp(),
      });

      const ledgerRef = doc(collection(db, 'ledgerEntries'));
      transaction.set(ledgerRef, {
        tenantId,
        partyType: 'supplier',
        partyId: purchase.supplierId,
        partyName: purchase.supplierName,
        voucherType: 'purchase_return',
        voucherId: returnRef.id,
        voucherNumber: returnNumber,
        referenceId: purchase.id,
        referenceNumber: purchase.purchaseNumber,
        debit: totalAmount,
        credit: 0,
        createdBy: actorId,
        createdAt: serverTimestamp(),
      });
      const auditRef = doc(collection(db, 'tenants', tenantId, 'logs'));
      transaction.set(auditRef, {
        action: 'CREATE_PURCHASE_RETURN',
        targetId: returnRef.id,
        purchaseId: purchase.id,
        amount: totalAmount,
        userId: actorId,
        timestamp: serverTimestamp(),
      });

      return { id: returnRef.id, ...record } as PurchaseReturnRecord;
    });
  },

  async listReturns(tenantId: string): Promise<PurchaseReturnRecord[]> {
    if (!tenantId) return [];
    const snapshot = await getDocs(query(
      collection(db, 'purchaseReturns'),
      where('tenantId', '==', tenantId)
    ));
    return snapshot.docs
      .map(row => ({ id: row.id, ...row.data() } as PurchaseReturnRecord))
      .sort((left, right) => {
        const l = typeof left.createdAt?.toMillis === 'function' ? left.createdAt.toMillis() : 0;
        const r = typeof right.createdAt?.toMillis === 'function' ? right.createdAt.toMillis() : 0;
        return r - l;
      });
  },
};
