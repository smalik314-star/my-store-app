import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  runTransaction, 
  serverTimestamp,
  increment,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  startAfter
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Invoice, Product, Customer, Tenant } from '../types';
import { handleFirestoreError, OperationType, logFirestoreOperation } from '../utils/firestore-errors';
import { tenantService } from './tenantService';
import { toJsDate } from '../utils/date';
import { allocateFefo, getValidBatchQuantity, isBatchExpired } from '../utils/stock';
import { addMoney, calculateLineTax, roundMoney, subtractMoney } from '../utils/currency';

const COLLECTION_NAME = 'invoices';

function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) {
    return null;
  }
  if (obj === null) {
    return null;
  }
  if (obj instanceof Date) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  if (typeof obj === 'object') {
    if (typeof obj.toDate === 'function') {
      return obj;
    }
    if (obj.constructor && obj.constructor.name !== 'Object') {
      return obj;
    }
    const result: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        result[key] = sanitizeForFirestore(val);
      }
    }
    return result;
  }
  return obj;
}

export const invoiceService = {
  async generateInvoiceNumber(tenantId: string, prefix: string = 'INV'): Promise<string> {
    if (!tenantId) throw new Error('Tenant ID required');

    const counterRef = doc(db, 'counters', `invoices_${tenantId}`);
    const year = new Date().getFullYear();
    
    logFirestoreOperation(OperationType.GET, `counters/invoices_${tenantId}`, 'pending', { prefix, year });
    try {
      const result = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextNumber = 1;
        
        if (counterDoc.exists()) {
          const data = counterDoc.data();
          if (data.year === year) {
            nextNumber = data.count + 1;
          }
        }
        
        transaction.set(counterRef, { count: nextNumber, year, tenantId });
        return nextNumber;
      });
      
      const generatedNum = `${prefix}-${year}-${result.toString().padStart(6, '0')}`;
      logFirestoreOperation(OperationType.GET, `counters/invoices_${tenantId}`, 'success', { generatedNum });
      return generatedNum;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `counters/invoices_${tenantId}`);
      return ''; // unreachable
    }
  },

  async saveInvoice(
    tenantId: string,
    invoiceData: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt' | 'tenantId'> & {
      invoiceNumber?: string;
    },
    prefix: string = 'INV'
  ) {
    if (!tenantId) throw new Error('Tenant ID required');
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('You must be signed in to create an invoice.');
    const requestId = invoiceData.requestId || crypto.randomUUID();
    const invoiceRef = doc(db, COLLECTION_NAME, `${tenantId}_${requestId}`);
    const counterRef = doc(db, 'counters', `invoices_${tenantId}`);
    const year = new Date().getFullYear();
    const usageMonth = new Date().toISOString().slice(0, 7);
    const usageRef = doc(db, 'tenants', tenantId, 'usageCounters', usageMonth);

    logFirestoreOperation(OperationType.WRITE, COLLECTION_NAME, 'pending', { requestId });
    try {
      const savedInvoice = await runTransaction(db, async (transaction) => {
        // --- READS SECTION ---
        // Idempotency: the same client request always resolves to the same
        // invoice document and can never deduct stock twice.
        const existingInvoice = await transaction.get(invoiceRef);
        if (existingInvoice.exists()) {
          if (existingInvoice.data().tenantId !== tenantId) {
            throw new Error('Invoice request is not authorized.');
          }
          return {
            id: invoiceRef.id,
            invoiceNumber: String(existingInvoice.data().invoiceNumber),
            reused: true,
          };
        }

        // 1. Get Tenant and invoice counter.
        const tenantRef = doc(db, 'tenants', tenantId);
        const tenantDoc = await transaction.get(tenantRef);
        const counterDoc = await transaction.get(counterRef);
        const usageDoc = await transaction.get(usageRef);
        let nextNumber = 1;
        if (counterDoc.exists() && counterDoc.data().year === year) {
          nextNumber = (Number(counterDoc.data().count) || 0) + 1;
        }
        const generatedInvoiceNumber = `${prefix}-${year}-${nextNumber.toString().padStart(6, '0')}`;
        
        // 2. Get all unique Product Docs needed for this invoice
        const productDocsMap = new Map<string, any>();
        for (const item of invoiceData.items) {
          if (item.productId && item.productId !== 'custom' && !productDocsMap.has(item.productId)) {
            const productRef = doc(db, 'products', item.productId);
            const productDoc = await transaction.get(productRef);
            productDocsMap.set(item.productId, productDoc);
          }
        }

        // 3. Get Customer Doc (if applicable)
        let customerDoc = null;
        let customerRef = null;
        if (invoiceData.customerId && invoiceData.customerId !== 'walk-in') {
          customerRef = doc(db, 'customers', invoiceData.customerId);
          customerDoc = await transaction.get(customerRef);
        }

        // --- VALIDATION AND IN-MEMORY PREPARATION ---

        // Verify Tenant Limits
        let tenantExists = false;
        let tenantHasUsageAndLimits = true;
        let usage = { invoicesCount: 0, productsCount: 0, usersCount: 1 };
        let limits = { maxInvoices: 50, maxProducts: 100, maxUsers: 1 };

        if (tenantDoc.exists()) {
          tenantExists = true;
          const tenant = tenantDoc.data() as Tenant;
          usage = tenant.usage || { invoicesCount: 0, productsCount: 0, usersCount: 1 };
          limits = tenant.limits || { maxInvoices: 50, maxProducts: 100, maxUsers: 1 };
          
          const monthlyInvoiceCount = usageDoc.exists()
            ? Math.max(0, Number(usageDoc.data().invoicesCount) || 0)
            : 0;
          if (monthlyInvoiceCount >= limits.maxInvoices) {
            throw new Error('Monthly invoice limit reached. Please upgrade your plan.');
          }

          if (!tenant.usage || !tenant.limits) {
            tenantHasUsageAndLimits = false;
          }
        }

        if (
          customerRef
          && (!customerDoc?.exists() || customerDoc.data().tenantId !== tenantId)
        ) {
          throw new Error('Selected customer was not found or does not belong to this store.');
        }

        // Verify combined quantities, not each duplicate line independently.
        if (!invoiceData.isQuickBill) {
          const requiredByProduct = new Map<string, { quantity: number; name: string }>();
          for (const item of invoiceData.items) {
            if (!item.productId) throw new Error(`Missing product for ${item.name}`);
            if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error(`Invalid quantity for ${item.name}`);
            const current = requiredByProduct.get(item.productId) || { quantity: 0, name: item.name };
            current.quantity += item.quantity;
            requiredByProduct.set(item.productId, current);
          }
          for (const [productId, required] of requiredByProduct) {
            const productDoc = productDocsMap.get(productId);
            if (!productDoc || !productDoc.exists() || productDoc.data().tenantId !== tenantId) {
              throw new Error(`Product ${required.name} not found or unauthorized.`);
            }
            const product = productDoc.data() as Product;
            const productBatches = product.batches || [];
            const canReconcileLegacyBatch = productBatches.length === 0
              && product.stockQuantity > 0
              && Boolean(product.batchNumber?.trim())
              && Boolean(product.expiryDate)
              && !isBatchExpired(product.expiryDate);
            const batchStock = canReconcileLegacyBatch
              ? product.stockQuantity
              : getValidBatchQuantity(productBatches);
            if (product.stockQuantity < required.quantity || batchStock < required.quantity) {
              throw new Error(`Insufficient valid batch stock for ${required.name}. Available: ${Math.min(product.stockQuantity, batchStock)}`);
            }
          }
        } else {
          for (const item of invoiceData.items) {
            if (!item.name?.trim() || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.price) || item.price < 0) {
              throw new Error('Quick bill contains invalid item data.');
            }
          }
          const requiredByProduct = new Map<string, { quantity: number; name: string }>();
          for (const item of invoiceData.items) {
            if (!item.productId || item.productId === 'custom') continue;
            const current = requiredByProduct.get(item.productId) || { quantity: 0, name: item.name };
            current.quantity += item.quantity;
            requiredByProduct.set(item.productId, current);
          }
          for (const [productId, required] of requiredByProduct) {
            const productDoc = productDocsMap.get(productId);
            if (!productDoc || !productDoc.exists() || productDoc.data().tenantId !== tenantId) {
              throw new Error(`Product ${required.name} not found or unauthorized.`);
            }
            const product = productDoc.data() as Product;
            const validStock = product.batches?.length
              ? getValidBatchQuantity(product.batches)
              : (!isBatchExpired(product.expiryDate) ? Number(product.stockQuantity) || 0 : 0);
            if ((Number(product.stockQuantity) || 0) < required.quantity || validStock < required.quantity) {
              throw new Error(`Insufficient valid batch stock for ${required.name}. Available: ${Math.min(Number(product.stockQuantity) || 0, validStock)}`);
            }
          }
        }

        // --- WRITES SECTION ---

        // 1. Initialize Tenant Usage & Limits if they didn't exist
        if (!tenantHasUsageAndLimits && tenantExists) {
          transaction.set(tenantRef, sanitizeForFirestore({ usage, limits }), { merge: true });
        }

        // 2. Create Invoice
        const storedItems: any[] = [];
        const invoice = {
          ...invoiceData,
          invoiceNumber: generatedInvoiceNumber,
          requestId,
          tenantId,
          createdBy: actorId,
          status: invoiceData.status || 'posted',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // 3. Deduct Stock and Log Stock Movements
        const updatedProducts = new Map<string, Product>();
        const inventoryItems = invoiceData.items.filter(
          item => item.productId && item.productId !== 'custom'
        );
        if (inventoryItems.length > 0) {
          for (const item of inventoryItems) {
            const productDoc = productDocsMap.get(item.productId);
            const product = updatedProducts.get(item.productId) || (productDoc.data() as Product);
            
            const previousStock = product.stockQuantity || 0;
            const newStock = Math.max(0, previousStock - item.quantity);

            let batchesList = product.batches ? [...product.batches] : [];
            if (batchesList.length === 0 && previousStock > 0) {
              if (!product.batchNumber?.trim() || !product.expiryDate) {
                throw new Error(`Missing batch details for ${item.name}. Edit the product before billing.`);
              }
              // One-time migration for products created before batch-ledger
              // tracking. The existing product summary is the authoritative
              // opening balance and is persisted with this invoice transaction.
              batchesList = [{
                batchNumber: product.batchNumber.trim(),
                mfgDate: product.manufacturingDate || product.createdAt,
                expiryDate: product.expiryDate,
                purchasePrice: Number(product.purchasePrice) || 0,
                salePrice: Number(product.sellingPrice) || Number(item.price) || 0,
                quantity: previousStock,
                createdAt: product.createdAt || serverTimestamp(),
              }];
            }
            
            const allocation = allocateFefo(batchesList, item.quantity);
            batchesList = allocation.batches;
            const batchDeductions = allocation.deductions.map(deduction => ({
              ...deduction,
              salePrice: deduction.salePrice || Number(item.price) || 0,
            }));

            const productGstRate = invoiceData.isQuickBill ? 0 : Number(product.gstPercentage) || 0;
            const requestedPrice = Number(item.price);
            if (!Number.isFinite(requestedPrice) || requestedPrice < 0) {
              throw new Error(`Invalid sale rate for ${item.name}.`);
            }
            const authoritativePrice = requestedPrice;
            const lineTax = calculateLineTax({
              quantity: item.quantity,
              rate: authoritativePrice,
              gstRate: productGstRate,
            });
            storedItems.push({ ...item, price: authoritativePrice,
              gst: roundMoney(lineTax.tax / item.quantity), gstRate: productGstRate,
              total: lineTax.total,
              purchaseCost: roundMoney(batchDeductions.reduce((sum, d) => sum + d.purchaseCost * d.quantity, 0) / item.quantity),
              batchDeductions });

            // Recalculate nearest active batch
            const activeBatches = batchesList.filter(
              batch => batch.quantity > 0 && !isBatchExpired(batch.expiryDate)
            );
            const currentBatch = activeBatches.length > 0 ? activeBatches[0] : batchesList[0];

            const updatedFields: Product = {
              ...product,
              stockQuantity: newStock,
              batches: batchesList,
              updatedAt: serverTimestamp() as any
            };

            if (currentBatch) {
              updatedFields.batchNumber = currentBatch.batchNumber ?? 'N/A';
              updatedFields.expiryDate = currentBatch.expiryDate ?? null;
              updatedFields.manufacturingDate = currentBatch.mfgDate ?? null;
              updatedFields.purchasePrice = currentBatch.purchasePrice ?? 0;
              updatedFields.sellingPrice = currentBatch.salePrice ?? 0;
            }

            updatedProducts.set(item.productId, updatedFields);

            // Log Stock Movement
            const movementRef = doc(collection(db, 'stockMovements'));
            transaction.set(movementRef, sanitizeForFirestore({
              id: movementRef.id,
              tenantId,
              type: "SALE_OUT",
              productId: item.productId,
              productName: item.name,
              batchNumber: batchDeductions.map(deduction => deduction.batchNumber).join(', ') || 'N/A',
              quantity: -item.quantity,
              previousStock,
              newStock,
              invoiceId: invoiceRef.id,
              userId: actorId,
              createdAt: serverTimestamp()
            }));
          }

          // Apply product stock updates
          for (const [productId, updatedProduct] of updatedProducts.entries()) {
            const productRef = doc(db, 'products', productId);
            const fieldsToUpdate: any = {
              stockQuantity: updatedProduct.stockQuantity,
              batches: updatedProduct.batches,
              updatedAt: serverTimestamp()
            };
            if (updatedProduct.batchNumber) {
              fieldsToUpdate.batchNumber = updatedProduct.batchNumber;
              fieldsToUpdate.expiryDate = updatedProduct.expiryDate ?? null;
              fieldsToUpdate.manufacturingDate = updatedProduct.manufacturingDate ?? null;
              fieldsToUpdate.purchasePrice = updatedProduct.purchasePrice ?? 0;
              fieldsToUpdate.sellingPrice = updatedProduct.sellingPrice ?? 0;
            }
            transaction.update(productRef, sanitizeForFirestore(fieldsToUpdate));
          }
        }

        if (invoiceData.isQuickBill) {
          storedItems.push(...invoiceData.items.filter(
            item => !item.productId || item.productId === 'custom'
          ));
        }
        const authoritativeSubtotal = addMoney(
          ...storedItems.map(item => Number(item.price) * Number(item.quantity))
        );
        const authoritativeGst = addMoney(
          ...storedItems.map(item => Number(item.gst) * Number(item.quantity))
        );
        const safeDiscount = roundMoney(
          Math.min(Math.max(0, Number(invoiceData.discount) || 0), addMoney(authoritativeSubtotal, authoritativeGst))
        );
        const authoritativeTotal = subtractMoney(
          addMoney(authoritativeSubtotal, authoritativeGst),
          safeDiscount
        );
        const amountReceived = invoiceData.paymentStatus === 'paid' ? authoritativeTotal :
          invoiceData.paymentStatus === 'partial'
            ? roundMoney(Math.min(authoritativeTotal, Math.max(0, Number(invoiceData.amountReceived) || 0)))
            : 0;
        Object.assign(invoice, { items: storedItems, subtotal: authoritativeSubtotal, gstTotal: authoritativeGst,
          discount: safeDiscount, grandTotal: authoritativeTotal, amountReceived,
          outstandingAmount: subtractMoney(authoritativeTotal, amountReceived) });
        transaction.set(invoiceRef, sanitizeForFirestore(invoice));
        transaction.set(counterRef, { count: nextNumber, year, tenantId });

        // 4. Update Customer Stats
        if (customerDoc && customerRef && customerDoc.exists() && customerDoc.data().tenantId === tenantId) {
          const updateData: any = {
            totalPurchases: increment(authoritativeTotal),
            updatedAt: serverTimestamp()
          };

          if (invoiceData.paymentStatus === 'paid') {
            updateData.totalPaid = increment(authoritativeTotal);
          } else if (invoiceData.paymentStatus === 'due') {
            updateData.outstandingBalance = increment(authoritativeTotal);
          } else if (invoiceData.paymentStatus === 'partial') {
            const amtReceived = amountReceived;
            const amtDue = authoritativeTotal - amtReceived;
            updateData.totalPaid = increment(amtReceived);
            updateData.outstandingBalance = increment(amtDue);
          }

          transaction.update(customerRef, sanitizeForFirestore(updateData));
          const ledgerRef = doc(db, 'ledgerEntries', `${tenantId}_sale_${invoiceRef.id}`);
          transaction.set(ledgerRef, sanitizeForFirestore({
            tenantId,
            partyType: 'customer',
            partyId: invoiceData.customerId,
            partyName: invoiceData.customerName,
            voucherType: 'sale',
            voucherId: invoiceRef.id,
            voucherNumber: generatedInvoiceNumber,
            referenceId: invoiceRef.id,
            referenceNumber: generatedInvoiceNumber,
            debit: authoritativeTotal,
            credit: 0,
            createdBy: actorId,
            createdAt: serverTimestamp(),
          }));
        }

        // 5. Update Tenant Usage
        if (tenantExists) {
          transaction.set(usageRef, {
            tenantId,
            month: usageMonth,
            invoicesCount: increment(1),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }

        // 6. Add Audit Log
        const logRef = doc(collection(db, 'tenants', tenantId, 'logs'));
        transaction.set(logRef, sanitizeForFirestore({
          action: 'CREATE_INVOICE',
          targetId: invoiceRef.id,
          userId: actorId,
          timestamp: serverTimestamp(),
        }));

        return { id: invoiceRef.id, invoiceNumber: generatedInvoiceNumber, reused: false };
      });
      logFirestoreOperation(OperationType.WRITE, `${COLLECTION_NAME}/${savedInvoice.id}`, 'success', savedInvoice);
      return savedInvoice;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  async getInvoicesPaginated(tenantId: string, pageSize: number = 10, lastInvoice?: any) {
    if (!tenantId) throw new Error('Tenant ID required');

    logFirestoreOperation(OperationType.LIST, COLLECTION_NAME, 'pending', { pageSize, hasLastInvoice: !!lastInvoice });
    try {
      let q = query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );

      if (lastInvoice) {
        q = query(q, startAfter(lastInvoice));
      }

      const snapshot = await getDocs(q);
      const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Invoice[];
      
      logFirestoreOperation(OperationType.LIST, COLLECTION_NAME, 'success', { count: invoices.length });
      return {
        invoices,
        lastDoc: snapshot.docs[snapshot.docs.length - 1]
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
    }
  },

  async cancelInvoice(tenantId: string, invoiceId: string, cancellationReason: string = 'Cancelled by user') {
    if (!tenantId) throw new Error('Tenant ID required');
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('You must be signed in to cancel an invoice.');

    logFirestoreOperation(OperationType.UPDATE, `${COLLECTION_NAME}/${invoiceId}`, 'pending');
    try {
      await runTransaction(db, async (transaction) => {
        const invoiceRef = doc(db, COLLECTION_NAME, invoiceId);
        const invoiceDoc = await transaction.get(invoiceRef);

        if (!invoiceDoc.exists() || invoiceDoc.data().tenantId !== tenantId) {
          throw new Error('Invoice not found or unauthorized');
        }

        const invoice = invoiceDoc.data() as Invoice;
        if (invoice.status === 'cancelled') {
          throw new Error(`Invoice ${invoice.invoiceNumber} is already cancelled.`);
        }
        if ((Number(invoice.returnCount) || 0) > 0 || (Number(invoice.returnedAmount) || 0) > 0) {
          throw new Error(
            `Invoice ${invoice.invoiceNumber} has posted sale returns and cannot be cancelled safely. Return only the remaining eligible items.`
          );
        }
        // Read every dependent document before the first write.
        const productDocs = new Map<string, any>();
        for (const item of invoice.items) {
            if (!item.productId || item.productId === 'custom' || !item.batchDeductions?.length || productDocs.has(item.productId)) continue;
            const snap = await transaction.get(doc(db, 'products', item.productId));
            if (!snap.exists() || snap.data().tenantId !== tenantId) {
              throw new Error(`Cannot reverse invoice: product ${item.name} is missing or unauthorized.`);
            }
            productDocs.set(item.productId, snap);
        }

        let customerRef: any = null;
        let customerDoc: any = null;
        let originalSaleLedgerDoc: any = null;
        if (invoice.customerId && invoice.customerId !== 'walk-in') {
          customerRef = doc(db, 'customers', invoice.customerId);
          customerDoc = await transaction.get(customerRef);
          originalSaleLedgerDoc = await transaction.get(
            doc(db, 'ledgerEntries', `${tenantId}_sale_${invoiceId}`)
          );
        }
        const invoiceMonth = toJsDate(invoice.createdAt).toISOString().slice(0, 7);
        const usageRef = doc(db, 'tenants', tenantId, 'usageCounters', invoiceMonth);
        const usageDoc = await transaction.get(usageRef);

        // Restore each exact batch captured during sale. Legacy invoices are
        // intentionally blocked rather than silently corrupting batch history.
        for (const item of invoice.items) {
          if (!item.productId || item.productId === 'custom') continue;
          if (!item.batchDeductions?.length) {
            throw new Error(`Legacy invoice ${invoice.invoiceNumber} has no batch provenance and cannot be safely deleted. Use a reviewed stock adjustment.`);
          }
          const productRef = doc(db, 'products', item.productId);
          const product = productDocs.get(item.productId).data() as Product;
          const previousStock = Number(product.stockQuantity) || 0;
          const batchesList = [...(product.batches || [])];
          for (const deduction of item.batchDeductions) {
            const index = batchesList.findIndex(b => b.batchNumber.trim().toUpperCase() === deduction.batchNumber.trim().toUpperCase());
            if (index < 0) throw new Error(`Batch ${deduction.batchNumber} no longer exists for ${item.name}.`);
            batchesList[index] = { ...batchesList[index], quantity: (Number(batchesList[index].quantity) || 0) + deduction.quantity };
          }
          batchesList.sort((a, b) => toJsDate(a.expiryDate).getTime() - toJsDate(b.expiryDate).getTime());
          const currentBatch = batchesList.find(b => b.quantity > 0) || batchesList[0];
          const restoredQuantity = item.batchDeductions.reduce((sum, d) => sum + d.quantity, 0);
          transaction.update(productRef, sanitizeForFirestore({
            stockQuantity: previousStock + restoredQuantity,
            batches: batchesList,
            batchNumber: currentBatch?.batchNumber ?? product.batchNumber,
            expiryDate: currentBatch?.expiryDate ?? product.expiryDate,
            manufacturingDate: currentBatch?.mfgDate ?? product.manufacturingDate,
            purchasePrice: currentBatch?.purchasePrice ?? product.purchasePrice,
            sellingPrice: currentBatch?.salePrice ?? product.sellingPrice,
            updatedAt: serverTimestamp()
          }));
          const movementRef = doc(collection(db, 'stockMovements'));
          transaction.set(movementRef, sanitizeForFirestore({ id: movementRef.id, tenantId, type: 'SALE_CANCEL_REVERSE',
            productId: item.productId, productName: item.name, batchNumber: item.batchDeductions.map(d => d.batchNumber).join(','),
            quantity: restoredQuantity, previousStock, newStock: previousStock + restoredQuantity,
            invoiceId, userId: actorId, createdAt: serverTimestamp() }));
        }

        if (customerDoc && customerRef) {
          if (customerDoc.exists() && customerDoc.data().tenantId === tenantId) {
            const updateData: any = {
              totalPurchases: increment(-invoice.grandTotal),
              updatedAt: serverTimestamp()
            };

            if (invoice.paymentStatus === 'paid') {
              updateData.totalPaid = increment(-invoice.grandTotal);
            } else if (invoice.paymentStatus === 'due') {
              updateData.outstandingBalance = increment(-invoice.grandTotal);
            } else if (invoice.paymentStatus === 'partial') {
              const amtReceived = (invoice as any).amountReceived || 0;
              const amtDue = invoice.grandTotal - amtReceived;
              updateData.totalPaid = increment(-amtReceived);
              updateData.outstandingBalance = increment(-amtDue);
            }

            transaction.update(customerRef, sanitizeForFirestore(updateData));
            if (originalSaleLedgerDoc?.exists()) {
              const reversalLedgerRef = doc(db, 'ledgerEntries', `${tenantId}_sale_cancel_${invoiceId}`);
              transaction.set(reversalLedgerRef, sanitizeForFirestore({
                tenantId,
                partyType: 'customer',
                partyId: invoice.customerId,
                partyName: invoice.customerName,
                voucherType: 'sale_cancel',
                voucherId: invoiceId,
                voucherNumber: invoice.invoiceNumber,
                referenceId: invoiceId,
                referenceNumber: invoice.invoiceNumber,
                debit: 0,
                credit: invoice.grandTotal,
                createdBy: actorId,
                createdAt: serverTimestamp(),
              }));
            }
          }
        }

        if (usageDoc.exists() && (Number(usageDoc.data().invoicesCount) || 0) > 0) {
          transaction.update(usageRef, {
            invoicesCount: increment(-1),
            updatedAt: serverTimestamp(),
          });
        }

        const logRef = doc(collection(db, 'tenants', tenantId, 'logs'));
        transaction.set(logRef, sanitizeForFirestore({
          action: 'CANCEL_INVOICE',
          targetId: invoiceId,
          userId: actorId,
          reason: cancellationReason.trim() || 'Cancelled by user',
          timestamp: serverTimestamp(),
        }));

        transaction.update(invoiceRef, sanitizeForFirestore({
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelledBy: actorId,
          cancellationReason: cancellationReason.trim() || 'Cancelled by user',
          updatedAt: serverTimestamp(),
        }));
      });
      logFirestoreOperation(OperationType.UPDATE, `${COLLECTION_NAME}/${invoiceId}`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${invoiceId}`);
    }
  }
};
