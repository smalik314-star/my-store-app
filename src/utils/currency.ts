/**
 * Global Currency Formatting Utility for PharmaFlow
 * Standards: INR (₹), Indian Numbering System (Lakhs, Crores)
 */

const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PAISE_PER_RUPEE = 100;

const asFiniteNumber = (value: number | string | null | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Converts rupees to integer paise. Financial arithmetic should be performed
 * on this integer representation to avoid binary floating-point drift.
 */
export const toPaise = (value: number | string | null | undefined): number =>
  Math.round((asFiniteNumber(value) + Number.EPSILON) * PAISE_PER_RUPEE);

export const fromPaise = (value: number): number =>
  Math.round(value) / PAISE_PER_RUPEE;

export const roundMoney = (value: number | string | null | undefined): number =>
  fromPaise(toPaise(value));

export const addMoney = (...values: Array<number | string | null | undefined>): number =>
  fromPaise(values.reduce<number>((total, value) => total + toPaise(value), 0));

export const subtractMoney = (
  value: number | string | null | undefined,
  deduction: number | string | null | undefined
): number => fromPaise(toPaise(value) - toPaise(deduction));

export interface LineTaxInput {
  quantity: number;
  rate: number;
  gstRate?: number;
  discount?: number;
  interstate?: boolean;
}

export interface LineTaxResult {
  gross: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
}

/**
 * Calculates an exclusive-GST line using integer paise. This utility does not
 * change existing records; callers opt in per workflow after schema review.
 */
export const calculateLineTax = ({
  quantity,
  rate,
  gstRate = 0,
  discount = 0,
  interstate = false,
}: LineTaxInput): LineTaxResult => {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error('Rate cannot be negative.');
  }
  if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) {
    throw new Error('GST rate must be between 0 and 100.');
  }

  const grossPaise = Math.round(toPaise(rate) * quantity);
  const discountPaise = toPaise(discount);
  if (discountPaise < 0 || discountPaise > grossPaise) {
    throw new Error('Discount cannot exceed the gross amount.');
  }

  const taxablePaise = grossPaise - discountPaise;
  const taxPaise = Math.round(taxablePaise * gstRate / 100);
  const igstPaise = interstate ? taxPaise : 0;
  const cgstPaise = interstate ? 0 : Math.floor(taxPaise / 2);
  const sgstPaise = interstate ? 0 : taxPaise - cgstPaise;

  return {
    gross: fromPaise(grossPaise),
    discount: fromPaise(discountPaise),
    taxable: fromPaise(taxablePaise),
    cgst: fromPaise(cgstPaise),
    sgst: fromPaise(sgstPaise),
    igst: fromPaise(igstPaise),
    tax: fromPaise(taxPaise),
    total: fromPaise(taxablePaise + taxPaise),
  };
};

/**
 * Formats a numeric value into INR currency string
 * @param value The amount to format
 * @returns Formatted string (e.g., ₹1,00,000.00)
 */
export const formatCurrency = (value: number | string | null | undefined): string => {
  return formatter.format(roundMoney(value));
};

/**
 * Formats a numeric value into INR currency string without decimals if whole number
 * @param value The amount to format
 * @returns Formatted string
 */
export const formatCurrencyCompact = (value: number | string | null | undefined): string => {
  const num = roundMoney(value);
  const formatted = formatter.format(num);
  return num % 1 === 0 ? formatted.replace('.00', '') : formatted;
};
