import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Tenant } from '../types';
import { getEffectiveLimits } from '../config/subscription';
import { tenantService } from './tenantService';

export const subscriptionService = {
  async checkLimit(tenantId: string, type: 'invoicesCount' | 'productsCount' | 'usersCount'): Promise<{ allowed: boolean; message?: string }> {
    const tenantRef = doc(db, 'tenants', tenantId);
    const snap = await getDoc(tenantRef);
    
    if (!snap.exists()) return { allowed: false, message: 'Tenant not found' };
    
    const tenant = snap.data() as Tenant;
    const usage = tenant?.usage || { invoicesCount: 0, productsCount: 0, usersCount: 1 };
    const limits = getEffectiveLimits(tenant);
    
    const current = type === 'invoicesCount'
      ? await tenantService.getMonthlyInvoiceUsage(tenantId)
      : (usage[type] || 0);
    const limitKey = type === 'invoicesCount'
      ? 'maxInvoices'
      : type === 'productsCount'
        ? 'maxProducts'
        : 'maxUsers';
    const limit = limits[limitKey];
    
    if (current >= limit) {
      return { 
        allowed: false, 
        message: `Plan limit reached for ${type.replace('Count', '')}. Please upgrade your plan.` 
      };
    }
    
    return { allowed: true };
  }
};
