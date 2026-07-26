import { describe, expect, it } from 'vitest';
import { parseMedicineCsv } from './medicineCsv';

describe('parseMedicineCsv', () => {
  it('maps the integrated dataset manufacturer without importing its stale price as MRP', () => {
    const csv = [
      'id,name,price(₹),Is_discontinued,manufacturer_name,type,pack_size_label,short_composition1,short_composition2',
      '1,Augmentin 625 Duo Tablet,223.42,FALSE,Glaxo SmithKline Pharmaceuticals Ltd,allopathy,10 tablets in 1 strip,Amoxycillin (500mg),Clavulanic Acid (125mg)',
    ].join('\n');

    const result = parseMedicineCsv(csv);

    expect(result.medicines).toEqual([
      expect.objectContaining({
        name: 'Augmentin 625 Duo Tablet',
        manufacturer: 'Glaxo SmithKline Pharmaceuticals Ltd',
        brand: undefined,
        genericName: 'Amoxycillin (500mg) + Clavulanic Acid (125mg)',
        category: 'Tablets',
        unit: 'Strip',
      }),
    ]);
    expect(result.medicines[0]).not.toHaveProperty('mrp');
  });

  it('skips discontinued medicines', () => {
    const csv = [
      'name,Is_discontinued,manufacturer_name',
      'Active Tablet,FALSE,Active Pharma',
      'Old Tablet,TRUE,Old Pharma',
    ].join('\n');

    const result = parseMedicineCsv(csv);

    expect(result.medicines).toHaveLength(1);
    expect(result.medicines[0].name).toBe('Active Tablet');
    expect(result.skippedDiscontinued).toBe(1);
  });

  it('handles commas and escaped quotes inside quoted CSV values', () => {
    const csv = [
      'name,manufacturer_name,pack_size_label',
      '"Example, Plus Tablet","Acme ""India"" Ltd","10 tablets in 1 strip"',
    ].join('\n');

    expect(parseMedicineCsv(csv).medicines[0]).toEqual(
      expect.objectContaining({
        name: 'Example, Plus Tablet',
        manufacturer: 'Acme "India" Ltd',
        unit: 'Strip',
      })
    );
  });
});
