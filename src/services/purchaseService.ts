import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  getDoc,
  query, 
  where, 
  serverTimestamp,
  increment,
  runTransaction,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Purchase, PurchaseItem, Supplier, StockMovement, Product, ProductBatch } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import { toJsDate } from '../utils/date';

const SUPPLIERS_COLL = 'suppliers';
const PURCHASES_COLL = 'purchases';
const PURCHASE_ITEMS_COLL = 'purchaseItems';
const MOVEMENTS_COLL = 'stockMovements';
const PRODUCTS_COLL = 'products';

export const purchaseService = {
  // --- SUPPLIER MANAGEMENT ---
  async addSupplier(tenantId: string, supplierData: Omit<Supplier, 'id' | 'tenantId' | 'createdAt'>): Promise<string> {
    if (!tenantId) throw new Error('Tenant ID required');
    try {
      const cleanData: any = {};
      Object.keys(supplierData).forEach(key => {
        const val = (supplierData as any)[key];
        if (val !== undefined) {
          cleanData[key] = val;
        }
      });
      const docRef = await addDoc(collection(db, SUPPLIERS_COLL), {
        ...cleanData,
        tenantId,
        createdAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, SUPPLIERS_COLL);
      throw error;
    }
  },

  async getSuppliers(tenantId: string): Promise<Supplier[]> {
    if (!tenantId) return [];
    try {
      const q = query(
        collection(db, SUPPLIERS_COLL),
        where('tenantId', '==', tenantId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Supplier));
      return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, SUPPLIERS_COLL);
      return [];
    }
  },

  // --- PURCHASE MANAGEMENT ---
  async getPurchases(tenantId: string): Promise<Purchase[]> {
    if (!tenantId) return [];
    try {
      const q = query(
        collection(db, PURCHASES_COLL),
        where('tenantId', '==', tenantId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Purchase));
      return list.sort((a, b) => {
        const timeA = a.createdAt ? (typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : new Date(a.createdAt as any).getTime()) : 0;
        const timeB = b.createdAt ? (typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : new Date(b.createdAt as any).getTime()) : 0;
        return timeB - timeA;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, PURCHASES_COLL);
      return [];
    }
  },

  async getPurchaseById(tenantId: string, id: string): Promise<Purchase | null> {
    if (!tenantId) return null;
    try {
      const docRef = doc(db, PURCHASES_COLL, id);
      const snap = await getDoc(docRef);
      if (!snap.exists() || snap.data().tenantId !== tenantId) {
        return null;
      }
      return {
        id: snap.id,
        ...snap.data()
      } as Purchase;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${PURCHASES_COLL}/${id}`);
      return null;
    }
  },

  async getPurchaseItems(purchaseId: string): Promise<PurchaseItem[]> {
    try {
      const q = query(
        collection(db, PURCHASE_ITEMS_COLL),
        where('purchaseId', '==', purchaseId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as PurchaseItem));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, PURCHASE_ITEMS_COLL);
      return [];
    }
  },

  // --- ATOMIC PURCHASE ENTRY ---
  async addPurchase(
    tenantId: string, 
    purchaseData: Omit<Purchase, 'id' | 'tenantId' | 'createdAt' | 'purchaseNumber'>,
    items: Omit<PurchaseItem, 'id' | 'purchaseId'>[]
  ): Promise<string> {
    if (!tenantId) throw new Error('Tenant ID required');
    if (items.length === 0) throw new Error('Purchase must contain at least one item');
    if (new Set(items.map(item => item.productId)).size !== items.length) {
      throw new Error('Add each product only once per purchase. Merge duplicate quantities/batches before saving.');
    }

    try {
      return await runTransaction(db, async (transaction) => {
        // Firestore requires every transaction read to happen before any write.
        const counterRef = doc(db, 'counters', `${tenantId}_purchase`);
        const counterDoc = await transaction.get(counterRef);
        const productDocs = new Map<string, any>();
        for (const item of items) {
          if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error(`Invalid quantity for ${item.productName}`);
          if (!Number.isFinite(item.purchasePrice) || item.purchasePrice < 0) throw new Error(`Invalid purchase price for ${item.productName}`);
          if (!Number.isFinite(item.salePrice) || item.salePrice < 0) throw new Error(`Invalid sale price for ${item.productName}`);
          if (!item.batchNumber?.trim()) throw new Error(`Batch number is required for ${item.productName}`);
          if (!productDocs.has(item.productId)) {
            const snap = await transaction.get(doc(db, PRODUCTS_COLL, item.productId));
            if (!snap.exists() || snap.data().tenantId !== tenantId) {
              throw new Error(`Product ${item.productName} not found or unauthorized.`);
            }
            productDocs.set(item.productId, snap);
          }
        }

        let nextNum = 1;
        if (counterDoc.exists()) {
          nextNum = (counterDoc.data().value || 0) + 1;
          transaction.update(counterRef, { value: nextNum, tenantId });
        } else {
          transaction.set(counterRef, { value: 1, tenantId });
        }
        const purchaseNumber = `PUR-${String(nextNum).padStart(4, '0')}`;

        // 2. Create Purchase document
        const purchaseRef = doc(collection(db, PURCHASES_COLL));
        const purchaseId = purchaseRef.id;
        const finalPurchase: Purchase = {
          ...purchaseData,
          id: purchaseId,
          tenantId,
          purchaseNumber,
          status: purchaseData.status || 'posted',
          createdAt: serverTimestamp() as any
        };
        const cleanPurchase: any = {};
        Object.keys(finalPurchase).forEach(key => {
          const val = (finalPurchase as any)[key];
          if (val !== undefined) {
            cleanPurchase[key] = val;
          }
        });
        transaction.set(purchaseRef, cleanPurchase);

        // 3. Process each purchase item
        for (const item of items) {
          // A. Create PurchaseItem row
          const itemRef = doc(collection(db, PURCHASE_ITEMS_COLL));
          const finalItem: PurchaseItem = {
            ...item,
            id: itemRef.id,
            purchaseId,
            tenantId
          };
          transaction.set(itemRef, finalItem);

          // B. Update Product Stock and Batches
          const productRef = doc(db, PRODUCTS_COLL, item.productId);
          const productDoc = productDocs.get(item.productId);

          const product = productDoc.data() as Product;
          const previousStock = product.stockQuantity || 0;
          const newStock = previousStock + item.quantity;

          // Process batches array
          let batchesList = product.batches ? [...product.batches] : [];
          const existingBatchIdx = batchesList.findIndex(
            b => b.batchNumber.trim().toUpperCase() === item.batchNumber.trim().toUpperCase()
          );

          if (existingBatchIdx >= 0) {
            // Update quantity and pricing to the latest purchase details
            batchesList[existingBatchIdx] = {
              ...batchesList[existingBatchIdx],
              quantity: batchesList[existingBatchIdx].quantity + item.quantity,
              purchasePrice: item.purchasePrice,
              salePrice: item.salePrice,
              mfgDate: item.mfgDate,
              expiryDate: item.expiryDate,
            };
          } else {
            // Create a new batch entry
            batchesList.push({
              batchNumber: item.batchNumber,
              mfgDate: item.mfgDate,
              expiryDate: item.expiryDate,
              purchasePrice: item.purchasePrice,
              salePrice: item.salePrice,
              quantity: item.quantity,
              createdAt: Timestamp.now()
            });
          }

          // Sort batches by expiry date ascending (FEFO order)
          batchesList.sort((a, b) => {
            const dateA = toJsDate(a.expiryDate).getTime();
            const dateB = toJsDate(b.expiryDate).getTime();
            return dateA - dateB;
          });

          // Identify nearest active batch or fallback to nearest overall batch
          const activeBatches = batchesList.filter(b => b.quantity > 0);
          const currentBatch = activeBatches.length > 0 ? activeBatches[0] : batchesList[0];

          // Update Product document fields
          const updatedProductFields: Partial<Product> = {
            stockQuantity: newStock,
            purchasePrice: item.purchasePrice, // Latest Purchase Price
            sellingPrice: item.salePrice, // Latest Sale Price
            batches: batchesList,
            updatedAt: serverTimestamp()
          };

          if (currentBatch) {
            updatedProductFields.batchNumber = currentBatch.batchNumber;
            updatedProductFields.expiryDate = currentBatch.expiryDate;
            updatedProductFields.manufacturingDate = currentBatch.mfgDate;
          }

          transaction.update(productRef, updatedProductFields);

          // C. Create Stock Movement entry
          const movementRef = doc(collection(db, MOVEMENTS_COLL));
          const movement: StockMovement = {
            id: movementRef.id,
            tenantId,
            type: "PURCHASE_IN",
            productId: item.productId,
            productName: item.productName,
            batchNumber: item.batchNumber,
            quantity: item.quantity,
            previousStock,
            newStock,
            purchaseId,
            createdAt: serverTimestamp() as any
          };
          transaction.set(movementRef, movement);
        }

        // Return purchaseId
        return purchaseId;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, PURCHASES_COLL);
      throw error;
    }
  },

  // --- ATOMIC PURCHASE CANCELLATION WITH SAFE REVERSALS ---
  async cancelPurchase(
    tenantId: string,
    purchaseId: string,
    cancellationReason: string = 'Cancelled by user'
  ): Promise<void> {
    if (!tenantId) throw new Error('Tenant ID required');
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('You must be signed in to cancel a purchase.');

    try {
      const itemsQuery = query(
        collection(db, PURCHASE_ITEMS_COLL),
        where('purchaseId', '==', purchaseId),
        where('tenantId', '==', tenantId)
      );
      const itemsSnap = await getDocs(itemsQuery);
      const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseItem));
      if (new Set(items.map(item => item.productId)).size !== items.length) {
        throw new Error('This legacy purchase contains duplicate product rows and needs reviewed reconciliation before cancellation.');
      }
      await runTransaction(db, async (transaction) => {
        // 1. Fetch Purchase
        const purchaseRef = doc(db, PURCHASES_COLL, purchaseId);
        const purchaseDoc = await transaction.get(purchaseRef);
        if (!purchaseDoc.exists() || purchaseDoc.data().tenantId !== tenantId) {
          throw new Error('Purchase not found or unauthorized');
        }
        const purchase = purchaseDoc.data() as Purchase;
        if (purchase.status === 'cancelled') {
          throw new Error('This purchase is already cancelled.');
        }

        // Read and validate every product before performing any write.
        const productDocs = new Map<string, any>();
        for (const item of items) {
          const productRef = doc(db, PRODUCTS_COLL, item.productId);
          if (!productDocs.has(item.productId)) productDocs.set(item.productId, await transaction.get(productRef));
          const productDoc = productDocs.get(item.productId);
          if (!productDoc.exists() || productDoc.data().tenantId !== tenantId) {
            throw new Error(`Product ${item.productName} no longer exists.`);
          }

          const product = productDoc.data() as Product;
          const batches = product.batches ? [...product.batches] : [];
          const batch = batches.find(
            b => b.batchNumber.trim().toUpperCase() === item.batchNumber.trim().toUpperCase()
          );

          if (!batch || batch.quantity < item.quantity) {
            throw new Error(
              `Cannot cancel purchase: ${item.quantity} units were added to batch "${item.batchNumber}" of product "${item.productName}", but only ${batch ? batch.quantity : 0} units are currently in stock. Reversing this purchase would cause negative inventory.`
            );
          }
        }

        // Perform the reversal after all reads.
        for (const item of items) {
          const productRef = doc(db, PRODUCTS_COLL, item.productId);
          const productDoc = productDocs.get(item.productId);
          const product = productDoc.data() as Product;

          const previousStock = product.stockQuantity || 0;
          const newStock = previousStock - item.quantity;

          // Update batches
          let batchesList = product.batches ? [...product.batches] : [];
          const batchIdx = batchesList.findIndex(
            b => b.batchNumber.trim().toUpperCase() === item.batchNumber.trim().toUpperCase()
          );

          if (batchIdx >= 0) {
            batchesList[batchIdx] = {
              ...batchesList[batchIdx],
              quantity: Math.max(0, batchesList[batchIdx].quantity - item.quantity)
            };
          }

          // Sort batches by expiry date
          batchesList.sort((a, b) => {
            const dateA = toJsDate(a.expiryDate).getTime();
            const dateB = toJsDate(b.expiryDate).getTime();
            return dateA - dateB;
          });

          // Identify nearest active batch
          const activeBatches = batchesList.filter(b => b.quantity > 0);
          const currentBatch = activeBatches.length > 0 ? activeBatches[0] : batchesList[0];

          const updatedProductFields: Partial<Product> = {
            stockQuantity: newStock,
            batches: batchesList,
            updatedAt: serverTimestamp()
          };

          if (currentBatch) {
            updatedProductFields.batchNumber = currentBatch.batchNumber;
            updatedProductFields.expiryDate = currentBatch.expiryDate;
            updatedProductFields.manufacturingDate = currentBatch.mfgDate;
            // Roll back top-level price to the active batch, if any
            updatedProductFields.purchasePrice = currentBatch.purchasePrice;
            updatedProductFields.sellingPrice = currentBatch.salePrice;
          }

          transaction.update(productRef, updatedProductFields);

          // Create stock movement reversal
          const movementRef = doc(collection(db, MOVEMENTS_COLL));
          const movement: StockMovement = {
            id: movementRef.id,
            tenantId,
            type: "PURCHASE_CANCEL_REVERSE",
            productId: item.productId,
            productName: item.productName,
            batchNumber: item.batchNumber,
            quantity: -item.quantity,
            previousStock,
            newStock,
            purchaseId,
            createdAt: serverTimestamp() as any
          };
          transaction.set(movementRef, movement);

        }

        transaction.update(purchaseRef, {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelledBy: actorId,
          cancellationReason: cancellationReason.trim() || 'Cancelled by user',
        });

        const logRef = doc(collection(db, 'tenants', tenantId, 'logs'));
        transaction.set(logRef, {
          action: 'CANCEL_PURCHASE',
          purchaseId,
          purchaseNumber: purchase.purchaseNumber,
          reason: cancellationReason.trim() || 'Cancelled by user',
          userId: actorId,
          tenantId,
          createdAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${PURCHASES_COLL}/${purchaseId}`);
      throw error;
    }
  }
};
