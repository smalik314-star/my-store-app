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
  startAt,
  endAt,
  getDoc,
  runTransaction
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Product, Tenant, StockMovement } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import { getEffectiveLimits } from '../config/subscription';
import { dedupeById, getSearchVariants, normalizeSearchIndex } from '../utils/search';

const COLLECTION_NAME = 'products';
const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const resolveApiPath = (path: string) => apiBaseUrl ? `${apiBaseUrl}${path}` : path;
const mapProductDoc = (snapshot: any) => ({ ...snapshot.data(), id: snapshot.id } as Product);
const buildProductSearchFields = (data: Partial<Product>) => ({
  nameSearch: normalizeSearchIndex(data.name),
  brandSearch: normalizeSearchIndex(data.brand),
  genericNameSearch: normalizeSearchIndex(data.genericName),
  manufacturerSearch: normalizeSearchIndex(data.manufacturer),
  skuSearch: normalizeSearchIndex(data.sku),
  barcodeSearch: normalizeSearchIndex(data.barcode),
});

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
          ...buildProductSearchFields(sanitized),
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
        ...buildProductSearchFields({ ...currentProduct, ...sanitized }),
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

  async getProductsPaginated(tenantId: string, pageSize: number = 15, cursorId: string | null = null, category?: string) {
    if (!tenantId) return null;

    try {
      const constraints = [where('tenantId', '==', tenantId)];
      if (category && category !== 'All') {
        constraints.push(where('category', '==', category));
      }

      let baseQuery = query(
        collection(db, COLLECTION_NAME),
        ...constraints,
        orderBy('name', 'asc'),
        limit(pageSize)
      );

      if (cursorId) {
        const cursorSnap = await getDoc(doc(db, COLLECTION_NAME, cursorId));
        if (cursorSnap.exists() && cursorSnap.data().tenantId === tenantId) {
          baseQuery = query(
            collection(db, COLLECTION_NAME),
            ...constraints,
            orderBy('name', 'asc'),
            startAfter(cursorSnap),
            limit(pageSize)
          );
        }
      }

      const snapshot = await getDocs(baseQuery);
      const products = snapshot.docs
        .map(mapProductDoc)
        .filter(product => product.recordStatus !== 'inactive');

      return {
        products,
        nextCursor: snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1]?.id || null : null,
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return null;
    }
  },

  async searchProducts(
    tenantId: string,
    searchTerm: string,
    options: { pageSize?: number; cursorId?: string | null; mode?: 'auto' | 'name' | 'sku' | 'barcode' } = {}
  ) {
    if (!tenantId) return { products: [], nextCursor: null, hasMore: false };
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) return { products: [], nextCursor: null, hasMore: false };

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error('Please sign in again to search products.');
    }

    const params = new URLSearchParams({
      q: trimmed,
      pageSize: String(options.pageSize || 10),
      mode: options.mode || 'auto',
    });
    if (options.cursorId) params.set('cursorId', options.cursorId);

    const response = await fetch(`${resolveApiPath('/api/products/search')}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Product search could not be completed.');
    }

    return {
      products: (payload.products || []) as Product[],
      nextCursor: payload.nextCursor || null,
      hasMore: Boolean(payload.hasMore),
    };
  },

  async searchInventoryProducts(tenantId: string, searchTerm: string, pageSize: number = 10) {
    if (!tenantId) return [];
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) return [];

    const normalizedQuery = normalizeSearchIndex(trimmed);
    const variants = Array.from(new Set(
      getSearchVariants(trimmed).map(variant => normalizeSearchIndex(variant)).filter(Boolean)
    ));
    const numericOrCodeQuery = /^[A-Za-z0-9\-_/]+$/.test(trimmed);
    const fields = numericOrCodeQuery
      ? ['barcodeSearch', 'skuSearch', 'nameSearch']
      : ['nameSearch', 'brandSearch', 'manufacturerSearch', 'skuSearch'];

    try {
      const snapshots = await Promise.all(
        fields.flatMap(field =>
          variants.map(variant =>
            getDocs(query(
              collection(db, COLLECTION_NAME),
              where('tenantId', '==', tenantId),
              orderBy(field),
              startAt(variant),
              endAt(`${variant}\uf8ff`),
              limit(pageSize)
            ))
          )
        )
      );

      let rows = dedupeById(
        snapshots.flatMap(snapshot => snapshot.docs.map(mapProductDoc))
      )
        .filter(product => product.recordStatus !== 'inactive')
        .slice(0, pageSize);
      if (rows.length === 0 && normalizedQuery !== trimmed.toLowerCase()) {
        rows = await this.searchInventoryProducts(tenantId, normalizedQuery, pageSize);
      }
      return rows;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return [];
    }
  },

  async findProductByCode(tenantId: string, code: string) {
    if (!tenantId) return null;
    const trimmed = code.trim();
    if (!trimmed) return null;

    const exactQueries = [
      query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
        where('barcode', '==', trimmed),
        limit(1)
      ),
      query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
        where('sku', '==', trimmed),
        limit(1)
      ),
    ];

    for (const currentQuery of exactQueries) {
      const snapshot = await getDocs(currentQuery);
      const found = snapshot.docs[0];
      if (!found) continue;
      const product = mapProductDoc(found);
      if (product.recordStatus !== 'inactive') return product;
    }

    return null;
  },

  async getProductById(tenantId: string, id: string) {
    if (!tenantId || !id) return null;
    const snapshot = await getDoc(doc(db, COLLECTION_NAME, id));
    if (!snapshot.exists()) return null;
    if (snapshot.data().tenantId !== tenantId) return null;
    const product = mapProductDoc(snapshot);
    return product.recordStatus === 'inactive' ? null : product;
  },

  async getProductsByIds(tenantId: string, ids: string[]) {
    if (!tenantId || ids.length === 0) return [];
    const rows = await Promise.all(ids.map(id => this.getProductById(tenantId, id)));
    return rows.filter((row): row is Product => Boolean(row));
  },

  async getLowStockProductsPage(tenantId: string, pageSize: number = 25, cursorId: string | null = null) {
    if (!tenantId) return null;

    try {
      let baseQuery = query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
        orderBy('stockQuantity', 'asc'),
        limit(pageSize * 3)
      );

      if (cursorId) {
        const cursorSnap = await getDoc(doc(db, COLLECTION_NAME, cursorId));
        if (cursorSnap.exists() && cursorSnap.data().tenantId === tenantId) {
          baseQuery = query(
            collection(db, COLLECTION_NAME),
            where('tenantId', '==', tenantId),
            orderBy('stockQuantity', 'asc'),
            startAfter(cursorSnap),
            limit(pageSize * 3)
          );
        }
      }

      const snapshot = await getDocs(baseQuery);
      const products = snapshot.docs
        .map(mapProductDoc)
        .filter(product => product.recordStatus !== 'inactive')
        .filter(product => Number(product.stockQuantity) <= Number(product.minimumStock))
        .slice(0, pageSize);

      return {
        products,
        nextCursor: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1]?.id || null : null,
        hasMore: snapshot.docs.length === pageSize * 3,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return null;
    }
  },

  async getExpiryProductsPage(tenantId: string, pageSize: number = 25, cursorId: string | null = null) {
    if (!tenantId) return null;

    try {
      let baseQuery = query(
        collection(db, COLLECTION_NAME),
        where('tenantId', '==', tenantId),
        orderBy('expiryDate', 'asc'),
        limit(pageSize)
      );

      if (cursorId) {
        const cursorSnap = await getDoc(doc(db, COLLECTION_NAME, cursorId));
        if (cursorSnap.exists() && cursorSnap.data().tenantId === tenantId) {
          baseQuery = query(
            collection(db, COLLECTION_NAME),
            where('tenantId', '==', tenantId),
            orderBy('expiryDate', 'asc'),
            startAfter(cursorSnap),
            limit(pageSize)
          );
        }
      }

      const snapshot = await getDocs(baseQuery);
      const products = snapshot.docs
        .map(mapProductDoc)
        .filter(product => product.recordStatus !== 'inactive' && product.expiryDate);

      return {
        products,
        nextCursor: snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1]?.id || null : null,
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      return null;
    }
  },

  subscribeToProducts(
    tenantId: string,
    callback: (products: Product[]) => void,
    filters: { category?: string; searchQuery?: string; stockStatus?: string } = {}
  ) {
    if (!tenantId) return () => {};

    let cancelled = false;
    void (async () => {
      try {
        let products: Product[] = [];
        const trimmedSearch = filters.searchQuery?.trim() || '';

        if (trimmedSearch.length >= 2) {
          products = await this.searchInventoryProducts(tenantId, trimmedSearch, 100);
        } else if (filters.stockStatus === 'low' || filters.stockStatus === 'out') {
          products = (await this.getLowStockProductsPage(tenantId, 100, null))?.products || [];
        } else {
          products = (await this.getProductsPaginated(tenantId, 100, null, filters.category))?.products || [];
        }

        if (filters.category && filters.category !== 'All') {
          products = products.filter(product => product.category === filters.category);
        }
        if (filters.stockStatus === 'low') {
          products = products.filter(product => product.stockQuantity <= product.minimumStock && product.stockQuantity > 0);
        } else if (filters.stockStatus === 'out') {
          products = products.filter(product => product.stockQuantity === 0);
        } else if (filters.stockStatus === 'in') {
          products = products.filter(product => product.stockQuantity > product.minimumStock);
        }

        if (!cancelled) callback(products);
      } catch (error) {
        console.error('Bounded product loader failed:', error);
        if (!cancelled) callback([]);
      }
    })();

    return () => {
      cancelled = true;
    };
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
