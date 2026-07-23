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
  Customer,
  Invoice,
  Product,
  SaleReturnLine,
  SaleReturnRecord,
} from '../types';
import { addMoney, roundMoney, subtractMoney } from '../utils/currency';

interface RequestedReturnLine {
  lineIndex: number;
  quantity: number;
  disposition: 'resellable' | 'damaged';
  reason: string;
}

interface CreateSaleReturnInput {
  requestId: string;
  invoiceId: string;
  lines: RequestedReturnLine[];
}

const normalizedBatch = (value: string) => value.trim().toUpperCase();

export const saleReturnService = {
  async create(tenantId: string, input: CreateSaleReturnInput): Promise<SaleReturnRecord> {
    const actorId = auth.currentUser?.uid;
    if (!tenantId || !actorId) throw new Error('You must be signed in to create a sale return.');
    if (!input.requestId) throw new Error('Return request ID is required.');
    const requestedLines = input.lines.filter(line => Number(line.quantity) > 0);
    if (requestedLines.length === 0) throw new Error('Select at least one item quantity to return.');

    const returnRef = doc(db, 'saleReturns', `${tenantId}_${input.requestId}`);
    const invoiceRef = doc(db, 'invoices', input.invoiceId);
    const summaryRef = doc(db, 'saleReturnSummaries', input.invoiceId);

    return runTransaction(db, async transaction => {
      const existing = await transaction.get(returnRef);
      if (existing.exists()) return { id: existing.id, ...existing.data() } as SaleReturnRecord;

      const invoiceSnap = await transaction.get(invoiceRef);
      const summarySnap = await transaction.get(summaryRef);
      if (!invoiceSnap.exists() || invoiceSnap.data().tenantId !== tenantId) {
        throw new Error('Original invoice was not found or is not authorized.');
      }
      const invoice = { id: invoiceSnap.id, ...invoiceSnap.data() } as Invoice;
      if (invoice.status === 'cancelled') throw new Error('A cancelled invoice cannot be returned.');
      if (invoice.isQuickBill) throw new Error('Quick estimate bills do not carry stock and cannot create a stock return.');

      const returnedByLine: Record<string, number> = summarySnap.exists()
        ? { ...(summarySnap.data().returnedByLine || {}) }
        : {};

      const productIds = new Set<string>();
      for (const requested of requestedLines) {
        const original = invoice.items[requested.lineIndex];
        if (!original?.productId) throw new Error('A selected invoice line is invalid.');
        productIds.add(original.productId);
      }

      const productSnaps = new Map<string, any>();
      for (const productId of productIds) {
        const snapshot = await transaction.get(doc(db, 'products', productId));
        if (!snapshot.exists() || snapshot.data().tenantId !== tenantId) {
          throw new Error('A returned product is missing or not authorized.');
        }
        productSnaps.set(productId, snapshot);
      }

      let customerRef: any = null;
      let customerSnap: any = null;
      if (invoice.customerId && invoice.customerId !== 'walk-in') {
        customerRef = doc(db, 'customers', invoice.customerId);
        customerSnap = await transaction.get(customerRef);
      }

      const changedProducts = new Map<string, Product>();
      const lines: SaleReturnLine[] = [];

      for (const requested of requestedLines) {
        const original = invoice.items[requested.lineIndex];
        const quantity = Number(requested.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new Error(`Return quantity for ${original.name} must be a whole number above zero.`);
        }
        const previouslyReturned = Number(returnedByLine[String(requested.lineIndex)]) || 0;
        const returnable = Number(original.quantity) - previouslyReturned;
        if (quantity > returnable) {
          throw new Error(`${original.name}: only ${returnable} unit(s) remain returnable.`);
        }
        if (!original.batchDeductions?.length) {
          throw new Error(`${original.name} has no batch provenance. Use a reviewed stock adjustment instead.`);
        }

        let remaining = quantity;
        const batchRestorations: SaleReturnLine['batchRestorations'] = [];
        for (const deduction of original.batchDeductions) {
          if (remaining <= 0) break;
          const alreadyFromEarlierBatches = original.batchDeductions
            .slice(0, original.batchDeductions.indexOf(deduction))
            .reduce((sum, item) => sum + item.quantity, 0);
          const usedFromThisBatch = Math.max(0, previouslyReturned - alreadyFromEarlierBatches);
          const availableFromThisBatch = Math.max(0, deduction.quantity - usedFromThisBatch);
          const restore = Math.min(availableFromThisBatch, remaining);
          if (restore > 0) batchRestorations.push({ batchNumber: deduction.batchNumber, quantity: restore });
          remaining -= restore;
        }
        if (remaining > 0) throw new Error(`Could not reconcile returned batches for ${original.name}.`);

        const lineAmount = roundMoney((Number(original.total) / Number(original.quantity)) * quantity);
        lines.push({
          lineIndex: requested.lineIndex,
          productId: original.productId,
          productName: original.name,
          quantity,
          disposition: requested.disposition,
          reason: requested.reason.trim() || 'Customer return',
          amount: lineAmount,
          batchRestorations,
        });
        returnedByLine[String(requested.lineIndex)] = addMoney(previouslyReturned, quantity);

        const baseProduct = changedProducts.get(original.productId)
          || ({ id: productSnaps.get(original.productId).id, ...productSnaps.get(original.productId).data() } as Product);
        const previousStock = Number(baseProduct.stockQuantity) || 0;
        let newStock = previousStock;
        let batches = [...(baseProduct.batches || [])];

        if (requested.disposition === 'resellable') {
          for (const restoration of batchRestorations) {
            const index = batches.findIndex(batch => normalizedBatch(batch.batchNumber) === normalizedBatch(restoration.batchNumber));
            if (index < 0) throw new Error(`Batch ${restoration.batchNumber} no longer exists for ${original.name}.`);
            batches[index] = { ...batches[index], quantity: addMoney(batches[index].quantity, restoration.quantity) };
            newStock = addMoney(newStock, restoration.quantity);
          }
        }
        changedProducts.set(original.productId, { ...baseProduct, stockQuantity: newStock, batches });

        const movementRef = doc(collection(db, 'stockMovements'));
        transaction.set(movementRef, {
          id: movementRef.id,
          tenantId,
          type: requested.disposition === 'resellable' ? 'SALE_RETURN' : 'SALE_RETURN_DAMAGED',
          productId: original.productId,
          productName: original.name,
          batchNumber: batchRestorations.map(item => item.batchNumber).join(', '),
          quantity: requested.disposition === 'resellable' ? quantity : 0,
          previousStock,
          newStock,
          invoiceId: invoice.id,
          userId: actorId,
          reason: requested.reason.trim() || 'Customer return',
          createdAt: serverTimestamp(),
        });
      }

      for (const [productId, product] of changedProducts) {
        transaction.update(doc(db, 'products', productId), {
          stockQuantity: product.stockQuantity,
          batches: product.batches,
          updatedAt: serverTimestamp(),
        });
      }

      const totalAmount = addMoney(...lines.map(line => line.amount));
      const invoiceOutstanding = roundMoney(Number(invoice.outstandingAmount) || 0);
      const outstandingAdjusted = Math.min(invoiceOutstanding, totalAmount);
      const customerCredit = subtractMoney(totalAmount, outstandingAdjusted);
      const currentReturnedAmount = roundMoney(Number(invoice.returnedAmount) || 0);
      if (addMoney(currentReturnedAmount, totalAmount) > invoice.grandTotal) {
        throw new Error('Return value cannot exceed the original invoice total.');
      }

      const returnNumber = `SR-${new Date().getFullYear()}-${returnRef.id.slice(-8).toUpperCase()}`;
      const record: Omit<SaleReturnRecord, 'id'> = {
        tenantId,
        requestId: input.requestId,
        returnNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        lines,
        totalAmount,
        outstandingAdjusted,
        customerCredit,
        status: 'posted',
        createdBy: actorId,
        createdAt: serverTimestamp(),
      };
      transaction.set(returnRef, record);
      transaction.set(summaryRef, {
        tenantId,
        invoiceId: invoice.id,
        returnedByLine,
        totalAmount: addMoney(Number(summarySnap.data()?.totalAmount) || 0, totalAmount),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.update(invoiceRef, {
        returnedAmount: addMoney(currentReturnedAmount, totalAmount),
        returnCount: (Number(invoice.returnCount) || 0) + 1,
        outstandingAmount: subtractMoney(invoiceOutstanding, outstandingAdjusted),
        paymentStatus: subtractMoney(invoiceOutstanding, outstandingAdjusted) === 0
          ? (Number(invoice.amountReceived) > 0 ? 'paid' : invoice.paymentStatus)
          : 'partial',
        updatedAt: serverTimestamp(),
      });

      if (customerRef && customerSnap?.exists() && customerSnap.data().tenantId === tenantId) {
        const customer = customerSnap.data() as Customer;
        transaction.update(customerRef, {
          totalPurchases: increment(-totalAmount),
          outstandingBalance: increment(-outstandingAdjusted),
          creditBalance: increment(customerCredit),
          updatedAt: serverTimestamp(),
        });
        const ledgerRef = doc(collection(db, 'ledgerEntries'));
        transaction.set(ledgerRef, {
          tenantId,
          partyType: 'customer',
          partyId: invoice.customerId,
          partyName: invoice.customerName,
          voucherType: 'sale_return',
          voucherId: returnRef.id,
          voucherNumber: returnNumber,
          referenceId: invoice.id,
          referenceNumber: invoice.invoiceNumber,
          debit: 0,
          credit: totalAmount,
          createdBy: actorId,
          createdAt: serverTimestamp(),
        });
        void customer;
      }

      const auditRef = doc(collection(db, 'tenants', tenantId, 'logs'));
      transaction.set(auditRef, {
        action: 'CREATE_SALE_RETURN',
        targetId: returnRef.id,
        invoiceId: invoice.id,
        amount: totalAmount,
        userId: actorId,
        timestamp: serverTimestamp(),
      });
      return { id: returnRef.id, ...record } as SaleReturnRecord;
    });
  },

  async list(tenantId: string): Promise<SaleReturnRecord[]> {
    const snapshot = await getDocs(query(collection(db, 'saleReturns'), where('tenantId', '==', tenantId)));
    return snapshot.docs.map(row => ({ id: row.id, ...row.data() } as SaleReturnRecord));
  },
};
