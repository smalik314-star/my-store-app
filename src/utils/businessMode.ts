import type { BusinessMode, Tenant } from '../types';

export const BUSINESS_MODES: BusinessMode[] = ['retail', 'wholesale', 'hybrid'];

export const resolveBusinessMode = (tenant?: Pick<Tenant, 'businessMode'> | null): BusinessMode =>
  tenant?.businessMode && BUSINESS_MODES.includes(tenant.businessMode)
    ? tenant.businessMode
    : 'retail';

export const isBusinessModeConfigured = (
  tenant?: Pick<Tenant, 'businessMode' | 'businessModeConfigured'> | null
): boolean => {
  if (!tenant) return true;
  if (typeof tenant.businessModeConfigured === 'boolean') {
    return tenant.businessModeConfigured;
  }
  // Existing tenants predate business modes and remain Retail without a forced migration screen.
  return true;
};

export const supportsRetail = (mode: BusinessMode): boolean =>
  mode === 'retail' || mode === 'hybrid';

export const supportsWholesale = (mode: BusinessMode): boolean =>
  mode === 'wholesale' || mode === 'hybrid';
