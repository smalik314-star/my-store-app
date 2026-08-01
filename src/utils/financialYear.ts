export interface FinancialYear {
  startYear: number;
  endYear: number;
  key: string;
  label: string;
}

export function getIndianFinancialYear(value: Date = new Date()): FinancialYear {
  const year = value.getFullYear();
  const startYear = value.getMonth() >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    startYear,
    endYear,
    key: `${startYear}-${String(endYear).slice(-2)}`,
    label: `${startYear}-${String(endYear).slice(-2)}`,
  };
}

export function formatDocumentNumber(prefix: string, financialYear: FinancialYear, count: number) {
  return `${prefix}-${financialYear.label}-${String(count).padStart(6, '0')}`;
}
