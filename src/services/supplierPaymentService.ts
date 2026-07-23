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
import type { Purchase, SupplierPaymentRecord } from '../types';
import { addMoney, roundMoney, subtractMoney } from '../utils/currency';
import { applyPaymentToOutstanding } from '../utils/transactions';

interface RecordSupplierPaymentInput {
  requestId: string;
  purchaseId: string;
  amount: number;
  paymentMethod: SupplierPaymentRecord['paymentMethod'];
  notes?: string;
}

export const supplierPaymentService = {
  async recordPayment(tenantId: string, input: RecordSupplierPaymentInput): Promise<SupplierPaymentRecord> {
    const actorId = auth.currentUser?.uid;
    if (!tenantId || !actorId) throw new Error('You must be signed in to record a supplier payment.');
    if (!input.requestId) throw new Error('Payment request ID is required.');
    const amount = roundMoney(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be greater than zero.');

    const paymentRef = doc(db, 'supplierPayments', `${tenantId}_${input.requestId}`);
    const purchaseRef = doc(db, 'purchases', input.purchaseId);

    return runTransaction(db, async transaction => {
      const existing = await transaction.get(paymentRef);
      if (existing.exists()) return { id: existing.id, ...existing.data() } as SupplierPaymentRecord;

      const purchaseSnap = await transaction.get(purchaseRef);
      if (!purchaseSnap.exists() || purchaseSnap.data().tenantId !== tenantId) {
        throw new Error('Purchase bill was not found or does not belong to this store.');
      }
      const purchase = { id: purchaseSnap.id, ...purchaseSnap.data() } as Purchase;
      if (purchase.status === 'cancelled') throw new Error('A cancelled purchase cannot receive payment.');
      if (!purchase.supplierLedgerTracked) {
        throw new Error('This legacy purchase is not linked to the supplier ledger. Reconcile it before recording payment.');
      }

      const currentPaid = roundMoney(Number(purchase.paidAmount) || 0);
      const currentPayable = roundMoney(
        Number.isFinite(Number(purchase.payableAmount))
          ? Number(purchase.payableAmount)
          : subtractMoney(purchase.totalAmount, currentPaid)
      );
      let newPayable: number;
      try {
        newPayable = applyPaymentToOutstanding(currentPayable, amount);
      } catch (error) {
        throw new Error(`Supplier payment failed: ${(error as Error).message} Current payable: ${currentPayable}.`);
      }

      const supplierRef = doc(db, 'suppliers', purchase.supplierId);
      const supplierSnap = await transaction.get(supplierRef);
      if (!supplierSnap.exists() || supplierSnap.data().tenantId !== tenantId) {
        throw new Error('Supplier record was not found or is not authorized.');
      }

      const newPaid = addMoney(currentPaid, amount);
      const paymentNumber = `PAY-${new Date().getFullYear()}-${paymentRef.id.slice(-8).toUpperCase()}`;
      const payment: Omit<SupplierPaymentRecord, 'id'> = {
        tenantId,
        paymentNumber,
        requestId: input.requestId,
        supplierId: purchase.supplierId,
        supplierName: purchase.supplierName,
        purchaseId: purchase.id,
        purchaseNumber: purchase.purchaseNumber,
        amount,
        paymentMethod: input.paymentMethod,
        notes: input.notes?.trim() || '',
        createdBy: actorId,
        createdAt: serverTimestamp(),
      };

      transaction.set(paymentRef, payment);
      transaction.update(purchaseRef, {
        paidAmount: newPaid,
        payableAmount: newPayable,
        paymentStatus: newPayable === 0 ? 'paid' : 'partial',
      });
      transaction.update(supplierRef, {
        totalPaid: increment(amount),
        payableBalance: increment(-amount),
        updatedAt: serverTimestamp(),
      });

      const ledgerRef = doc(collection(db, 'ledgerEntries'));
      transaction.set(ledgerRef, {
        tenantId,
        partyType: 'supplier',
        partyId: purchase.supplierId,
        partyName: purchase.supplierName,
        voucherType: 'payment',
        voucherId: paymentRef.id,
        voucherNumber: paymentNumber,
        referenceId: purchase.id,
        referenceNumber: purchase.purchaseNumber,
        debit: amount,
        credit: 0,
        createdBy: actorId,
        createdAt: serverTimestamp(),
      });

      const auditRef = doc(collection(db, 'tenants', tenantId, 'logs'));
      transaction.set(auditRef, {
        action: 'RECORD_SUPPLIER_PAYMENT',
        targetId: paymentRef.id,
        purchaseId: purchase.id,
        userId: actorId,
        amount,
        timestamp: serverTimestamp(),
      });

      return { id: paymentRef.id, ...payment } as SupplierPaymentRecord;
    });
  },

  async listPayments(tenantId: string): Promise<SupplierPaymentRecord[]> {
    if (!tenantId) return [];
    const snapshot = await getDocs(query(
      collection(db, 'supplierPayments'),
      where('tenantId', '==', tenantId)
    ));
    return snapshot.docs
      .map(item => ({ id: item.id, ...item.data() } as SupplierPaymentRecord))
      .sort((left, right) => {
        const l = typeof left.createdAt?.toMillis === 'function' ? left.createdAt.toMillis() : 0;
        const r = typeof right.createdAt?.toMillis === 'function' ? right.createdAt.toMillis() : 0;
        return r - l;
      });
  },
};
