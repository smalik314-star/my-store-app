import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { Invoice, ReceiptRecord } from '../types';
import { addMoney, roundMoney, subtractMoney } from '../utils/currency';
import { applyPaymentToOutstanding } from '../utils/transactions';

interface RecordReceiptInput {
  requestId: string;
  invoiceId: string;
  amount: number;
  paymentMethod: ReceiptRecord['paymentMethod'];
  notes?: string;
}

export const receiptService = {
  async recordReceipt(tenantId: string, input: RecordReceiptInput): Promise<ReceiptRecord> {
    const actorId = auth.currentUser?.uid;
    if (!tenantId || !actorId) throw new Error('You must be signed in to record a receipt.');
    if (!input.requestId) throw new Error('Receipt request ID is required.');

    const amount = roundMoney(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Receipt amount must be greater than zero.');
    }

    const receiptRef = doc(db, 'receipts', `${tenantId}_${input.requestId}`);
    const invoiceRef = doc(db, 'invoices', input.invoiceId);

    return runTransaction(db, async transaction => {
      const existing = await transaction.get(receiptRef);
      if (existing.exists()) return { id: existing.id, ...existing.data() } as ReceiptRecord;

      const invoiceSnap = await transaction.get(invoiceRef);
      if (!invoiceSnap.exists() || invoiceSnap.data().tenantId !== tenantId) {
        throw new Error('Invoice was not found or does not belong to this store.');
      }
      const invoice = { id: invoiceSnap.id, ...invoiceSnap.data() } as Invoice;
      if (invoice.status === 'cancelled') throw new Error('A cancelled invoice cannot receive payment.');
      if (!invoice.customerId || invoice.customerId === 'walk-in') {
        throw new Error('Select a registered customer invoice before recording a receipt.');
      }

      const currentReceived = roundMoney(Number(invoice.amountReceived) || 0);
      const currentOutstanding = roundMoney(
        Number.isFinite(Number(invoice.outstandingAmount))
          ? Number(invoice.outstandingAmount)
          : subtractMoney(invoice.grandTotal, currentReceived)
      );
      let newOutstanding: number;
      try {
        newOutstanding = applyPaymentToOutstanding(currentOutstanding, amount);
      } catch (error) {
        throw new Error(`Receipt failed: ${(error as Error).message} Current outstanding: ${currentOutstanding}.`);
      }

      const customerRef = doc(db, 'customers', invoice.customerId);
      const customerSnap = await transaction.get(customerRef);
      if (!customerSnap.exists() || customerSnap.data().tenantId !== tenantId) {
        throw new Error('Customer record was not found or is not authorized.');
      }

      const newReceived = addMoney(currentReceived, amount);
      const receiptNumber = `RCT-${new Date().getFullYear()}-${receiptRef.id.slice(-8).toUpperCase()}`;
      const receipt: Omit<ReceiptRecord, 'id'> = {
        tenantId,
        receiptNumber,
        requestId: input.requestId,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        paymentMethod: input.paymentMethod,
        notes: input.notes?.trim() || '',
        createdBy: actorId,
        createdAt: serverTimestamp(),
      };

      transaction.set(receiptRef, receipt);
      transaction.update(invoiceRef, {
        amountReceived: newReceived,
        outstandingAmount: newOutstanding,
        paymentStatus: newOutstanding === 0 ? 'paid' : 'partial',
        updatedAt: serverTimestamp(),
      });
      transaction.update(customerRef, {
        totalPaid: increment(amount),
        outstandingBalance: increment(-amount),
        updatedAt: serverTimestamp(),
      });

      const ledgerRef = doc(collection(db, 'ledgerEntries'));
      transaction.set(ledgerRef, {
        tenantId,
        partyType: 'customer',
        partyId: invoice.customerId,
        partyName: invoice.customerName,
        voucherType: 'receipt',
        voucherId: receiptRef.id,
        voucherNumber: receiptNumber,
        referenceId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        debit: 0,
        credit: amount,
        createdBy: actorId,
        createdAt: serverTimestamp(),
      });

      const auditRef = doc(collection(db, 'tenants', tenantId, 'logs'));
      transaction.set(auditRef, {
        action: 'RECORD_RECEIPT',
        targetId: receiptRef.id,
        userId: actorId,
        invoiceId: invoice.id,
        amount,
        timestamp: serverTimestamp(),
      });

      return { id: receiptRef.id, ...receipt } as ReceiptRecord;
    });
  },

  async listReceipts(tenantId: string): Promise<ReceiptRecord[]> {
    if (!tenantId) return [];
    const snapshot = await getDocs(query(
      collection(db, 'receipts'),
      where('tenantId', '==', tenantId)
    ));
    return snapshot.docs
      .map(item => ({ id: item.id, ...item.data() } as ReceiptRecord))
      .sort((left, right) => {
        const l = typeof left.createdAt?.toMillis === 'function' ? left.createdAt.toMillis() : 0;
        const r = typeof right.createdAt?.toMillis === 'function' ? right.createdAt.toMillis() : 0;
        return r - l;
      });
  },

  async listReceiptsPage(tenantId: string, pageSize: number = 20, lastReceipt?: any) {
    if (!tenantId) return { receipts: [], lastDoc: null };
    const receiptsQuery = lastReceipt
      ? query(
          collection(db, 'receipts'),
          where('tenantId', '==', tenantId),
          orderBy('createdAt', 'desc'),
          startAfter(lastReceipt),
          limit(pageSize)
        )
      : query(
          collection(db, 'receipts'),
          where('tenantId', '==', tenantId),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
    const snapshot = await getDocs(receiptsQuery);
    return {
      receipts: snapshot.docs.map(item => ({ id: item.id, ...item.data() } as ReceiptRecord)),
      lastDoc: snapshot.docs[snapshot.docs.length - 1] ?? null,
    };
  },
};
