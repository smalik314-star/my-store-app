export const normalizeSearchTerm = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

export const matchesSearchQuery = (query: string, ...values: unknown[]): boolean => {
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery) return true;

  return values.some(value => normalizeSearchTerm(value).includes(normalizedQuery));
};
