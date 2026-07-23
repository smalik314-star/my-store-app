import { roundMoney, subtractMoney } from './currency';

export interface ReturnSettlement {
  outstandingAdjusted: number;
  creditCreated: number;
  newOutstanding: number;
}

export const validateReturnQuantity = (
  originalQuantity: number,
  previouslyReturned: number,
  requestedQuantity: number
): number => {
  const original = Number(originalQuantity);
  const returned = Number(previouslyReturned) || 0;
  const requested = Number(requestedQuantity);

  if (!Number.isInteger(original) || original <= 0) {
    throw new Error('Original quantity is invalid.');
  }
  if (!Number.isInteger(returned) || returned < 0 || returned > original) {
    throw new Error('Previously returned quantity is invalid.');
  }
  if (!Number.isInteger(requested) || requested <= 0) {
    throw new Error('Return quantity must be a whole number greater than zero.');
  }

  const returnable = original - returned;
  if (requested > returnable) {
    throw new Error(`Only ${returnable} unit(s) remain returnable.`);
  }
  return returnable;
};

export const settleReturnAgainstOutstanding = (
  returnAmount: number,
  outstandingAmount: number
): ReturnSettlement => {
  const amount = roundMoney(returnAmount);
  const outstanding = roundMoney(outstandingAmount);
  if (amount <= 0) throw new Error('Return amount must be greater than zero.');
  if (outstanding < 0) throw new Error('Outstanding amount cannot be negative.');

  const outstandingAdjusted = Math.min(outstanding, amount);
  return {
    outstandingAdjusted,
    creditCreated: subtractMoney(amount, outstandingAdjusted),
    newOutstanding: subtractMoney(outstanding, outstandingAdjusted),
  };
};

export const applyPaymentToOutstanding = (
  outstandingAmount: number,
  paymentAmount: number
): number => {
  const outstanding = roundMoney(outstandingAmount);
  const payment = roundMoney(paymentAmount);
  if (outstanding <= 0) throw new Error('This record is already fully paid.');
  if (payment <= 0) throw new Error('Payment amount must be greater than zero.');
  if (payment > outstanding) {
    throw new Error('Payment cannot exceed the outstanding amount.');
  }
  return subtractMoney(outstanding, payment);
};
