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
    // Only pass through real Firestore Timestamp instances (or serverTimestamp sentinels).
    // Generic plain objects that merely expose a `toDate` method are serialized below.
    if (obj.constructor && obj.constructor.name === 'Timestamp') {
      return obj;
    }
    if (typeof obj.toDate === 'function') {
      // Firestore serverTimestamp() sentinel (FieldValue) — keep as-is.
      if (obj.constructor && obj.constructor.name === 'FieldValue') {
        return obj;
      }
      // Generic object with toDate — fall through to serialize its enumerable fields.
    }
    if (obj.constructor && obj.constructor.name !== 'Object') {
      // Non-plain class instances (e.g., Date already handled above) — pass through
      // only if they don't carry enumerable data worth sanitizing.
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
        for (const item of invoiceData.items) {
          if (item.productId && !productDocsMap.has(item.productId)) {
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
          
          if (usage.invoicesCount >= limits.maxInvoices) {
            throw new Error('Monthly invoice limit reached. Please upgrade your plan.');
          }

          if (!tenant.usage || !tenant.limits) {
            tenantHasUsageAndLimits = false;
          }
        }

        // Verify Product Stock and Ownership
        // For quick bills, only validate items that reference a real productId.
        // Pure custom items (no productId) are skipped.
        for (const item of invoiceData.items) {
          if (!item.productId) continue;
          const productDoc = productDocsMap.get(item.productId);
          if (!productDoc || !productDoc.exists() || productDoc.data().tenantId !== tenantId) {
            throw new Error(`Product ${item.name} not found or unauthorized.`);
          }
          
          const product = productDoc.data() as Product;
          if (product.stockQuantity < item.quantity) {
            throw new Error(`Insufficient stock for ${item.name}. Available: ${product.stockQuantity}`);
          }
        }

        // --- WRITES SECTION ---

        // 1. Initialize Tenant Usage & Limits if they didn't exist
        if (!tenantHasUsageAndLimits && tenantExists) {
          transaction.set(tenantRef, sanitizeForFirestore({ usage, limits }), { merge: true });
        }

        // 2. Create Invoice
        const invoiceRef = doc(collection(db, COLLECTION_NAME));
        const invoice = {
          ...invoiceData,
          tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        transaction.set(invoiceRef, sanitizeForFirestore(invoice));

        // 3. Deduct Stock and Log Stock Movements
        // For quick bills, still track stock for items that have a productId,
        // so inventory stays in sync. Pure custom items (no productId) are skipped.
        const updatedProducts = new Map<string, Product>();
        const stockTrackedItems = invoiceData.items.filter(item => !!item.productId);
        if (stockTrackedItems.length > 0) {
          for (const item of stockTrackedItems) {
            const productDoc = productDocsMap.get(item.productId);
            const product = updatedProducts.get(item.productId) || (productDoc.data() as Product);
            
            const previousStock = product.stockQuantity || 0;
            const newStock = Math.max(0, previousStock - item.quantity);

            let batchesList = product.batches ? [...product.batches] : [];
            
            // Sort by expiry date ascending for FEFO
            batchesList.sort((a, b) => {
              const dateA = toJsDate(a.expiryDate)?.getTime() ?? 0;
              const dateB = toJsDate(b.expiryDate)?.getTime() ?? 0;
              return dateA - dateB;
            });

            let remainingToDeduct = item.quantity;
            for (let i = 0; i < batchesList.length; i++) {
              if (remainingToDeduct <= 0) break;
              const b = batchesList[i];
              if (b.quantity > 0) {
                const deduct = Math.min(b.quantity, remainingToDeduct);
                b.quantity -= deduct;
                remainingToDeduct -= deduct;
              }
            }

            // Fallback: If still remaining, subtract from first batch even if it goes negative
            if (remainingToDeduct > 0 && batchesList.length > 0) {
              batchesList[0].quantity -= remainingToDeduct;
            }

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

        // 4. Update Customer Stats
        if (customerDoc && customerRef && customerDoc.exists() && customerDoc.data().tenantId === tenantId) {
          const updateData: any = {
            totalPurchases: increment(invoiceData.grandTotal),
            updatedAt: serverTimestamp()
          };

          if (invoiceData.paymentStatus === 'paid') {
            updateData.totalPaid = increment(invoiceData.grandTotal);
          } else if (invoiceData.paymentStatus === 'due') {
            updateData.outstandingBalance = increment(invoiceData.grandTotal);
          } else if (invoiceData.paymentStatus === 'partial') {
            const amtReceived = (invoiceData as any).amountReceived || 0;
            const amtDue = invoiceData.grandTotal - amtReceived;
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
      // Server-side ordering by createdAt DESC ensures pagination order
      // matches display order (no client-side re-sort needed).
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

        // 1. Restore Stock (Batch aware)
        for (const item of invoice.items) {
          const productRef = doc(db, 'products', item.productId);
          const productDoc = await transaction.get(productRef);

          if (productDoc.exists()) {
            const product = productDoc.data() as Product;
            const previousStock = product.stockQuantity || 0;
            const newStock = previousStock + item.quantity;

            let batchesList = product.batches ? [...product.batches] : [];

            if (batchesList.length > 0) {
              // Add back to the nearest active/expiry batch
              batchesList[0].quantity += item.quantity;
            } else {
              // Create a fallback batch if no batches exist
              batchesList.push({
                batchNumber: product.batchNumber || 'FIT-001',
                mfgDate: product.manufacturingDate || new Date(),
                expiryDate: product.expiryDate || new Date(),
                purchasePrice: product.purchasePrice || 0,
                salePrice: product.sellingPrice || 0,
                quantity: item.quantity,
                createdAt: new Date()
              });
            }

            // Sort batches
            batchesList.sort((a, b) => {
              const dateA = toJsDate(a.expiryDate)?.getTime() ?? 0;
              const dateB = toJsDate(b.expiryDate)?.getTime() ?? 0;
              return dateA - dateB;
            });

            const activeBatches = batchesList.filter(b => b.quantity > 0);
            const currentBatch = activeBatches.length > 0 ? activeBatches[0] : batchesList[0];

            const updatedFields: Partial<Product> = {
              stockQuantity: newStock,
              batches: batchesList,
              updatedAt: serverTimestamp()
            };

            if (currentBatch) {
              updatedFields.batchNumber = currentBatch.batchNumber;
              updatedFields.expiryDate = currentBatch.expiryDate;
              updatedFields.manufacturingDate = currentBatch.mfgDate;
              updatedFields.purchasePrice = currentBatch.purchasePrice;
              updatedFields.sellingPrice = currentBatch.salePrice;
            }

            transaction.update(productRef, sanitizeForFirestore(updatedFields));

            // Log Stock Movement Reversal
            const movementRef = doc(collection(db, 'stockMovements'));
            transaction.set(movementRef, sanitizeForFirestore({
              id: movementRef.id,
              tenantId,
              type: "SALE_RETURN",
              productId: item.productId,
              productName: item.name,
              batchNumber: currentBatch ? currentBatch.batchNumber : 'N/A',
              quantity: item.quantity,
              previousStock,
              newStock,
              invoiceId,
              createdAt: serverTimestamp()
            }));
          }
        }

        // 2. Revert Customer Stats
        if (invoice.customerId && invoice.customerId !== 'walk-in') {
          const customerRef = doc(db, 'customers', invoice.customerId);
          const customerDoc = await transaction.get(customerRef);
          
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

        // 3. Update Tenant Usage
        const tenantRef = doc(db, 'tenants', tenantId);
        const tenantDoc = await transaction.get(tenantRef);
        if (tenantDoc.exists()) {
          transaction.update(tenantRef, {
            'usage.invoicesCount': increment(-1),
            updatedAt: serverTimestamp()
          });
        }

        // 4. Audit Log
        const logRef = doc(collection(db, 'tenants', tenantId, 'logs'));
        transaction.set(logRef, sanitizeForFirestore({
          action: 'DELETE_INVOICE',
          targetId: invoiceId,
          userId: auth.currentUser?.uid || null,
          timestamp: serverTimestamp(),
        }));

        // 5. Delete Invoice
        transaction.delete(invoiceRef);
      });
      logFirestoreOperation(OperationType.DELETE, `${COLLECTION_NAME}/${invoiceId}`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${invoiceId}`);
    }
  }
};
