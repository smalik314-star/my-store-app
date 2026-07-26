import type { MasterMedicine } from '../services/medicineMasterService';

const clean = (value: string | undefined) => value?.trim() || undefined;

const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
};

const findColumn = (headers: string[], exact: string[], partial: string[] = []) => {
  const exactIndex = headers.findIndex(header => exact.includes(header));
  return exactIndex !== -1
    ? exactIndex
    : headers.findIndex(header => partial.some(alias => header.includes(alias)));
};

const parseAmount = (value: string | undefined) => {
  const parsed = Number((value || '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const deriveCategory = (name: string, pack: string) => {
  const value = `${name} ${pack}`.toLowerCase();
  if (value.includes('tablet') || value.includes(' tab ')) return 'Tablets';
  if (value.includes('capsule') || value.includes(' cap ')) return 'Capsules';
  if (value.includes('syrup') || value.includes('suspension')) return 'Syrups';
  if (value.includes('injection') || value.includes(' vial')) return 'Injections';
  if (/(cream|gel|ointment|lotion)/.test(value)) return 'Topicals';
  if (/(drop|spray)/.test(value)) return 'Drops & Sprays';
  return 'Others';
};

const deriveUnit = (pack: string) => {
  const value = pack.toLowerCase();
  if (value.includes('strip')) return 'Strip';
  if (value.includes('bottle')) return 'Bottle';
  if (value.includes('box')) return 'Box';
  if (value.includes('vial')) return 'Vial';
  if (value.includes('tube')) return 'Tube';
  return 'Piece';
};

const isDiscontinued = (value: string | undefined) =>
  ['true', 'yes', '1', 'discontinued'].includes((value || '').trim().toLowerCase());

export interface MedicineCsvResult {
  medicines: MasterMedicine[];
  skippedDiscontinued: number;
}

/**
 * Parses the integrated Indian medicines dataset and compatible CSV exports.
 * `manufacturer_name` is deliberately mapped to manufacturer, never to brand.
 */
export const parseMedicineCsv = (csvText: string): MedicineCsvResult => {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) throw new Error('CSV file is empty or has no data rows.');

  const headers = rows[0].map(header => header.trim().toLowerCase());
  const nameIdx = findColumn(headers, ['name', 'medicine_name'], ['medicine', 'title']);
  if (nameIdx === -1) {
    throw new Error('Medicine name column is missing from the CSV.');
  }

  const manufacturerIdx = findColumn(
    headers,
    ['manufacturer_name', 'manufacturer', 'company_name', 'company'],
    ['manufacturer', 'company', 'mfg']
  );
  const brandIdx = findColumn(headers, ['brand', 'brand_name', 'trade_name'], ['brand', 'trade']);
  const composition1Idx = findColumn(
    headers,
    ['short_composition1', 'composition1', 'generic_name'],
    ['generic', 'composition', 'salt', 'formula']
  );
  const composition2Idx = findColumn(headers, ['short_composition2', 'composition2']);
  const categoryIdx = findColumn(headers, ['category', 'medicine_category'], ['category', 'group']);
  const packIdx = findColumn(headers, ['pack_size_label', 'pack_size', 'unit'], ['pack', 'unit', 'strip']);
  const mrpIdx = findColumn(headers, ['price(₹)', 'price', 'mrp'], ['mrp', 'price']);
  const purchaseIdx = findColumn(headers, ['purchase_price'], ['purchase', 'cost', 'buying']);
  const sellingIdx = findColumn(headers, ['selling_price'], ['selling', 'retail']);
  const discontinuedIdx = findColumn(headers, ['is_discontinued', 'discontinued']);

  const medicines: MasterMedicine[] = [];
  let skippedDiscontinued = 0;

  for (const cells of rows.slice(1)) {
    if (discontinuedIdx !== -1 && isDiscontinued(cells[discontinuedIdx])) {
      skippedDiscontinued += 1;
      continue;
    }

    const name = clean(cells[nameIdx]);
    if (!name) continue;
    const pack = clean(cells[packIdx]) || '';
    const compositions = [clean(cells[composition1Idx]), clean(cells[composition2Idx])]
      .filter((value): value is string => Boolean(value));

    medicines.push({
      name,
      manufacturer: manufacturerIdx !== -1 ? clean(cells[manufacturerIdx]) : undefined,
      brand: brandIdx !== -1 ? clean(cells[brandIdx]) : undefined,
      genericName: compositions.length ? compositions.join(' + ') : undefined,
      category: categoryIdx !== -1 ? clean(cells[categoryIdx]) : deriveCategory(name, pack),
      unit: deriveUnit(pack),
      mrp: mrpIdx !== -1 ? parseAmount(cells[mrpIdx]) : undefined,
      purchasePrice: purchaseIdx !== -1 ? parseAmount(cells[purchaseIdx]) : undefined,
      sellingPrice: sellingIdx !== -1 ? parseAmount(cells[sellingIdx]) : undefined,
    });
  }

  if (!medicines.length) throw new Error('No active medicine records could be parsed from this CSV.');
  return { medicines, skippedDiscontinued };
};
