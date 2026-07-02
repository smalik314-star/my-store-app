import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  orderBy,
  getDoc,
  limit,
  startAfter
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Customer } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';

const COLLECTION_NAME = 'customers';

const sanitizeCustomer = (data: any) => {
  const sanitized: any = {};
  Object.keys(data).forEach(key => {
    if (typeof data[key] === 'string') {
      sanitized[key] = data[key].trim();
    } else {
      sanitized[key] = data[key];
    }
  });
  return sanitized;
};

export const customerService = {
  async getCustomers() {
    if (!auth.currentUser) return [];
    const uid = auth.currentUser.uid;
    try {
      const q = query(collection(db, COLLECTION_NAME), where('userId', '==', uid));
      const snapshot = await getDocs(q);
      const customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      // Client-side sort by name
      customers.sort((a, b) => a.name.localeCompare(b.name));
      return customers;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return [];
    }
  },

  async getCustomersPaginated(pageSize: number = 15, lastVisibleDoc: any = null) {
    if (!auth.currentUser) return null;
    const uid = auth.currentUser.uid;
    try {
      let q = query(
        collection(db, COLLECTION_NAME),
        where('userId', '==', uid),
        limit(pageSize)
      );

      if (lastVisibleDoc) {
        q = query(q, startAfter(lastVisibleDoc));
      }

      const snapshot = await getDocs(q);
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      const customers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Customer));

      // Client-side sort by name
      customers.sort((a, b) => a.name.localeCompare(b.name));

      return { customers, lastDoc, hasMore: snapshot.docs.length === pageSize };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return null;
    }
  },

  async addCustomer(customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!auth.currentUser) throw new Error('User not authenticated');
    const uid = auth.currentUser.uid;
    const sanitized = sanitizeCustomer(customerData);

    try {
      // Check for duplicate phone for this user
      const q = query(
        collection(db, COLLECTION_NAME), 
        where('userId', '==', uid),
        where('phone', '==', sanitized.phone)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        throw new Error('A customer with this phone number already exists.');
      }

      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...sanitized,
        userId: uid,
        outstandingBalance: sanitized.outstandingBalance || 0,
        totalPurchases: sanitized.totalPurchases || 0,
        totalPaid: sanitized.totalPaid || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
    }
  },

  async updateCustomer(id: string, customerData: Partial<Customer>) {
    if (!auth.currentUser) throw new Error('User not authenticated');
    const uid = auth.currentUser.uid;
    const sanitized = sanitizeCustomer(customerData);

    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const currentDoc = await getDoc(docRef);
      if (!currentDoc.exists() || currentDoc.data().userId !== uid) {
        throw new Error('Unauthorized or customer not found');
      }

      await updateDoc(docRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async deleteCustomer(id: string) {
    if (!auth.currentUser) throw new Error('User not authenticated');
    const uid = auth.currentUser.uid;

    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const currentDoc = await getDoc(docRef);
      if (!currentDoc.exists() || currentDoc.data().userId !== uid) {
        throw new Error('Unauthorized or customer not found');
      }

      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  }
};
