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
  getDoc,
  increment
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Product, Tenant } from '../types';
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
  async addProduct(tenantId: string, productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>) {
    if (!tenantId) throw new Error('Tenant ID required');
    const sanitized = sanitizeProduct(productData);

    try {
      // Check Limits
      const tenantRef = doc(db, 'tenants', tenantId);
      const tenantDoc = await getDoc(tenantRef);
      if (tenantDoc.exists()) {
        const tenant = tenantDoc.data() as Tenant;
        if (tenant.usage.productsCount >= tenant.limits.maxProducts) {
          throw new Error('Product limit reached. Please upgrade your plan.');
        }
      }

      // Check SKU uniqueness for this tenant
      const skuQuery = query(
        collection(db, COLLECTION_NAME), 
        where('tenantId', '==', tenantId),
        where('sku', '==', sanitized.sku)
      );
      const skuSnap = await getDocs(skuQuery);
      if (!skuSnap.empty) throw new Error('SKU already exists');

      // Check Barcode uniqueness for this tenant
      if (sanitized.barcode) {
        const barcodeQuery = query(
          collection(db, COLLECTION_NAME), 
          where('tenantId', '==', tenantId),
          where('barcode', '==', sanitized.barcode)
        );
        const barcodeSnap = await getDocs(barcodeQuery);
        if (!barcodeSnap.empty) throw new Error('Barcode already exists');
      }

      if (sanitized.stockQuantity < 0) throw new Error('Stock quantity cannot be negative');
      if (sanitized.purchasePrice < 0) throw new Error('Purchase price cannot be negative');

      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...sanitized,
        tenantId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update usage
      await updateDoc(tenantRef, {
        'usage.productsCount': increment(1),
        updatedAt: serverTimestamp()
      });

      return docRef;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
    }
  },

  async updateProduct(tenantId: string, id: string, productData: Partial<Product>) {
    if (!tenantId) throw new Error('Tenant ID required');
    const sanitized = sanitizeProduct(productData);

    try {
      // Verify ownership first
      const productRef = doc(db, COLLECTION_NAME, id);
      const currentDoc = await getDoc(productRef);
      if (!currentDoc.exists() || currentDoc.data().tenantId !== tenantId) {
        throw new Error('Unauthorized or product not found');
      }

      if (sanitized.stockQuantity !== undefined && sanitized.stockQuantity < 0) throw new Error('Stock quantity cannot be negative');
      
      // SKU uniqueness check if changed
      if (sanitized.sku) {
        const skuQuery = query(
          collection(db, COLLECTION_NAME), 
          where('tenantId', '==', tenantId),
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

  async deleteProduct(tenantId: string, id: string) {
    if (!tenantId) throw new Error('Tenant ID required');

    try {
      const productRef = doc(db, COLLECTION_NAME, id);
      const currentDoc = await getDoc(productRef);
      if (!currentDoc.exists() || currentDoc.data().tenantId !== tenantId) {
        throw new Error('Unauthorized or product not found');
      }

      await deleteDoc(productRef);

      // Update usage
      const tenantRef = doc(db, 'tenants', tenantId);
      await updateDoc(tenantRef, {
        'usage.productsCount': increment(-1),
        updatedAt: serverTimestamp()
      });

      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
    }
  },

  async getProductsPaginated(tenantId: string, pageSize: number = 15, lastVisibleDoc: any = null) {
    if (!tenantId) return null;

    try {
      let q = query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
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
    tenantId: string,
    callback: (products: Product[]) => void, 
    filters: { category?: string, searchQuery?: string, stockStatus?: string } = {}
  ) {
    if (!tenantId) return () => {};
    
    let constraints: QueryConstraint[] = [
      where('tenantId', '==', tenantId)
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
