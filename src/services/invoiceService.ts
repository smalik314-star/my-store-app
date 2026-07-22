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

  async saveInvoice(tenantId: string, invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>) {
    if (!tenantId) throw new Error('Tenant ID required');

    logFirestoreOperation(OperationType.WRITE, COLLECTION_NAME, 'pending', { invoiceData });
    try {
      const createdInvoiceId = await runTransaction(db, async (transaction) => {
        // --- READS SECTION ---
        
        // 1. Get Tenant Doc
        const tenantRef = doc(db, 'tenants', tenantId);
        const tenantDoc = await transaction.get(tenantRef);
        
        // 2. Get all unique Product Docs needed for this invoice
        const productDocsMap = new Map<string, any>();
        // Quick Bills are intentionally stock-neutral and can contain custom
        // counter items. Do not read product documents for them: a custom or
        // deleted product has no resource.data and a secure Firestore rule must
        // reject that document read. Normal invoices still load and validate
        // every product before deducting stock.
        if (!invoiceData.isQuickBill) {
          for (const item of invoiceData.items) {
            if (item.productId && !productDocsMap.has(item.productId)) {
              const productRef = doc(db, 'products', item.productId);
              const productDoc = await transaction.get(productRef);
              productDocsMap.set(item.productId, productDoc);
            }
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
          
          if (usage.invoicesCount >= limits.maxInvoices) {
            throw new Error('Monthly invoice limit reached. Please upgrade your plan.');
          }

          if (!tenant.usage || !tenant.limits) {
            tenantHasUsageAndLimits = false;
          }
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
              && Boolean(product.expiryDate);
            const batchStock = canReconcileLegacyBatch
              ? product.stockQuantity
              : productBatches.reduce((sum, batch) => sum + Math.max(0, Number(batch.quantity) || 0), 0);
            if (product.stockQuantity < required.quantity || batchStock < required.quantity) {
              throw new Error(`Insufficient reconciled batch stock for ${required.name}. Available: ${Math.min(product.stockQuantity, batchStock)}`);
            }
          }
        } else {
          for (const item of invoiceData.items) {
            if (!item.name?.trim() || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.price) || item.price < 0) {
              throw new Error('Quick bill contains invalid item data.');
            }
          }
        }

        // --- WRITES SECTION ---

        // 1. Initialize Tenant Usage & Limits if they didn't exist
        if (!tenantHasUsageAndLimits && tenantExists) {
          transaction.set(tenantRef, sanitizeForFirestore({ usage, limits }), { merge: true });
        }

        // 2. Create Invoice
        const invoiceRef = doc(collection(db, COLLECTION_NAME));
        const storedItems: any[] = [];
        const invoice = {
          ...invoiceData,
          tenantId,
          createdBy: auth.currentUser?.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // 3. Deduct Stock and Log Stock Movements
        const updatedProducts = new Map<string, Product>();
        if (!invoiceData.isQuickBill) {
          for (const item of invoiceData.items) {
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
            
            // Sort by expiry date ascending for FEFO
            batchesList.sort((a, b) => {
              const dateA = toJsDate(a.expiryDate).getTime();
              const dateB = toJsDate(b.expiryDate).getTime();
              return dateA - dateB;
            });

            let remainingToDeduct = item.quantity;
            const batchDeductions: any[] = [];
            for (let i = 0; i < batchesList.length; i++) {
              if (remainingToDeduct <= 0) break;
              const b = batchesList[i];
              if (b.quantity > 0) {
                const deduct = Math.min(b.quantity, remainingToDeduct);
                batchDeductions.push({
                  batchNumber: b.batchNumber,
                  quantity: deduct,
                  purchaseCost: Number(b.purchasePrice) || 0,
                  salePrice: Number(b.salePrice) || Number(item.price) || 0,
                  expiryDate: b.expiryDate ?? null
                });
                b.quantity -= deduct;
                remainingToDeduct -= deduct;
              }
            }

            if (remainingToDeduct > 0) throw new Error(`Batch stock mismatch for ${item.name}. Reconcile inventory before billing.`);

            const productGstRate = Number(product.gstPercentage) || 0;
            const authoritativePrice = Number(product.sellingPrice) || 0;
            const lineGst = authoritativePrice * productGstRate / 100;
            storedItems.push({ ...item, price: authoritativePrice, gst: lineGst, gstRate: productGstRate,
              total: item.quantity * (authoritativePrice + lineGst),
              purchaseCost: batchDeductions.reduce((sum, d) => sum + d.purchaseCost * d.quantity, 0) / item.quantity,
              batchDeductions });

            // Recalculate nearest active batch
            const activeBatches = batchesList.filter(b => b.quantity > 0);
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
              batchNumber: currentBatch ? (currentBatch.batchNumber ?? 'N/A') : 'N/A',
              quantity: -item.quantity,
              previousStock,
              newStock,
              invoiceId: invoiceRef.id,
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

        if (invoiceData.isQuickBill) storedItems.push(...invoiceData.items);
        const authoritativeSubtotal = storedItems.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
        const authoritativeGst = storedItems.reduce((sum, item) => sum + Number(item.gst) * Number(item.quantity), 0);
        const safeDiscount = Math.min(Math.max(0, Number(invoiceData.discount) || 0), authoritativeSubtotal + authoritativeGst);
        const authoritativeTotal = Math.round((authoritativeSubtotal + authoritativeGst - safeDiscount) * 100) / 100;
        const amountReceived = invoiceData.paymentStatus === 'paid' ? authoritativeTotal :
          invoiceData.paymentStatus === 'partial' ? Math.min(authoritativeTotal, Math.max(0, Number(invoiceData.amountReceived) || 0)) : 0;
        Object.assign(invoice, { items: storedItems, subtotal: authoritativeSubtotal, gstTotal: authoritativeGst,
          discount: safeDiscount, grandTotal: authoritativeTotal, amountReceived, outstandingAmount: authoritativeTotal - amountReceived });
        transaction.set(invoiceRef, sanitizeForFirestore(invoice));

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
        }

        // 5. Update Tenant Usage
        if (tenantExists) {
          transaction.update(tenantRef, {
            'usage.invoicesCount': increment(1),
            updatedAt: serverTimestamp()
          });
        }

        // 6. Add Audit Log
        const logRef = doc(collection(db, 'tenants', tenantId, 'logs'));
        transaction.set(logRef, sanitizeForFirestore({
          action: 'CREATE_INVOICE',
          targetId: invoiceRef.id,
          userId: auth.currentUser?.uid || null,
          timestamp: serverTimestamp(),
        }));

        return invoiceRef.id;
      });
      logFirestoreOperation(OperationType.WRITE, `${COLLECTION_NAME}/${createdInvoiceId}`, 'success', { createdInvoiceId });
      return createdInvoiceId;
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

  async deleteInvoice(tenantId: string, invoiceId: string) {
    if (!tenantId) throw new Error('Tenant ID required');

    logFirestoreOperation(OperationType.DELETE, `${COLLECTION_NAME}/${invoiceId}`, 'pending');
    try {
      await runTransaction(db, async (transaction) => {
        const invoiceRef = doc(db, COLLECTION_NAME, invoiceId);
        const invoiceDoc = await transaction.get(invoiceRef);

        if (!invoiceDoc.exists() || invoiceDoc.data().tenantId !== tenantId) {
          throw new Error('Invoice not found or unauthorized');
        }

        const invoice = invoiceDoc.data() as Invoice;
        // Read every dependent document before the first write.
        const productDocs = new Map<string, any>();
        if (!invoice.isQuickBill) {
          for (const item of invoice.items) {
            if (!item.productId || productDocs.has(item.productId)) continue;
            const snap = await transaction.get(doc(db, 'products', item.productId));
            if (!snap.exists() || snap.data().tenantId !== tenantId) {
              throw new Error(`Cannot reverse invoice: product ${item.name} is missing or unauthorized.`);
            }
            productDocs.set(item.productId, snap);
          }
        }

        let customerRef: any = null;
        let customerDoc: any = null;
        if (invoice.customerId && invoice.customerId !== 'walk-in') {
          customerRef = doc(db, 'customers', invoice.customerId);
          customerDoc = await transaction.get(customerRef);
        }
        const tenantRef = doc(db, 'tenants', tenantId);
        const tenantDoc = await transaction.get(tenantRef);

        // Restore each exact batch captured during sale. Legacy invoices are
        // intentionally blocked rather than silently corrupting batch history.
        for (const item of invoice.items) {
          if (invoice.isQuickBill) continue;
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
          transaction.set(movementRef, sanitizeForFirestore({ id: movementRef.id, tenantId, type: 'SALE_RETURN',
            productId: item.productId, productName: item.name, batchNumber: item.batchDeductions.map(d => d.batchNumber).join(','),
            quantity: restoredQuantity, previousStock, newStock: previousStock + restoredQuantity,
            invoiceId, createdAt: serverTimestamp() }));
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
          }
        }

        if (tenantDoc.exists()) {
          transaction.update(tenantRef, {
            'usage.invoicesCount': increment(-1),
            updatedAt: serverTimestamp()
          });
        }

        const logRef = doc(collection(db, 'tenants', tenantId, 'logs'));
        transaction.set(logRef, sanitizeForFirestore({
          action: 'DELETE_INVOICE',
          targetId: invoiceId,
          userId: auth.currentUser?.uid || null,
          timestamp: serverTimestamp(),
        }));

        transaction.delete(invoiceRef);
      });
      logFirestoreOperation(OperationType.DELETE, `${COLLECTION_NAME}/${invoiceId}`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${invoiceId}`);
    }
  }
};
