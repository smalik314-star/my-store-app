import type { Customer, Product } from '../types';

export type SaleUnit = 'unit' | 'pack' | 'case';

const positiveInteger = (value: unknown, fallback = 1): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getSaleConversionFactor = (
  product: Pick<Product, 'unitsPerPack' | 'packsPerCase'>,
  saleUnit: SaleUnit
): number => {
  const unitsPerPack = positiveInteger(product.unitsPerPack);
  const packsPerCase = positiveInteger(product.packsPerCase);
  if (saleUnit === 'case') return unitsPerPack * packsPerCase;
  if (saleUnit === 'pack') return unitsPerPack;
  return 1;
};

export const toBaseQuantity = (
  product: Pick<Product, 'unitsPerPack' | 'packsPerCase'>,
  saleUnit: SaleUnit,
  saleQuantity: number
): number => getSaleConversionFactor(product, saleUnit) * positiveInteger(saleQuantity);

export const resolveSalePrice = (
  product: Pick<Product, 'sellingPrice' | 'wholesalePrice'>,
  saleMode: 'retail' | 'wholesale',
  customer?: Pick<Customer, 'pricingTier'> | null
): number => {
  const useWholesale = saleMode === 'wholesale' || customer?.pricingTier === 'wholesale';
  const wholesalePrice = Number(product.wholesalePrice);
  return useWholesale && Number.isFinite(wholesalePrice) && wholesalePrice > 0
    ? wholesalePrice
    : Number(product.sellingPrice) || 0;
};
