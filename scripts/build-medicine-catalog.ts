import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseMedicineCsv } from '../src/utils/medicineCsv';
import {
  getCatalogBucket,
  MEDICINE_CATALOG_BUCKETS,
  MEDICINE_CATALOG_VERSION,
  toCatalogRow,
  type MedicineCatalogRow,
} from '../src/utils/medicineCatalog';

const sourcePath = process.argv[2];
if (!sourcePath) {
  throw new Error('Usage: tsx scripts/build-medicine-catalog.ts <medicine-csv-path>');
}

const outputDirectory = path.resolve(
  process.cwd(),
  'public',
  'medicine-catalog',
  MEDICINE_CATALOG_VERSION
);
const csv = fs.readFileSync(path.resolve(sourcePath), 'utf8');
const { medicines, skippedDiscontinued } = parseMedicineCsv(csv);
const buckets: MedicineCatalogRow[][] = Array.from(
  { length: MEDICINE_CATALOG_BUCKETS },
  () => []
);

for (const medicine of medicines) {
  buckets[getCatalogBucket(medicine.name)].push(toCatalogRow(medicine));
}

fs.mkdirSync(outputDirectory, { recursive: true });

const bucketStats = buckets.map((rows, bucket) => {
  rows.sort((left, right) => left[0].localeCompare(right[0], 'en', { sensitivity: 'base' }));
  const filename = `bucket-${String(bucket).padStart(2, '0')}.json.gz`;
  const content = JSON.stringify(rows);
  const compressedContent = gzipSync(content, { level: 9 });
  fs.writeFileSync(path.join(outputDirectory, filename), compressedContent);
  return {
    bucket,
    records: rows.length,
    uncompressedBytes: Buffer.byteLength(content),
    compressedBytes: compressedContent.byteLength,
  };
});

const manifest = {
  version: MEDICINE_CATALOG_VERSION,
  generatedAt: new Date().toISOString(),
  records: medicines.length,
  skippedDiscontinued,
  bucketCount: MEDICINE_CATALOG_BUCKETS,
  fields: ['name', 'manufacturer', 'genericName', 'category', 'unit'],
  mrpImported: false,
  buckets: bucketStats,
};

fs.writeFileSync(
  path.join(outputDirectory, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);

console.log(
  `Built ${medicines.length.toLocaleString()} medicines in ${MEDICINE_CATALOG_BUCKETS} on-demand buckets.`
);
console.log(`Skipped ${skippedDiscontinued.toLocaleString()} discontinued records.`);
