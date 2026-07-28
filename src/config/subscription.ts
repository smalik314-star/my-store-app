import type { SubscriptionPlan, Tenant } from '../types';
import { toJsDate } from '../utils/date';

export type BillingPeriod = 'monthly' | 'annually';

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  priceMonthly: number;
  priceAnnually: number;
  description: string;
  features: string[];
  limits: Tenant['limits'];
  recommended?: boolean;
  trialDays?: number;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceAnnually: 0,
    description: 'Core pharmacy billing for a small store',
    features: ['50 invoices/month', '100 products', '1 user', 'Basic reports'],
    limits: { maxInvoices: 50, maxProducts: 100, maxUsers: 1 },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 199,
    priceAnnually: 1990,
    description: 'Higher limits and team workflows',
    features: ['1,000 invoices/month', '5,000 products', '5 users', 'Inventory insights'],
    limits: { maxInvoices: 1000, maxProducts: 5000, maxUsers: 5 },
    recommended: true,
    trialDays: 30,
  },
  business: {
    id: 'business',
    name: 'Business',
    priceMonthly: 399,
    priceAnnually: 3990,
    description: 'Large-store ERP capacity',
    features: ['10,000 invoices/month', '50,000 products', '20 users', 'Priority support'],
    limits: { maxInvoices: 10000, maxProducts: 50000, maxUsers: 20 },
  },
};

export const getPlanLimits = (plan: SubscriptionPlan): Tenant['limits'] =>
  SUBSCRIPTION_PLANS[plan].limits;

export const isTrialActive = (tenant: Tenant, now = new Date()): boolean => {
  if (tenant.subscriptionStatus !== 'trialing' || !tenant.trialEndsAt) return false;
  const end = toJsDate(tenant.trialEndsAt);
  return Number.isFinite(end.getTime()) && end.getTime() > now.getTime();
};

/**
 * Expired client-started trials fall back to free entitlements immediately,
 * even before an administrator performs any cleanup write.
 */
export const getEffectivePlan = (tenant: Tenant, now = new Date()): SubscriptionPlan => {
  if (tenant.subscriptionStatus === 'trialing') {
    return isTrialActive(tenant, now) ? 'pro' : 'free';
  }
  if (tenant.status === 'cancelled' || tenant.subscriptionStatus === 'cancelled') return 'free';
  return tenant.plan || 'free';
};

export const getEffectiveLimits = (tenant: Tenant, now = new Date()): Tenant['limits'] =>
  getPlanLimits(getEffectivePlan(tenant, now));

