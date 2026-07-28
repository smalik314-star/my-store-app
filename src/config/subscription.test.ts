import { describe, expect, it } from 'vitest';
import type { Tenant } from '../types';
import {
  getEffectiveLimits,
  getEffectivePlan,
  isTrialActive,
  SUBSCRIPTION_PLANS,
} from './subscription';

const tenant = (overrides: Partial<Tenant> = {}): Tenant => ({
  id: 'tenant_owner',
  name: 'Test Pharmacy',
  ownerId: 'owner',
  plan: 'free',
  status: 'active',
  subscriptionStatus: 'free',
  usage: { invoicesCount: 0, productsCount: 0, usersCount: 1 },
  limits: SUBSCRIPTION_PLANS.free.limits,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('subscription entitlements', () => {
  it('uses Pro limits while a trial is active', () => {
    const current = tenant({
      plan: 'pro',
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date('2026-08-15T00:00:00Z'),
    });
    const now = new Date('2026-07-28T00:00:00Z');
    expect(isTrialActive(current, now)).toBe(true);
    expect(getEffectivePlan(current, now)).toBe('pro');
    expect(getEffectiveLimits(current, now)).toEqual(SUBSCRIPTION_PLANS.pro.limits);
  });

  it('falls back to Free limits when a trial expires', () => {
    const current = tenant({
      plan: 'pro',
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date('2026-07-01T00:00:00Z'),
    });
    const now = new Date('2026-07-28T00:00:00Z');
    expect(isTrialActive(current, now)).toBe(false);
    expect(getEffectivePlan(current, now)).toBe('free');
    expect(getEffectiveLimits(current, now)).toEqual(SUBSCRIPTION_PLANS.free.limits);
  });

  it('preserves an active paid Business plan', () => {
    const current = tenant({
      plan: 'business',
      subscriptionStatus: 'active',
      limits: SUBSCRIPTION_PLANS.business.limits,
    });
    expect(getEffectivePlan(current)).toBe('business');
    expect(getEffectiveLimits(current)).toEqual(SUBSCRIPTION_PLANS.business.limits);
  });
});
