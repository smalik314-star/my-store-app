import { roundMoney } from './currency';

export interface LossSaleCalculation {
  isLoss: boolean;
  lossPerUnit: number;
  totalLoss: number;
}

export const calculateLossSale = (
  saleRate: number,
  purchaseRate: number,
  quantity: number
): LossSaleCalculation => {
  const safeSaleRate = Math.max(0, Number(saleRate) || 0);
  const safePurchaseRate = Math.max(0, Number(purchaseRate) || 0);
  const safeQuantity = Math.max(0, Number(quantity) || 0);
  const lossPerUnit = roundMoney(Math.max(0, safePurchaseRate - safeSaleRate));

  return {
    isLoss: safePurchaseRate > 0 && lossPerUnit > 0,
    lossPerUnit,
    totalLoss: roundMoney(lossPerUnit * safeQuantity),
  };
};
