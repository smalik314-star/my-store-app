import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Tenant } from '../types';

export const subscriptionService = {
  async checkLimit(tenantId: string, type: 'invoicesCount' | 'productsCount' | 'usersCount'): Promise<{ allowed: boolean; message?: string }> {
    const tenantRef = doc(db, 'tenants', tenantId);
    const snap = await getDoc(tenantRef);
    
    if (!snap.exists()) return { allowed: false, message: 'Tenant not found' };
    
    const tenant = snap.data() as Tenant;
    const usage = tenant?.usage || { invoicesCount: 0, productsCount: 0, usersCount: 1 };
    const limits = tenant?.limits || { maxInvoices: 50, maxProducts: 100, maxUsers: 1 };
    
    const current = usage[type] || 0;
    const limit = limits[type] || (type === 'invoicesCount' ? 50 : type === 'productsCount' ? 100 : 1);
    
    if (current >= limit) {
      return { 
        allowed: false, 
        message: `Plan limit reached for ${type.replace('Count', '')}. Please upgrade your plan.` 
      };
    }
    
    return { allowed: true };
  }
};
