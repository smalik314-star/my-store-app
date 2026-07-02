import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Tenant } from '../types';

export const subscriptionService = {
  async checkLimit(tenantId: string, type: 'invoicesCount' | 'productsCount' | 'usersCount'): Promise<{ allowed: boolean; message?: string }> {
    const tenantRef = doc(db, 'tenants', tenantId);
    const snap = await getDoc(tenantRef);
    
    if (!snap.exists()) return { allowed: false, message: 'Tenant not found' };
    
    const tenant = snap.data() as Tenant;
    const current = tenant.usage[type];
    const limit = tenant.limits[type];
    
    if (current >= limit) {
      return { 
        allowed: false, 
        message: `Plan limit reached for ${type.replace('Count', '')}. Please upgrade your plan.` 
      };
    }
    
    return { allowed: true };
  }
};
