import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy,
  limit,
  startAt,
  endAt,
  where, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Brand } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import { getSearchVariants, normalizeSearchIndex } from '../utils/search';

const COLLECTION_NAME = 'brands';
const buildBrandSearchFields = (name: string) => ({
  nameSearch: normalizeSearchIndex(name),
});

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
        ...buildBrandSearchFields(trimmedName),
        tenantId,
        createdAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
      return null;
    }
  },

  async searchBrands(tenantId: string, searchTerm: string, pageSize: number = 12): Promise<string[]> {
    if (!tenantId) return [];
    const rawQuery = searchTerm.trim();
    const normalizedVariants = Array.from(new Set(
      getSearchVariants(searchTerm).map(variant => normalizeSearchIndex(variant)).filter(Boolean)
    ));
    if (!rawQuery || normalizedVariants.length === 0) return [];

    try {
      const snapshots = await Promise.all([
        ...normalizedVariants.map(variant => getDocs(query(
          collection(db, COLLECTION_NAME),
          where('tenantId', '==', tenantId),
          orderBy('nameSearch'),
          startAt(variant),
          endAt(`${variant}\uf8ff`),
          limit(pageSize)
        ))),
        ...getSearchVariants(rawQuery).map(variant => getDocs(query(
          collection(db, COLLECTION_NAME),
          where('tenantId', '==', tenantId),
          orderBy('name'),
          startAt(variant),
          endAt(`${variant}\uf8ff`),
          limit(pageSize)
        ))),
      ]);

      return Array.from(new Set(
        snapshots.flatMap(snapshot => snapshot.docs.map(doc => String(doc.data().name || '').trim()).filter(Boolean))
      )).slice(0, pageSize);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return [];
    }
  }
};
