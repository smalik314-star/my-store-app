import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp,
  onSnapshot,
  orderBy,
  limit,
  startAfter,
  QueryConstraint,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Product } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';

const COLLECTION_NAME = 'products';

// Helper to sanitize product data
const sanitizeProduct = (data: any) => {
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

export const productService = {
  async addProduct(productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!auth.currentUser) throw new Error('User not authenticated');
    const uid = auth.currentUser.uid;
    const sanitized = sanitizeProduct(productData);

    try {
      // Check SKU uniqueness for this user
      const skuQuery = query(
        collection(db, COLLECTION_NAME), 
        where('userId', '==', uid),
        where('sku', '==', sanitized.sku)
      );
      const skuSnap = await getDocs(skuQuery);
      if (!skuSnap.empty) throw new Error('SKU already exists');

      // Check Barcode uniqueness for this user
      if (sanitized.barcode) {
        const barcodeQuery = query(
          collection(db, COLLECTION_NAME), 
          where('userId', '==', uid),
          where('barcode', '==', sanitized.barcode)
        );
        const barcodeSnap = await getDocs(barcodeQuery);
        if (!barcodeSnap.empty) throw new Error('Barcode already exists');
      }

      if (sanitized.stockQuantity < 0) throw new Error('Stock quantity cannot be negative');
      if (sanitized.purchasePrice < 0) throw new Error('Purchase price cannot be negative');

      return await addDoc(collection(db, COLLECTION_NAME), {
        ...sanitized,
        userId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
    }
  },

  async updateProduct(id: string, productData: Partial<Product>) {
    if (!auth.currentUser) throw new Error('User not authenticated');
    const uid = auth.currentUser.uid;
    const sanitized = sanitizeProduct(productData);

    try {
      // Verify ownership first
      const productRef = doc(db, COLLECTION_NAME, id);
      const currentDoc = await getDoc(productRef);
      if (!currentDoc.exists() || currentDoc.data().userId !== uid) {
        throw new Error('Unauthorized or product not found');
      }

      if (sanitized.stockQuantity !== undefined && sanitized.stockQuantity < 0) throw new Error('Stock quantity cannot be negative');
      
      // SKU uniqueness check if changed
      if (sanitized.sku) {
        const skuQuery = query(
          collection(db, COLLECTION_NAME), 
          where('userId', '==', uid),
          where('sku', '==', sanitized.sku)
        );
        const skuSnap = await getDocs(skuQuery);
        if (skuSnap.docs.some(d => d.id !== id)) throw new Error('SKU already exists');
      }

      return await updateDoc(productRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async deleteProduct(id: string) {
    if (!auth.currentUser) throw new Error('User not authenticated');
    const uid = auth.currentUser.uid;

    try {
      const productRef = doc(db, COLLECTION_NAME, id);
      const currentDoc = await getDoc(productRef);
      if (!currentDoc.exists() || currentDoc.data().userId !== uid) {
        throw new Error('Unauthorized or product not found');
      }

      return await deleteDoc(productRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async getProductsPaginated(pageSize: number = 15, lastVisibleDoc: any = null) {
    if (!auth.currentUser) return null;
    const uid = auth.currentUser.uid;

    try {
      let q = query(
        collection(db, COLLECTION_NAME),
        where('userId', '==', uid),
        orderBy('name', 'asc'),
        limit(pageSize)
      );

      if (lastVisibleDoc) {
        q = query(q, startAfter(lastVisibleDoc));
      }

      const snapshot = await getDocs(q);
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      const products = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));

      return { products, lastDoc, hasMore: snapshot.docs.length === pageSize };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return null;
    }
  },

  subscribeToProducts(
    userId: string,
    callback: (products: Product[]) => void, 
    filters: { category?: string, searchQuery?: string, stockStatus?: string } = {}
  ) {
    // Note: To avoid composite index requirements in dev, we only filter by userId on the server.
    // All other filters (category, stockStatus) and sorting (name) are done client-side.
    let constraints: QueryConstraint[] = [
      where('userId', '==', userId)
    ];
    
    return onSnapshot(query(collection(db, COLLECTION_NAME), ...constraints), (snapshot) => {
      try {
        let products = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];

        // Client-side filtering: Category
        if (filters.category && filters.category !== 'All') {
          products = products.filter(p => p.category === filters.category);
        }

        // Client-side filtering: Search
        if (filters.searchQuery) {
          const queryStr = filters.searchQuery.toLowerCase();
          products = products.filter(p => 
            p.name.toLowerCase().includes(queryStr) || 
            p.sku.toLowerCase().includes(queryStr) || 
            (p.barcode && p.barcode.toLowerCase().includes(queryStr))
          );
        }

        // Client-side filtering: Stock Status
        if (filters.stockStatus) {
          if (filters.stockStatus === 'low') {
            products = products.filter(p => p.stockQuantity <= p.minimumStock && p.stockQuantity > 0);
          } else if (filters.stockStatus === 'out') {
            products = products.filter(p => p.stockQuantity === 0);
          } else if (filters.stockStatus === 'in') {
            products = products.filter(p => p.stockQuantity > p.minimumStock);
          }
        }

        // Client-side sorting: Name ASC
        products.sort((a, b) => a.name.localeCompare(b.name));

        callback(products);
      } catch (err) {
        console.error('Products Subscription Processing Error:', err);
      }
    }, (error) => {
      console.error('Products Subscription Error:', error);
    });
  }
};
