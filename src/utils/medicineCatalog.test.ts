import { describe, expect, it } from 'vitest';
import {
  getCatalogBucket,
  getCatalogBucketPath,
  searchCatalogRows,
  toCatalogRow,
  type MedicineCatalogRow,
} from './medicineCatalog';

describe('medicineCatalog', () => {
  it('uses a stable bucket for equivalent medicine prefixes', () => {
    expect(getCatalogBucket('Augmentin')).toBe(getCatalogBucket('  augmentin 625'));
    expect(getCatalogBucket('Dolo')).toBe(getCatalogBucket('DOlo 650'));
  });

  it('returns compact prefix matches without an MRP', () => {
    const rows: MedicineCatalogRow[] = [
      toCatalogRow({
        name: 'Dolo 650 Tablet',
        manufacturer: 'Micro Labs Ltd',
        genericName: 'Paracetamol 650mg',
        unit: 'Strip',
        mrp: 99,
      }),
      ['Drotin Tablet', 'Walter Bushnell', null, 'Tablets', 'Strip'],
    ];

    expect(searchCatalogRows(rows, 'dolo')).toEqual([
      {
        name: 'Dolo 650 Tablet',
        manufacturer: 'Micro Labs Ltd',
        genericName: 'Paracetamol 650mg',
        unit: 'Strip',
      },
    ]);
  });

  it('creates a versioned immutable bucket URL', () => {
    expect(getCatalogBucketPath(3)).toBe('/medicine-catalog/v1/bucket-03.json.gz');
  });
});
