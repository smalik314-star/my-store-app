import { 
  collection, 
  updateDoc, 
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
  runTransaction
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Product, Tenant, StockMovement } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import { getEffectiveLimits } from '../config/subscription';

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
      const tenantRef = doc(db, 'tenants', tenantId);
      const usageRef = doc(db, 'productUsageCounters', tenantId);

      // Check SKU uniqueness for this tenant if provided
      if (sanitized.sku && sanitized.sku.trim() !== '') {
        const skuQuery = query(
          collection(db, COLLECTION_NAME), 
          where('tenantId', '==', tenantId),
          where('sku', '==', sanitized.sku)
        );
        const skuSnap = await getDocs(skuQuery);
        if (!skuSnap.empty) throw new Error('SKU already exists');
      }

      // Check Barcode uniqueness for this tenant if provided
      if (sanitized.barcode && sanitized.barcode.trim() !== '') {
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

      const productRef = doc(collection(db, COLLECTION_NAME));
      const movementRef = doc(collection(db, 'stockMovements'));
      const actorId = auth.currentUser?.uid;
      if (!actorId) throw new Error('You must be signed in to add a product.');

      await runTransaction(db, async transaction => {
        const tenantDoc = await transaction.get(tenantRef);
        const usageDoc = await transaction.get(usageRef);
        if (!tenantDoc.exists()) throw new Error('Store profile not found.');
        const tenant = tenantDoc.data() as Tenant;
        const legacyProductCount = Number(tenant.usage?.productsCount) || 0;
        const productCount = usageDoc.exists()
          ? Math.max(0, Number(usageDoc.data().productsCount) || 0)
          : legacyProductCount;
        const limits = getEffectiveLimits(tenant);
        if (productCount >= limits.maxProducts) {
          throw new Error('Product limit reached. Please upgrade your plan.');
        }

        transaction.set(productRef, {
          ...sanitized,
          id: productRef.id,
          tenantId,
          recordStatus: sanitized.recordStatus || 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        transaction.set(usageRef, {
          tenantId,
          productsCount: productCount + 1,
          updatedAt: serverTimestamp()
        }, { merge: true });

        const openingQuantity = Number(sanitized.stockQuantity) || 0;
        if (openingQuantity > 0) {
          transaction.set(movementRef, {
            id: movementRef.id,
            tenantId,
            type: 'OPENING_STOCK',
            productId: productRef.id,
            productName: sanitized.name,
            batchNumber: sanitized.batchNumber,
            quantity: openingQuantity,
            previousStock: 0,
            newStock: openingQuantity,
            userId: actorId,
            createdAt: serverTimestamp(),
          });
        }
      });

      return productRef;
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
      const currentProduct = currentDoc.data() as Product;

      if (sanitized.stockQuantity !== undefined && sanitized.stockQuantity < 0) throw new Error('Stock quantity cannot be negative');
      if (
        sanitized.stockQuantity !== undefined
        && Number(sanitized.stockQuantity) !== Number(currentProduct.stockQuantity || 0)
      ) {
        throw new Error('Stock quantity cannot be edited from Product Master. Use Purchase or Stock Adjustment so the change remains auditable.');
      }
      
      // SKU uniqueness check if changed and not empty
      if (sanitized.sku && sanitized.sku.trim() !== '') {
        const skuQuery = query(
          collection(db, COLLECTION_NAME), 
          where('tenantId', '==', tenantId),
          where('sku', '==', sanitized.sku)
        );
        const skuSnap = await getDocs(skuQuery);
        if (skuSnap.docs.some(d => d.id !== id)) throw new Error('SKU already exists');
      }

      // Barcode uniqueness check if changed and not empty
      if (sanitized.barcode && sanitized.barcode.trim() !== '') {
        const barcodeQuery = query(
          collection(db, COLLECTION_NAME), 
          where('tenantId', '==', tenantId),
          where('barcode', '==', sanitized.barcode)
        );
        const barcodeSnap = await getDocs(barcodeQuery);
        if (barcodeSnap.docs.some(d => d.id !== id)) throw new Error('Barcode already exists');
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
      const product = currentDoc.data() as Product;
      if ((Number(product.stockQuantity) || 0) > 0) {
        throw new Error('Product has stock. Reduce it through an audited stock adjustment before archiving.');
      }
      const actorId = auth.currentUser?.uid;
      if (!actorId) throw new Error('You must be signed in to archive a product.');

      await updateDoc(productRef, {
        recordStatus: 'inactive',
        archivedAt: serverTimestamp(),
        archivedBy: actorId,
        updatedAt: serverTimestamp(),
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
        products = products.filter(product => product.recordStatus !== 'inactive');

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
  },

  subscribeToStockMovements(
    tenantId: string,
    callback: (movements: StockMovement[]) => void,
    limitCount: number = 50
  ) {
    if (!tenantId) return () => {};
    
    const q = query(
      collection(db, 'stockMovements'),
      where('tenantId', '==', tenantId)
    );
    
    return onSnapshot(q, (snapshot) => {
      try {
        const movements = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as StockMovement[];
        
        movements.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        });
        
        callback(movements.slice(0, limitCount));
      } catch (err) {
        console.error('Stock Movements Subscription Processing Error:', err);
      }
    }, (error) => {
      console.error('Stock Movements Subscription Error:', error);
    });
  }
};
