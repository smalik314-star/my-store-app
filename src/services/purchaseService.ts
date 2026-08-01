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
import { Purchase, PurchaseItem, Supplier, StockMovement, Product, ProductBatch, Tenant } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import { getEffectiveLimits } from '../config/subscription';
import { toJsDate } from '../utils/date';
import { roundMoney } from '../utils/currency';

const SUPPLIERS_COLL = 'suppliers';
const PURCHASES_COLL = 'purchases';
const PURCHASE_ITEMS_COLL = 'purchaseItems';
const MOVEMENTS_COLL = 'stockMovements';
const PRODUCTS_COLL = 'products';
const PURCHASE_KEYS_COLL = 'purchaseKeys';

type PurchaseEntryItem = Omit<PurchaseItem, 'id' | 'purchaseId'> & {
  isNewProduct?: boolean;
  productBrand?: string;
  productManufacturer?: string;
  productCategory?: string;
  productUnit?: string;
  productMinimumStock?: number;
};

const normalizedBatch = (value: string) => value.trim().toUpperCase();
const normalizedInvoice = (value: string) => value.trim().toUpperCase().replace(/\s+/g, ' ');

const stableHash = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

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
        totalPurchases: Number(cleanData.totalPurchases) || 0,
        totalPaid: Number(cleanData.totalPaid) || 0,
        payableBalance: Number(cleanData.payableBalance) || 0,
        creditBalance: Number(cleanData.creditBalance) || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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

  async getPurchaseItems(tenantId: string, purchaseId: string): Promise<PurchaseItem[]> {
    if (!tenantId) return [];
    try {
      const q = query(
        collection(db, PURCHASE_ITEMS_COLL),
        where('purchaseId', '==', purchaseId),
        where('tenantId', '==', tenantId)
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
    items: PurchaseEntryItem[]
  ): Promise<string> {
    if (!tenantId) throw new Error('Tenant ID required');
    if (items.length === 0) throw new Error('Purchase must contain at least one item');
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('You must be signed in to create a purchase.');
    const duplicateKeys = items.map(item => `${item.productId}::${normalizedBatch(item.batchNumber)}`);
    if (new Set(duplicateKeys).size !== duplicateKeys.length) {
      throw new Error('The same product and batch appears more than once. Merge its quantity before saving.');
    }

    try {
      return await runTransaction(db, async (transaction) => {
        // Firestore requires every transaction read to happen before any write.
        const counterRef = doc(db, 'counters', `${tenantId}_purchase`);
        const invoiceKey = `${tenantId}|${purchaseData.supplierId}|${normalizedInvoice(purchaseData.invoiceNumber)}`;
        const purchaseKeyRef = doc(db, PURCHASE_KEYS_COLL, `${tenantId}_${stableHash(invoiceKey)}`);
        const counterDoc = await transaction.get(counterRef);
        const purchaseKeyDoc = await transaction.get(purchaseKeyRef);
        if (purchaseKeyDoc.exists()) {
          throw new Error('This supplier invoice number has already been posted for the selected supplier.');
        }
        const productDocs = new Map<string, any>();
        for (const item of items) {
          if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error(`Invalid quantity for ${item.productName}`);
          if (!Number.isFinite(item.purchasePrice) || item.purchasePrice < 0) throw new Error(`Invalid purchase price for ${item.productName}`);
          if (!Number.isFinite(item.salePrice) || item.salePrice < 0) throw new Error(`Invalid sale price for ${item.productName}`);
          if (!item.batchNumber?.trim()) throw new Error(`Batch number is required for ${item.productName}`);
          if (!productDocs.has(item.productId)) {
            const snap = await transaction.get(doc(db, PRODUCTS_COLL, item.productId));
            if (!snap.exists() && item.isNewProduct) {
              productDocs.set(item.productId, null);
              continue;
            }
            if (!snap.exists() || snap.data().tenantId !== tenantId) {
              throw new Error(`Product ${item.productName} not found or unauthorized.`);
            }
            productDocs.set(item.productId, snap);
          }
        }
        const tenantRef = doc(db, 'tenants', tenantId);
        const tenantDoc = await transaction.get(tenantRef);
        if (!tenantDoc.exists()) throw new Error('Store profile not found.');
        const newProductCount = Array.from(productDocs.values()).filter(value => value === null).length;
        const tenantUsage = tenantDoc.data().usage || { invoicesCount: 0, productsCount: 0, usersCount: 1 };
        const tenantLimits = getEffectiveLimits(tenantDoc.data() as Tenant);
        if ((Number(tenantUsage.productsCount) || 0) + newProductCount > tenantLimits.maxProducts) {
          throw new Error('Product limit reached. Please upgrade your plan.');
        }
        const supplierRef = doc(db, SUPPLIERS_COLL, purchaseData.supplierId);
        const supplierDoc = await transaction.get(supplierRef);
        if (!supplierDoc.exists() || supplierDoc.data().tenantId !== tenantId) {
          throw new Error('Selected supplier was not found or does not belong to this store.');
        }

        const totalAmount = roundMoney(Number(purchaseData.totalAmount) || 0);
        const paidAmount = roundMoney(Number(purchaseData.paidAmount) || 0);
        if (totalAmount <= 0) throw new Error('Purchase total must be greater than zero.');
        if (paidAmount < 0 || paidAmount > totalAmount) {
          throw new Error('Paid amount must be between zero and the purchase total.');
        }
        const payableAmount = roundMoney(totalAmount - paidAmount);

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
          totalAmount,
          paidAmount,
          payableAmount,
          paymentStatus: payableAmount === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'due',
          returnAmount: 0,
          returnCount: 0,
          supplierLedgerTracked: true,
          id: purchaseId,
          tenantId,
          purchaseNumber,
          status: purchaseData.status || 'posted',
          createdBy: actorId,
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
        transaction.set(purchaseKeyRef, {
          tenantId,
          supplierId: purchaseData.supplierId,
          invoiceNumberNormalized: normalizedInvoice(purchaseData.invoiceNumber),
          purchaseId,
          createdBy: actorId,
          createdAt: serverTimestamp(),
        });
        transaction.update(supplierRef, {
          totalPurchases: increment(totalAmount),
          totalPaid: increment(paidAmount),
          payableBalance: increment(payableAmount),
          updatedAt: serverTimestamp(),
        });
        if (newProductCount > 0) {
          transaction.update(tenantRef, {
            usage: {
              ...tenantUsage,
              productsCount: (Number(tenantUsage.productsCount) || 0) + newProductCount,
            },
            updatedAt: serverTimestamp(),
          });
        }

        const supplierLedgerRef = doc(collection(db, 'ledgerEntries'));
        transaction.set(supplierLedgerRef, {
          tenantId,
          partyType: 'supplier',
          partyId: purchaseData.supplierId,
          partyName: purchaseData.supplierName,
          voucherType: 'purchase',
          voucherId: purchaseId,
          voucherNumber: purchaseNumber,
          referenceId: purchaseId,
          referenceNumber: purchaseData.invoiceNumber,
          debit: 0,
          credit: totalAmount,
          createdBy: actorId,
          createdAt: serverTimestamp(),
        });

        // 3. Process all rows for each product in memory, then update that product once.
        const itemsByProduct = new Map<string, typeof items>();
        for (const item of items) {
          const group = itemsByProduct.get(item.productId) || [];
          group.push(item);
          itemsByProduct.set(item.productId, group);
        }

        for (const [productId, productItems] of itemsByProduct) {
          const productRef = doc(db, PRODUCTS_COLL, productId);
          const productDoc = productDocs.get(productId);
          const firstItem = productItems[0];
          const product = productDoc
            ? productDoc.data() as Product
            : {
                id: productId,
                tenantId,
                name: firstItem.productName,
                brand: firstItem.productBrand || '',
                manufacturer: firstItem.productManufacturer || '',
                category: firstItem.productCategory || 'Others',
                unit: firstItem.productUnit || 'Units',
                minimumStock: Number(firstItem.productMinimumStock) || 0,
                sku: '',
                barcode: '',
                purchasePrice: 0,
                sellingPrice: 0,
                mrp: 0,
                gstPercentage: Number(firstItem.gstPercentage) || 0,
                stockQuantity: 0,
                batchNumber: '',
                expiryDate: firstItem.expiryDate,
                manufacturingDate: firstItem.mfgDate,
                batches: [],
                recordStatus: 'active',
                createdAt: serverTimestamp(),
              } as Product;
          let runningStock = product.stockQuantity || 0;
          const batchesList: ProductBatch[] = product.batches ? product.batches.map(batch => ({ ...batch })) : [];

          for (const item of productItems) {
            const itemRef = doc(collection(db, PURCHASE_ITEMS_COLL));
            transaction.set(itemRef, {
              ...item,
              id: itemRef.id,
              purchaseId,
              tenantId
            } satisfies PurchaseItem);

            const previousStock = runningStock;
            runningStock += item.quantity;
            const existingBatchIdx = batchesList.findIndex(
              batch => normalizedBatch(batch.batchNumber) === normalizedBatch(item.batchNumber)
            );
            if (existingBatchIdx >= 0) {
              batchesList[existingBatchIdx] = {
                ...batchesList[existingBatchIdx],
                quantity: batchesList[existingBatchIdx].quantity + item.quantity,
                purchasePrice: item.purchasePrice,
                salePrice: item.salePrice,
                mfgDate: item.mfgDate,
                expiryDate: item.expiryDate,
              };
            } else {
              batchesList.push({
                batchNumber: normalizedBatch(item.batchNumber),
                mfgDate: item.mfgDate,
                expiryDate: item.expiryDate,
                purchasePrice: item.purchasePrice,
                salePrice: item.salePrice,
                quantity: item.quantity,
                createdAt: Timestamp.now()
              });
            }

            const movementRef = doc(collection(db, MOVEMENTS_COLL));
            transaction.set(movementRef, {
              id: movementRef.id,
              tenantId,
              type: 'PURCHASE_IN',
              productId,
              productName: item.productName,
              batchNumber: normalizedBatch(item.batchNumber),
              quantity: item.quantity,
              previousStock,
              newStock: runningStock,
              purchaseId,
              userId: actorId,
              createdAt: serverTimestamp() as any
            } satisfies StockMovement);
          }

          batchesList.sort((a, b) => toJsDate(a.expiryDate).getTime() - toJsDate(b.expiryDate).getTime());
          const currentBatch = batchesList.find(batch => batch.quantity > 0) || batchesList[0];
          const latestItem = productItems[productItems.length - 1];
          const updatedProductFields: Partial<Product> = {
            stockQuantity: runningStock,
            purchasePrice: latestItem.purchasePrice,
            sellingPrice: latestItem.salePrice,
            batches: batchesList,
            updatedAt: serverTimestamp()
          };
          if (Number.isFinite(Number(latestItem.productMinimumStock))) {
            updatedProductFields.minimumStock = Math.max(0, Number(latestItem.productMinimumStock) || 0);
          }
          if (currentBatch) {
            updatedProductFields.batchNumber = currentBatch.batchNumber;
            updatedProductFields.expiryDate = currentBatch.expiryDate;
            updatedProductFields.manufacturingDate = currentBatch.mfgDate;
          }
          if (productDoc) {
            transaction.update(productRef, updatedProductFields);
          } else {
            transaction.set(productRef, {
              ...product,
              ...updatedProductFields,
              id: productId,
              tenantId,
              createdBy: actorId,
              createdAt: serverTimestamp(),
            });
          }
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
        if (roundMoney(Number(purchase.paidAmount) || 0) > 0) {
          throw new Error('This purchase has supplier payments. Reverse those payments before cancelling the purchase.');
        }
        if (roundMoney(Number(purchase.returnAmount) || 0) > 0) {
          throw new Error('This purchase already has returns and cannot be cancelled directly.');
        }

        const itemsByProduct = new Map<string, PurchaseItem[]>();
        for (const item of items) {
          const group = itemsByProduct.get(item.productId) || [];
          group.push(item);
          itemsByProduct.set(item.productId, group);
        }

        // Read and validate every product before performing any write.
        const productDocs = new Map<string, any>();
        for (const productId of itemsByProduct.keys()) {
          productDocs.set(productId, await transaction.get(doc(db, PRODUCTS_COLL, productId)));
        }
        const supplierRef = doc(db, SUPPLIERS_COLL, purchase.supplierId);
        const supplierDoc = purchase.supplierLedgerTracked
          ? await transaction.get(supplierRef)
          : null;
        if (purchase.supplierLedgerTracked && (!supplierDoc?.exists() || supplierDoc.data().tenantId !== tenantId)) {
          throw new Error('Supplier record required for this purchase could not be found.');
        }
        for (const [productId, productItems] of itemsByProduct) {
          const productDoc = productDocs.get(productId);
          if (!productDoc.exists() || productDoc.data().tenantId !== tenantId) {
            throw new Error(`Product ${productItems[0].productName} no longer exists.`);
          }

          const product = productDoc.data() as Product;
          const batches = product.batches ? product.batches.map(batch => ({ ...batch })) : [];
          for (const item of productItems) {
            const batch = batches.find(b => normalizedBatch(b.batchNumber) === normalizedBatch(item.batchNumber));
            if (!batch || batch.quantity < item.quantity) {
              throw new Error(
                `Cannot cancel purchase: ${item.quantity} units were added to batch "${item.batchNumber}" of product "${item.productName}", but only ${batch ? batch.quantity : 0} units are currently in stock. Reversing this purchase would cause negative inventory.`
              );
            }
            batch.quantity -= item.quantity;
          }
        }

        // Perform the reversal after all reads.
        for (const [productId, productItems] of itemsByProduct) {
          const productRef = doc(db, PRODUCTS_COLL, productId);
          const productDoc = productDocs.get(productId);
          const product = productDoc.data() as Product;
          let runningStock = product.stockQuantity || 0;
          const batchesList = product.batches ? product.batches.map(batch => ({ ...batch })) : [];

          for (const item of productItems) {
            const previousStock = runningStock;
            runningStock -= item.quantity;
            const batch = batchesList.find(
              candidate => normalizedBatch(candidate.batchNumber) === normalizedBatch(item.batchNumber)
            );
            if (batch) batch.quantity -= item.quantity;

            const movementRef = doc(collection(db, MOVEMENTS_COLL));
            transaction.set(movementRef, {
              id: movementRef.id,
              tenantId,
              type: 'PURCHASE_CANCEL_REVERSE',
              productId,
              productName: item.productName,
              batchNumber: normalizedBatch(item.batchNumber),
              quantity: -item.quantity,
              previousStock,
              newStock: runningStock,
              purchaseId,
              userId: actorId,
              reason: cancellationReason.trim() || 'Cancelled by user',
              createdAt: serverTimestamp() as any
            } satisfies StockMovement);
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
            stockQuantity: runningStock,
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
        }

        transaction.update(purchaseRef, {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelledBy: actorId,
          cancellationReason: cancellationReason.trim() || 'Cancelled by user',
        });
        if (purchase.supplierLedgerTracked) {
          transaction.update(supplierRef, {
            totalPurchases: increment(-roundMoney(purchase.totalAmount)),
            payableBalance: increment(-roundMoney(
              Number.isFinite(Number(purchase.payableAmount))
                ? Number(purchase.payableAmount)
                : purchase.totalAmount
            )),
            updatedAt: serverTimestamp(),
          });
        }

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
