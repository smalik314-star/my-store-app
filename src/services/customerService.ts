import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  orderBy,
  getDoc,
  limit,
  startAfter,
  startAt,
  endAt
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Customer } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import { dedupeById, getSearchVariants, normalizeSearchIndex } from '../utils/search';

const COLLECTION_NAME = 'customers';
const buildCustomerSearchFields = (data: Partial<Customer>) => ({
  nameSearch: normalizeSearchIndex(data.name),
  phoneSearch: normalizeSearchIndex(data.phone),
  emailSearch: normalizeSearchIndex(data.email),
});

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
  async getCustomers(tenantId: string) {
    if (!tenantId) return [];

    try {
      const q = query(collection(db, COLLECTION_NAME), where('tenantId', '==', tenantId));
      const snapshot = await getDocs(q);
      const customers = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Customer))
        .filter(customer => customer.recordStatus !== 'inactive');
      // Client-side sort by name
      customers.sort((a, b) => a.name.localeCompare(b.name));
      return customers;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return [];
    }
  },

  async getCustomersPaginated(tenantId: string, pageSize: number = 15, lastVisibleDoc: any = null) {
    if (!tenantId) return null;

    try {
      let q = query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
        limit(pageSize)
      );

      if (lastVisibleDoc) {
        q = query(q, startAfter(lastVisibleDoc));
      }

      const snapshot = await getDocs(q);
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      const customers = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as Customer))
        .filter(customer => customer.recordStatus !== 'inactive');

      // Client-side sort by name
      customers.sort((a, b) => a.name.localeCompare(b.name));

      return { customers, lastDoc, hasMore: snapshot.docs.length === pageSize };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return null;
    }
  },

  async searchCustomers(tenantId: string, searchTerm: string, pageSize: number = 5) {
    if (!tenantId) return [];
    const term = searchTerm.trim();
    if (term.length < 2) return [];
    const normalizedVariants = Array.from(new Set(
      getSearchVariants(term).map(variant => normalizeSearchIndex(variant)).filter(Boolean)
    ));

    try {
      const queries = normalizedVariants.map(variant =>
        getDocs(query(
          collection(db, COLLECTION_NAME),
          where('tenantId', '==', tenantId),
          orderBy('nameSearch'),
          startAt(variant),
          endAt(`${variant}\uf8ff`),
          limit(pageSize)
        ))
      );
      if (/^\d+$/.test(term)) {
        const phoneQuery = query(
          collection(db, COLLECTION_NAME),
          where('tenantId', '==', tenantId),
          orderBy('phone'),
          startAt(term),
          endAt(`${term}\uf8ff`),
          limit(pageSize)
        );
        queries.push(getDocs(phoneQuery));
      }

      const snapshots = await Promise.all(queries);
      return dedupeById(
        snapshots.flatMap(snapshot =>
          snapshot.docs.map(row => ({ id: row.id, ...row.data() } as Customer))
        )
      )
        .filter(customer => customer.recordStatus !== 'inactive')
        .slice(0, pageSize);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `${COLLECTION_NAME}:search`);
      return [];
    }
  },

  async getCustomersByIds(tenantId: string, customerIds: string[]) {
    if (!tenantId || customerIds.length === 0) return [];

    try {
      const docs = await Promise.all(
        Array.from(new Set(customerIds)).map(id => getDoc(doc(db, COLLECTION_NAME, id)))
      );
      return docs
        .filter(snapshot => snapshot.exists() && snapshot.data().tenantId === tenantId)
        .map(snapshot => ({ id: snapshot.id, ...snapshot.data() } as Customer))
        .filter(customer => customer.recordStatus !== 'inactive');
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `${COLLECTION_NAME}:recent`);
      return [];
    }
  },

  async addCustomer(tenantId: string, customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>) {
    if (!tenantId) throw new Error('Tenant ID required');
    const sanitized = sanitizeCustomer(customerData);

    try {
      // Blank phone numbers are allowed for retail customers. Only a supplied
      // phone number is a stable duplicate key.
      if (sanitized.phone) {
        const q = query(
          collection(db, COLLECTION_NAME),
          where('tenantId', '==', tenantId),
          where('phone', '==', sanitized.phone)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          throw new Error('A customer with this phone number already exists.');
        }
      }

      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...sanitized,
        ...buildCustomerSearchFields(sanitized),
        tenantId,
        outstandingBalance: sanitized.outstandingBalance || 0,
        totalPurchases: sanitized.totalPurchases || 0,
        totalPaid: sanitized.totalPaid || 0,
        recordStatus: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
    }
  },

  async updateCustomer(tenantId: string, id: string, customerData: Partial<Customer>) {
    if (!tenantId) throw new Error('Tenant ID required');
    const sanitized = sanitizeCustomer(customerData);

    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const currentDoc = await getDoc(docRef);
      if (!currentDoc.exists() || currentDoc.data().tenantId !== tenantId) {
        throw new Error('Unauthorized or customer not found');
      }

      await updateDoc(docRef, {
        ...sanitized,
        ...buildCustomerSearchFields({ ...(currentDoc.data() as Customer), ...sanitized }),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async deleteCustomer(tenantId: string, id: string) {
    if (!tenantId) throw new Error('Tenant ID required');

    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const currentDoc = await getDoc(docRef);
      if (!currentDoc.exists() || currentDoc.data().tenantId !== tenantId) {
        throw new Error('Unauthorized or customer not found');
      }
      const customer = currentDoc.data() as Customer;
      if ((Number(customer.outstandingBalance) || 0) > 0) {
        throw new Error('Customer has outstanding dues. Clear the balance before archiving.');
      }
      const actorId = auth.currentUser?.uid;
      if (!actorId) throw new Error('You must be signed in to archive a customer.');

      await updateDoc(docRef, {
        recordStatus: 'inactive',
        archivedAt: serverTimestamp(),
        archivedBy: actorId,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  }
};
