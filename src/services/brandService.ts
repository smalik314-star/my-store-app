import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Brand } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';

const COLLECTION_NAME = 'brands';

export const brandService = {
  async getBrands(tenantId: string): Promise<Brand[]> {
    if (!tenantId) return [];
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Brand[];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return [];
    }
  },

  async addBrandIfNotExists(tenantId: string, name: string): Promise<string | null> {
    if (!tenantId || !name.trim()) return null;
    const trimmedName = name.trim();
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
        where('name', '==', trimmedName)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return snapshot.docs[0].id;
      }

      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        name: trimmedName,
        tenantId,
        createdAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
      return null;
    }
  }
};
