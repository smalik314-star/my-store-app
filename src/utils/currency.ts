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

/**
 * Formats a numeric value into INR currency string
 * @param value The amount to format
 * @returns Formatted string (e.g., ₹1,00,000.00)
 */
export const formatCurrency = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return formatter.format(0);
  }
  return formatter.format(Number(value));
};

/**
 * Formats a numeric value into INR currency string without decimals if whole number
 * @param value The amount to format
 * @returns Formatted string
 */
export const formatCurrencyCompact = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return formatter.format(0).replace('.00', '');
  }
  const num = Number(value);
  const formatted = formatter.format(num);
  return num % 1 === 0 ? formatted.replace('.00', '') : formatted;
};
