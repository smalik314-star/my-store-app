export interface StockAdjustmentCalculation {
  difference: number;
  newProductStock: number;
}

export function validateAdjustmentDirection(
  reason:
    | 'physical_increase'
    | 'physical_decrease'
    | 'damage'
    | 'breakage'
    | 'expired'
    | 'lost'
    | 'found'
    | 'correction'
    | 'other',
  difference: number
): void {
  const increaseReasons = ['physical_increase', 'found'];
  const decreaseReasons = ['physical_decrease', 'damage', 'breakage', 'expired', 'lost'];
  if (increaseReasons.includes(reason) && difference <= 0) {
    throw new Error('The selected adjustment type requires an increased physical quantity.');
  }
  if (decreaseReasons.includes(reason) && difference >= 0) {
    throw new Error('The selected adjustment type requires a reduced physical quantity.');
  }
}

export function calculateStockAdjustment(
  currentBatchQuantity: number,
  targetBatchQuantity: number,
  currentProductStock: number
): StockAdjustmentCalculation {
  const currentBatch = Number(currentBatchQuantity);
  const targetBatch = Number(targetBatchQuantity);
  const currentProduct = Number(currentProductStock);

  if (![currentBatch, targetBatch, currentProduct].every(Number.isFinite)) {
    throw new Error('Stock quantities must be valid numbers.');
  }
  if (![currentBatch, targetBatch, currentProduct].every(Number.isInteger)) {
    throw new Error('Stock quantities must be whole numbers.');
  }
  if (currentBatch < 0 || targetBatch < 0 || currentProduct < 0) {
    throw new Error('Stock quantities cannot be negative.');
  }

  const difference = targetBatch - currentBatch;
  if (difference === 0) {
    throw new Error('Enter a physical quantity different from the current batch quantity.');
  }

  const newProductStock = currentProduct + difference;
  if (newProductStock < 0) {
    throw new Error('This adjustment would make total product stock negative.');
  }

  return { difference, newProductStock };
}
