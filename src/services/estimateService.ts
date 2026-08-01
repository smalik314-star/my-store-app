import {
  collection, doc, getDoc, getDocs, orderBy, query, runTransaction,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { Estimate, EstimateItem } from '../types';
import { formatDocumentNumber, getIndianFinancialYear } from '../utils/financialYear';
import { roundMoney } from '../utils/currency';

export interface EstimateDraft {
  requestId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: EstimateItem[];
  validUntil: Date;
  notes?: string;
  terms?: string;
}

function validateDraft(draft: EstimateDraft) {
  if (!draft.customerName.trim()) throw new Error('Customer name is required.');
  if (!draft.items.length) throw new Error('Add at least one estimate item.');
  for (const item of draft.items) {
    if (!item.name.trim()) throw new Error('Every item needs a name.');
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error(`Invalid quantity for ${item.name}.`);
    if (!Number.isFinite(item.rate) || item.rate < 0) throw new Error(`Invalid rate for ${item.name}.`);
    if (!Number.isFinite(item.discount) || item.discount < 0) throw new Error(`Invalid discount for ${item.name}.`);
  }
}

export const estimateService = {
  async save(tenantId: string, draft: EstimateDraft) {
    const actorId = auth.currentUser?.uid;
    if (!tenantId || !actorId) throw new Error('You must be signed in to save an estimate.');
    validateDraft(draft);
    const estimateRef = doc(db, 'estimates', `${tenantId}_${draft.requestId}`);
    const counterRef = doc(db, 'counters', `estimates_${tenantId}`);
    const fy = getIndianFinancialYear();

    return runTransaction(db, async transaction => {
      const existing = await transaction.get(estimateRef);
      if (existing.exists()) {
        if (existing.data().tenantId !== tenantId) throw new Error('Estimate is not authorized.');
        return { id: estimateRef.id, estimateNumber: String(existing.data().estimateNumber), reused: true };
      }
      const counter = await transaction.get(counterRef);
      const count = counter.exists() && counter.data().financialYear === fy.key
        ? (Number(counter.data().count) || 0) + 1
        : 1;
      const estimateNumber = formatDocumentNumber('EST', fy, count);
      const items = draft.items.map(item => ({
        ...item,
        quantity: Number(item.quantity), rate: roundMoney(item.rate),
        discount: roundMoney(item.discount), total: roundMoney(item.quantity * item.rate - item.discount),
      }));
      const subtotal = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.rate, 0));
      const discount = roundMoney(items.reduce((sum, item) => sum + item.discount, 0));
      const grandTotal = roundMoney(subtotal - discount);
      transaction.set(counterRef, { tenantId, count, financialYear: fy.key });
      transaction.set(estimateRef, {
        ...draft, items, subtotal, discount, grandTotal, estimateNumber,
        id: estimateRef.id, tenantId, createdBy: actorId, status: 'draft',
        gstTotal: 0, documentType: 'estimate', taxInvoice: false,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      return { id: estimateRef.id, estimateNumber, reused: false };
    });
  },

  async list(tenantId: string): Promise<Estimate[]> {
    const snapshot = await getDocs(query(
      collection(db, 'estimates'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'),
    ));
    return snapshot.docs.map(row => ({ id: row.id, ...row.data() } as Estimate));
  },

  async get(tenantId: string, id: string): Promise<Estimate | null> {
    const snapshot = await getDoc(doc(db, 'estimates', id));
    if (!snapshot.exists() || snapshot.data().tenantId !== tenantId) return null;
    return { id: snapshot.id, ...snapshot.data() } as Estimate;
  },

  async markConverted(tenantId: string, id: string, invoiceId: string) {
    const current = await this.get(tenantId, id);
    if (!current) throw new Error('Estimate not found.');
    await updateDoc(doc(db, 'estimates', id), {
      status: 'converted', convertedInvoiceId: invoiceId, updatedAt: serverTimestamp(),
    });
  },
};
