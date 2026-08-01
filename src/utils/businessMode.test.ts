import { describe, expect, it } from 'vitest';
import {
  isBusinessModeConfigured,
  resolveBusinessMode,
  supportsRetail,
  supportsWholesale,
} from './businessMode';

describe('business mode compatibility', () => {
  it('keeps legacy tenants on Retail without forcing setup', () => {
    expect(resolveBusinessMode({})).toBe('retail');
    expect(isBusinessModeConfigured({})).toBe(true);
  });

  it('requires setup only for explicitly unconfigured new tenants', () => {
    expect(isBusinessModeConfigured({
      businessMode: 'retail',
      businessModeConfigured: false,
    })).toBe(false);
  });

  it('maps Retail, Wholesale and Hybrid capabilities', () => {
    expect(supportsRetail('retail')).toBe(true);
    expect(supportsWholesale('retail')).toBe(false);
    expect(supportsWholesale('wholesale')).toBe(true);
    expect(supportsRetail('wholesale')).toBe(false);
    expect(supportsRetail('hybrid')).toBe(true);
    expect(supportsWholesale('hybrid')).toBe(true);
  });
});
