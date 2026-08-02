export const normalizeSearchTerm = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

export const normalizeSearchIndex = (value: unknown): string =>
  normalizeSearchTerm(value).replace(/\s+/g, ' ');

export const getSearchVariants = (value: unknown): string[] => {
  const raw = String(value ?? '').trim();
  const normalized = normalizeSearchIndex(raw);
  if (!normalized) return [];

  const titleCase = normalized.replace(/\b\w/g, character => character.toUpperCase());
  return Array.from(new Set([
    normalized,
    raw,
    raw.toLowerCase(),
    raw.toUpperCase(),
    titleCase,
  ]));
};

export const dedupeById = <T extends { id: string }>(rows: T[]): T[] =>
  Array.from(new Map(rows.map(row => [row.id, row])).values());

export const matchesSearchQuery = (query: string, ...values: unknown[]): boolean => {
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery) return true;

  return values.some(value => normalizeSearchTerm(value).includes(normalizedQuery));
};
