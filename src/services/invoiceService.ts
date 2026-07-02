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
import { Invoice, Product, Customer } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';

const COLLECTION_NAME = 'invoices';

export const invoiceService = {
  async generateInvoiceNumber(prefix: string = 'INV'): Promise<string> {
    if (!auth.currentUser) throw new Error('User not authenticated');
    const uid = auth.currentUser.uid;
    // We'll isolate counters per user for true multi-tenancy
    const counterRef = doc(db, 'counters', `invoices_${uid}`);
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
        
        transaction.set(counterRef, { count: nextNumber, year, userId: uid });
        return nextNumber;
      });
      
      return `${prefix}-${year}-${result.toString().padStart(6, '0')}`;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'counters');
      return ''; // unreachable
    }
  },

  async saveInvoice(invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!auth.currentUser) throw new Error('User not authenticated');
    const uid = auth.currentUser.uid;

    try {
      return await runTransaction(db, async (transaction) => {
        // 1. Verify stock and ownership for all items
        for (const item of invoiceData.items) {
          const productRef = doc(db, 'products', item.productId);
          const productDoc = await transaction.get(productRef);
          
          if (!productDoc.exists() || productDoc.data().userId !== uid) {
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
          userId: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        transaction.set(invoiceRef, invoice);

        // 3. Deduct Stock
        for (const item of invoiceData.items) {
          const productRef = doc(db, 'products', item.productId);
          transaction.update(productRef, {
            stockQuantity: increment(-item.quantity),
            updatedAt: serverTimestamp()
          });
        }

        // 4. Update Customer Stats
        if (invoiceData.customerId && invoiceData.customerId !== 'walk-in') {
          const customerRef = doc(db, 'customers', invoiceData.customerId);
          const customerDoc = await transaction.get(customerRef);
          
          if (customerDoc.exists() && customerDoc.data().userId === uid) {
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

        return invoiceRef.id;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  async getInvoicesPaginated(pageSize: number = 10, lastInvoice?: any) {
    if (!auth.currentUser) throw new Error('User not authenticated');
    const uid = auth.currentUser.uid;

    try {
      let q = query(
        collection(db, COLLECTION_NAME),
        where('userId', '==', uid),
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

  async deleteInvoice(invoiceId: string) {
    if (!auth.currentUser) throw new Error('User not authenticated');
    const uid = auth.currentUser.uid;

    try {
      await runTransaction(db, async (transaction) => {
        const invoiceRef = doc(db, COLLECTION_NAME, invoiceId);
        const invoiceDoc = await transaction.get(invoiceRef);

        if (!invoiceDoc.exists() || invoiceDoc.data().userId !== uid) {
          throw new Error('Invoice not found or unauthorized');
        }

        const invoice = invoiceDoc.data() as Invoice;

        // 1. Restore Stock
        for (const item of invoice.items) {
          const productRef = doc(db, 'products', item.productId);
          transaction.update(productRef, {
            stockQuantity: increment(item.quantity),
            updatedAt: serverTimestamp()
          });
        }

        // 2. Revert Customer Stats
        if (invoice.customerId && invoice.customerId !== 'walk-in') {
          const customerRef = doc(db, 'customers', invoice.customerId);
          const customerDoc = await transaction.get(customerRef);
          
          if (customerDoc.exists() && customerDoc.data().userId === uid) {
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

        // 3. Delete Invoice
        transaction.delete(invoiceRef);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${invoiceId}`);
    }
  }
};
