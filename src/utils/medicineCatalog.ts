import type { MasterMedicine } from '../services/medicineMasterService';

export const MEDICINE_CATALOG_VERSION = 'v1';
export const MEDICINE_CATALOG_BUCKETS = 64;

export type MedicineCatalogRow = [
  name: string,
  manufacturer: string | null,
  genericName: string | null,
  category: string | null,
  unit: string | null,
];

export const normalizeCatalogText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

export const getCatalogPrefix = (query: string): string =>
  normalizeCatalogText(query).replace(/[^a-z0-9]/g, '').slice(0, 2);

export const getCatalogBucket = (
  query: string,
  bucketCount: number = MEDICINE_CATALOG_BUCKETS
): number => {
  const prefix = getCatalogPrefix(query);
  let hash = 2166136261;

  for (let index = 0; index < prefix.length; index += 1) {
    hash ^= prefix.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % bucketCount;
};

export const toCatalogRow = (medicine: MasterMedicine): MedicineCatalogRow => [
  medicine.name,
  medicine.manufacturer || null,
  medicine.genericName || null,
  medicine.category || null,
  medicine.unit || null,
];

export const fromCatalogRow = (row: MedicineCatalogRow): MasterMedicine => ({
  name: row[0],
  manufacturer: row[1] || undefined,
  genericName: row[2] || undefined,
  category: row[3] || undefined,
  unit: row[4] || undefined,
});

export const searchCatalogRows = (
  rows: MedicineCatalogRow[],
  query: string,
  limit: number = 30
): MasterMedicine[] => {
  const searchTerm = normalizeCatalogText(query);
  if (searchTerm.length < 2) return [];

  return rows
    .filter(row => normalizeCatalogText(row[0]).startsWith(searchTerm))
    .slice(0, limit)
    .map(fromCatalogRow);
};

export const getCatalogBucketPath = (bucket: number): string =>
  `/medicine-catalog/${MEDICINE_CATALOG_VERSION}/bucket-${String(bucket).padStart(2, '0')}.json.gz`;
