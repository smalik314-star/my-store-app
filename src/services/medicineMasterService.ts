import { builtInMedicines } from '../data/builtInMedicines';
import {
  getCatalogBucket,
  getCatalogBucketPath,
  getCatalogPrefix,
  normalizeCatalogText,
  searchCatalogRows,
  type MedicineCatalogRow,
} from '../utils/medicineCatalog';

export interface MasterMedicine {
  id?: number;
  name: string;
  genericName?: string;
  category?: string;
  brand?: string;
  manufacturer?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  mrp?: number;
  barcode?: string;
  unit?: string;
  name_lower?: string;
  generic_lower?: string;
  brand_lower?: string;
  mfg_lower?: string;
}

const DB_NAME = 'PharmaFlowMasterDB';
const DB_VERSION = 1;
const STORE_NAME = 'medicines';

class MedicineMasterService {
  private db: IDBDatabase | null = null;
  private initializing: Promise<IDBDatabase> | null = null;
  private remoteBucketCache = new Map<number, MedicineCatalogRow[]>();
  private remoteBucketRequests = new Map<number, Promise<MedicineCatalogRow[]>>();
  private readonly maxCachedRemoteBuckets = 8;

  init(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (this.initializing) return this.initializing;

    this.initializing = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          
          // Create indexes for efficient searching
          store.createIndex('name_lower', 'name_lower', { unique: false });
          store.createIndex('generic_lower', 'generic_lower', { unique: false });
          store.createIndex('brand_lower', 'brand_lower', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('barcode', 'barcode', { unique: false });
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        this.initializing = null;
        resolve(this.db!);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event);
        this.initializing = null;
        reject(event);
      };
    });

    return this.initializing;
  }

  async countMedicines(): Promise<number> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearMedicines(): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Imports medicines in visual non-blocking chunks of 5,000 items.
   * This is key to preventing the UI from freezing while processing 250,000 records.
   */
  async importInChunks(
    medicines: MasterMedicine[],
    onProgress: (progress: number) => void
  ): Promise<void> {
    const db = await this.init();
    const batchSize = 5000;
    const total = medicines.length;
    let imported = 0;

    for (let i = 0; i < total; i += batchSize) {
      const chunk = medicines.slice(i, i + batchSize);
      
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        transaction.oncomplete = () => {
          imported += chunk.length;
          onProgress(Math.min(100, Math.round((imported / total) * 100)));
          resolve();
        };

        transaction.onerror = (e) => {
          console.error('Batch transaction failed:', e);
          reject(transaction.error);
        };

        chunk.forEach(item => {
          // Prepare searchable lowercase keys
          const preparedItem = {
            ...item,
            name_lower: item.name.toLowerCase(),
            generic_lower: (item.genericName || '').toLowerCase(),
            brand_lower: (item.brand || '').toLowerCase(),
            mfg_lower: (item.manufacturer || '').toLowerCase(),
          };
          store.add(preparedItem);
        });
      });

      // Pause for 15ms between chunks to let the browser process UI events & stay 100% responsive
      await new Promise(r => setTimeout(r, 15));
    }
  }

  /**
   * Searches the user's local catalog and the shared Firebase Hosting catalog together.
   * The shared catalog is split into deterministic buckets, so a search downloads only
   * one small cacheable file instead of loading 2.5 lakh medicines into browser memory.
   */
  async search(queryText: string, limit: number = 30): Promise<MasterMedicine[]> {
    if (!queryText || queryText.trim().length < 2) return [];

    const [localResults, sharedResults] = await Promise.all([
      this.searchLocal(queryText, limit).catch(() => []),
      this.searchSharedCatalog(queryText, limit).catch(() => []),
    ]);

    const uniqueResults = new Map<string, MasterMedicine>();
    for (const medicine of [...localResults, ...sharedResults]) {
      const key = `${normalizeCatalogText(medicine.name)}|${normalizeCatalogText(
        medicine.manufacturer || ''
      )}`;
      if (!uniqueResults.has(key)) uniqueResults.set(key, medicine);
      if (uniqueResults.size >= limit) break;
    }

    return Array.from(uniqueResults.values());
  }

  private async searchSharedCatalog(
    queryText: string,
    limit: number
  ): Promise<MasterMedicine[]> {
    if (getCatalogPrefix(queryText).length < 2 || typeof fetch === 'undefined') return [];

    const bucket = getCatalogBucket(queryText);
    const rows = await this.loadRemoteBucket(bucket);
    return searchCatalogRows(rows, queryText, limit);
  }

  private async loadRemoteBucket(bucket: number): Promise<MedicineCatalogRow[]> {
    const cachedRows = this.remoteBucketCache.get(bucket);
    if (cachedRows) {
      this.remoteBucketCache.delete(bucket);
      this.remoteBucketCache.set(bucket, cachedRows);
      return cachedRows;
    }

    const inFlightRequest = this.remoteBucketRequests.get(bucket);
    if (inFlightRequest) return inFlightRequest;

    const request = fetch(getCatalogBucketPath(bucket), {
      cache: 'force-cache',
      headers: { Accept: 'application/json' },
    })
      .then(async response => {
        if (!response.ok) return [];
        const rows = await response.json();
        return Array.isArray(rows) ? (rows as MedicineCatalogRow[]) : [];
      })
      .then(rows => {
        this.remoteBucketCache.set(bucket, rows);
        while (this.remoteBucketCache.size > this.maxCachedRemoteBuckets) {
          const oldestBucket = this.remoteBucketCache.keys().next().value;
          if (oldestBucket === undefined) break;
          this.remoteBucketCache.delete(oldestBucket);
        }
        return rows;
      })
      .finally(() => {
        this.remoteBucketRequests.delete(bucket);
      });

    this.remoteBucketRequests.set(bucket, request);
    return request;
  }

  /**
   * Search the optional browser-local IndexedDB catalog.
   */
  private async searchLocal(queryText: string, limit: number): Promise<MasterMedicine[]> {
    
    const db = await this.init();
    const searchTerm = queryText.toLowerCase().trim();

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('name_lower');

      const results: MasterMedicine[] = [];

      // Optimize: First, try a direct prefix range search on product name index (extremely fast O(log N))
      const range = IDBKeyRange.bound(searchTerm, searchTerm + '\uffff');
      const request = index.openCursor(range);

      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          // If we got fewer than limit, fallback to partial substring scan across name, generic name, & brand
          if (results.length >= limit) {
            resolve(results);
          } else {
            this.fallbackSubstringSearch(store, searchTerm, results, limit).then(resolve);
          }
        }
      };

      request.onerror = () => {
        // Fallback to empty list or fallback search if cursor fails
        resolve(results);
      };
    });
  }

  private fallbackSubstringSearch(
    store: IDBObjectStore,
    searchTerm: string,
    existingResults: MasterMedicine[],
    limit: number
  ): Promise<MasterMedicine[]> {
    return new Promise((resolve) => {
      const results = [...existingResults];
      const request = store.openCursor();
      const existingIds = new Set(results.map(r => r.id));

      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          const item = cursor.value;
          if (!existingIds.has(item.id)) {
            const nameMatch = item.name_lower && item.name_lower.includes(searchTerm);
            const genericMatch = item.generic_lower && item.generic_lower.includes(searchTerm);
            const brandMatch = item.brand_lower && item.brand_lower.includes(searchTerm);
            const mfgMatch = item.mfg_lower && item.mfg_lower.includes(searchTerm);
            
            if (nameMatch || genericMatch || brandMatch || mfgMatch) {
              results.push(item);
            }
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => resolve(results);
    });
  }

  /**
   * Search brands instantly using index prefix matching (extremely fast O(log N))
   */
  async searchBrands(queryText: string, limit: number = 30): Promise<string[]> {
    if (!queryText || queryText.trim().length < 2) return [];
    
    const db = await this.init();
    const searchTerm = queryText.toLowerCase().trim();

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('brand_lower');

      const results = new Set<string>();

      const range = IDBKeyRange.bound(searchTerm, searchTerm + '\uffff');
      const request = index.openCursor(range);

      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor && results.size < limit) {
          const item = cursor.value;
          if (item.brand) {
            results.add(item.brand);
          }
          cursor.continue();
        } else {
          resolve(Array.from(results));
        }
      };

      request.onerror = () => {
        resolve(Array.from(results));
      };
    });
  }

  /**
   * Resolve a trustworthy brand fallback from the bundled medicine master.
   * This is intentionally an exact name match so a brand is never guessed.
   */
  resolveBuiltInBrand(medicineName: string): string {
    const normalizedName = medicineName.trim().toLowerCase();
    if (!normalizedName) return '';

    return builtInMedicines.find(
      medicine => medicine.name.trim().toLowerCase() === normalizedName
    )?.brand?.trim() || '';
  }

  /**
   * Optional manual import of the bundled reference catalogue.
   * This is never auto-loaded into a live store and should only be used when
   * an operator explicitly chooses to import the bundled medicine reference.
   */
  async importBuiltInReferenceCatalog(): Promise<void> {
    const count = await this.countMedicines();
    if (count > 0) return; // Already has data

    const sampleMedicines: MasterMedicine[] = builtInMedicines.map(m => ({
      name: m.name,
      genericName: m.genericName,
      category: m.category,
      brand: m.brand,
      manufacturer: m.manufacturer,
      purchasePrice: m.purchasePrice,
      sellingPrice: m.sellingPrice,
      mrp: m.mrp,
      unit: m.unit
    }));

    await this.importInChunks(sampleMedicines, () => {});
  }
}

export const medicineMasterService = new MedicineMasterService();
