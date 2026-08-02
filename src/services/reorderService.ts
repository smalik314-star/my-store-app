import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { ReorderLine, ReorderOrder, Supplier } from '../types';
import { formatDocumentNumber, getIndianFinancialYear } from '../utils/financialYear';
import { roundMoney } from '../utils/currency';

export interface ReorderDraft {
  requestId: string;
  supplier: Supplier;
  lines: ReorderLine[];
  notes?: string;
}

export const suggestedReorderQuantity = (currentStock: number, minimumStock: number, targetStock?: number) => {
  const current = Math.max(0, Number(currentStock) || 0);
  const minimum = Math.max(0, Number(minimumStock) || 0);
  if (minimum <= 0 || current > minimum) return 0;
  const target = Math.max(minimum, Number(targetStock) || minimum * 2);
  return Math.max(0, Math.ceil(target - current));
};

export const reorderService = {
  async listPage(tenantId: string, pageSize: number = 20, lastOrder?: any) {
    let reorderQuery = query(
      collection(db, 'reorderOrders'),
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );
    if (lastOrder) {
      reorderQuery = query(reorderQuery, startAfter(lastOrder));
    }
    const snapshot = await getDocs(reorderQuery);
    return {
      orders: snapshot.docs.map(row => ({ id: row.id, ...row.data() } as ReorderOrder)),
      lastDoc: snapshot.docs[snapshot.docs.length - 1] ?? null,
      hasMore: snapshot.docs.length === pageSize,
    };
  },

  async save(tenantId: string, draft: ReorderDraft) {
    const actorId = auth.currentUser?.uid;
    if (!tenantId || !actorId) throw new Error('Sign in is required.');
    if (!draft.supplier?.id) throw new Error('Select a supplier.');
    const lines = draft.lines.filter(line => Number(line.orderQuantity) > 0).map(line => ({
      ...line, orderQuantity: Math.ceil(Number(line.orderQuantity)),
    }));
    if (!lines.length) throw new Error('Select at least one item with order quantity.');
    const orderRef = doc(db, 'reorderOrders', `${tenantId}_${draft.requestId}`);
    const counterRef = doc(db, 'counters', `reorders_${tenantId}`);
    const fy = getIndianFinancialYear();
    return runTransaction(db, async transaction => {
      const existing = await transaction.get(orderRef);
      if (existing.exists()) return { id: orderRef.id, reorderNumber: String(existing.data().reorderNumber), reused: true };
      const counter = await transaction.get(counterRef);
      const count = counter.exists() && counter.data().financialYear === fy.key ? (Number(counter.data().count) || 0) + 1 : 1;
      const reorderNumber = formatDocumentNumber('RO', fy, count);
      const estimatedAmount = roundMoney(lines.reduce((sum, line) => sum + line.orderQuantity * Number(line.lastPurchasePrice || 0), 0));
      transaction.set(counterRef, { tenantId, count, financialYear: fy.key });
      transaction.set(orderRef, {
        id: orderRef.id, tenantId, requestId: draft.requestId, reorderNumber,
        supplierId: draft.supplier.id, supplierName: draft.supplier.name,
        supplierPhone: draft.supplier.phone || '', supplierEmail: draft.supplier.email || '',
        lines, totalItems: lines.reduce((sum, line) => sum + line.orderQuantity, 0),
        estimatedAmount, notes: draft.notes || '', status: 'draft', createdBy: actorId,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      return { id: orderRef.id, reorderNumber, reused: false };
    });
  },
};
