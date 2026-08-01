import { describe, expect, it } from 'vitest';
import { suggestedReorderQuantity } from './reorderService';

describe('reorder minimum/target formula', () => {
  it('does not reorder above minimum', () => expect(suggestedReorderQuantity(11, 10, 20)).toBe(0));
  it('restores low stock to target', () => expect(suggestedReorderQuantity(4, 10, 20)).toBe(16));
  it('defaults target to twice minimum', () => expect(suggestedReorderQuantity(2, 5)).toBe(8));
  it('ignores products without a configured threshold', () => expect(suggestedReorderQuantity(0, 0)).toBe(0));
});
