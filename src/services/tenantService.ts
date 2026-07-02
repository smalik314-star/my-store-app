import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp, 
  updateDoc, 
  increment,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Tenant, SubscriptionPlan, UserRole } from '../types';

export const tenantService = {
  async createTenant(ownerId: string, storeName: string): Promise<Tenant> {
    const tenantId = `tenant_${Math.random().toString(36).substr(2, 9)}`;
    const tenantRef = doc(db, 'tenants', tenantId);
    
    const tenantData: Tenant = {
      id: tenantId,
      name: storeName,
      ownerId: ownerId,
      plan: 'free',
      status: 'active',
      usage: {
        invoicesCount: 0,
        productsCount: 0,
        usersCount: 1,
      },
      limits: {
        maxInvoices: 50,
        maxProducts: 100,
        maxUsers: 1,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(tenantRef, tenantData);
    
    // Create TenantUser record
    const tenantUserRef = doc(db, 'tenants', tenantId, 'users', ownerId);
    await setDoc(tenantUserRef, {
      uid: ownerId,
      tenantId: tenantId,
      role: 'owner',
      addedAt: serverTimestamp(),
    });

    return tenantData;
  },

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const tenantRef = doc(db, 'tenants', tenantId);
    const snap = await getDoc(tenantRef);
    return snap.exists() ? (snap.data() as Tenant) : null;
  },

  async updateUsage(tenantId: string, field: 'invoicesCount' | 'productsCount' | 'usersCount', delta: number) {
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, {
      [`usage.${field}`]: increment(delta),
      updatedAt: serverTimestamp(),
    });
  },

  async upgradePlan(tenantId: string, plan: SubscriptionPlan) {
    const tenantRef = doc(db, 'tenants', tenantId);
    const limits = {
      free: { maxInvoices: 50, maxProducts: 100, maxUsers: 1 },
      pro: { maxInvoices: 1000, maxProducts: 5000, maxUsers: 5 },
      business: { maxInvoices: 10000, maxProducts: 50000, maxUsers: 20 },
    };

    await updateDoc(tenantRef, {
      plan,
      limits: limits[plan],
      updatedAt: serverTimestamp(),
    });
  },

  async getTenantUsers(tenantId: string) {
    const usersRef = collection(db, 'tenants', tenantId, 'users');
    const snap = await getDocs(usersRef);
    return snap.docs.map(doc => doc.data());
  },

  async addUserToTenant(tenantId: string, email: string, role: UserRole) {
    // This is a simplified version. In production, you'd send an invite or check if user exists.
    // For now, we'll assume we can link by email if the user signs up.
    // We store pending invites in a separate collection.
    const inviteRef = doc(collection(db, 'invites'));
    await setDoc(inviteRef, {
      tenantId,
      email,
      role,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  }
};
