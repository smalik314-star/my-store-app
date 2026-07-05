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
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import { tenantService } from './tenantService';
import { toJsDate } from '../utils/date';

const COLLECTION_NAME = 'invoices';

export const invoiceService = {
  async generateInvoiceNumber(tenantId: string, prefix: string = 'INV'): Promise<string> {
    if (!tenantId) throw new Error('Tenant ID required');

    const counterRef = doc(db, 'counters', `invoices_${tenantId}`);
    const year = new Date().getFullYear();
    
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
      
      return `${prefix}-${year}-${result.toString().padStart(6, '0')}`;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'counters');
      return ''; // unreachable
    }
  },

  async saveInvoice(tenantId: string, invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>) {
    if (!tenantId) throw new Error('Tenant ID required');

    try {
      return await runTransaction(db, async (transaction) => {
        // 0. Check Limits
        const tenantRef = doc(db, 'tenants', tenantId);
        const tenantDoc = await transaction.get(tenantRef);
        if (tenantDoc.exists()) {
          const tenant = tenantDoc.data() as Tenant;
          if (tenant.usage.invoicesCount >= tenant.limits.maxInvoices) {
            throw new Error('Monthly invoice limit reached. Please upgrade your plan.');
          }
        }

        // 1. Verify stock and ownership for all items
        for (const item of invoiceData.items) {
          const productRef = doc(db, 'products', item.productId);
          const productDoc = await transaction.get(productRef);
          
          if (!productDoc.exists() || productDoc.data().tenantId !== tenantId) {
            throw new Error(`Product ${item.name} not found or unauthorized.`);
          }
          
          const product = productDoc.data() as Product;
          if (product.stockQuantity < item.quantity) {
            throw new Error(`Insufficient stock for ${item.name}. Available: ${product.stockQuantity}`);
          }
        }

        // 2. Create Invoice
        const invoiceRef = doc(collection(db, COLLECTION_NAME));
        const invoice = {
          ...invoiceData,
          tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        transaction.set(invoiceRef, invoice);

        // 3. Deduct Stock (with FEFO Batch deduction)
        for (const item of invoiceData.items) {
          const productRef = doc(db, 'products', item.productId);
          const productDoc = await transaction.get(productRef);
          
          if (productDoc.exists()) {
            const product = productDoc.data() as Product;
            const previousStock = product.stockQuantity || 0;
            const newStock = Math.max(0, previousStock - item.quantity);

            let batchesList = product.batches ? [...product.batches] : [];
            
            // Sort by expiry date ascending for FEFO
            batchesList.sort((a, b) => {
              const dateA = toJsDate(a.expiryDate).getTime();
              const dateB = toJsDate(b.expiryDate).getTime();
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

            transaction.update(productRef, updatedFields);

            // Log Stock Movement
            const movementRef = doc(collection(db, 'stockMovements'));
            transaction.set(movementRef, {
              id: movementRef.id,
              tenantId,
              type: "SALE_OUT",
              productId: item.productId,
              productName: item.name,
              batchNumber: currentBatch ? currentBatch.batchNumber : 'N/A',
              quantity: -item.quantity,
              previousStock,
              newStock,
              invoiceId: invoiceRef.id,
              createdAt: serverTimestamp()
            });
          }
        }

        // 4. Update Customer Stats
        if (invoiceData.customerId && invoiceData.customerId !== 'walk-in') {
          const customerRef = doc(db, 'customers', invoiceData.customerId);
          const customerDoc = await transaction.get(customerRef);
          
          if (customerDoc.exists() && customerDoc.data().tenantId === tenantId) {
            const updateData: any = {
              totalPurchases: increment(invoiceData.grandTotal),
              updatedAt: serverTimestamp()
            };

            if (invoiceData.paymentStatus === 'paid') {
              updateData.totalPaid = increment(invoiceData.grandTotal);
            } else if (invoiceData.paymentStatus === 'due') {
              updateData.outstandingBalance = increment(invoiceData.grandTotal);
            }

            transaction.update(customerRef, updateData);
          }
        }

        // 5. Update Tenant Usage
        transaction.update(tenantRef, {
          'usage.invoicesCount': increment(1),
          updatedAt: serverTimestamp()
        });

        // 6. Add Audit Log
        const logRef = doc(collection(db, 'tenants', tenantId, 'logs'));
        transaction.set(logRef, {
          action: 'CREATE_INVOICE',
          targetId: invoiceRef.id,
          userId: auth.currentUser?.uid || null,
          timestamp: serverTimestamp(),
        });

        return invoiceRef.id;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  async getInvoicesPaginated(tenantId: string, pageSize: number = 10, lastInvoice?: any) {
    if (!tenantId) throw new Error('Tenant ID required');

    try {
      let q = query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
        limit(pageSize)
      );

      if (lastInvoice) {
        q = query(q, startAfter(lastInvoice));
      }

      const snapshot = await getDocs(q);
      const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Invoice[];
      
      // Client-side sort by createdAt DESC
      invoices.sort((a, b) => {
        const dateA = typeof a.createdAt?.toDate === 'function' ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = typeof b.createdAt?.toDate === 'function' ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

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
                mfgDate: product.manufacturingDate || serverTimestamp(),
                expiryDate: product.expiryDate || serverTimestamp(),
                purchasePrice: product.purchasePrice || 0,
                salePrice: product.sellingPrice || 0,
                quantity: item.quantity,
                createdAt: serverTimestamp()
              });
            }

            // Sort batches
            batchesList.sort((a, b) => {
              const dateA = toJsDate(a.expiryDate).getTime();
              const dateB = toJsDate(b.expiryDate).getTime();
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

            transaction.update(productRef, updatedFields);

            // Log Stock Movement Reversal
            const movementRef = doc(collection(db, 'stockMovements'));
            transaction.set(movementRef, {
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
            });
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
            }

            transaction.update(customerRef, updateData);
          }
        }

        // 3. Update Tenant Usage
        const tenantRef = doc(db, 'tenants', tenantId);
        transaction.update(tenantRef, {
          'usage.invoicesCount': increment(-1),
          updatedAt: serverTimestamp()
        });

        // 4. Audit Log
        const logRef = doc(collection(db, 'tenants', tenantId, 'logs'));
        transaction.set(logRef, {
          action: 'DELETE_INVOICE',
          targetId: invoiceId,
          userId: auth.currentUser?.uid || null,
          timestamp: serverTimestamp(),
        });

        // 5. Delete Invoice
        transaction.delete(invoiceRef);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${invoiceId}`);
    }
  }
};
