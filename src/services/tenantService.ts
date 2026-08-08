import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc,
  serverTimestamp, 
  updateDoc, 
  increment,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  collectionGroup,
  limit
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Tenant, SubscriptionPlan, UserRole } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';

export const tenantService = {
  async createTenant(ownerId: string, storeName: string, email?: string): Promise<Tenant> {
    // Use Firestore auto-ID to avoid collisions and non-deterministic IDs
    const tenantRef = doc(collection(db, 'tenants'));
    const tenantId = tenantRef.id;
    
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

    try {
      await setDoc(tenantRef, tenantData);
      
      // Create TenantUser record
      const tenantUserRef = doc(db, 'tenants', tenantId, 'users', ownerId);
      await setDoc(tenantUserRef, {
        uid: ownerId,
        tenantId: tenantId,
        role: 'owner',
        email: email || null,
        addedAt: serverTimestamp(),
      });

      return tenantData;
    } catch (error) {
      console.error('Error creating tenant:', error);
      handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}`);
      throw error;
    }
  },

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const tenantRef = doc(db, 'tenants', tenantId);
    try {
      const snap = await getDoc(tenantRef);
      return snap.exists() ? (snap.data() as Tenant) : null;
    } catch (error) {
      console.error('Error fetching tenant:', error);
      handleFirestoreError(error, OperationType.GET, `tenants/${tenantId}`);
      throw error;
    }
  },

  /**
   * Find a tenant invite by email across all tenants' user subcollections.
   * Used during sign-in to link an invited user to an existing tenant.
   */
  async findInviteByEmail(email: string): Promise<{ tenantId: string; role: UserRole } | null> {
    if (!email) return null;
    try {
      const q = query(
        collectionGroup(db, 'users'),
        where('email', '==', email),
        limit(10)
      );
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        // Only match active invites (docs without a firebase uid yet, or where uid starts with 'user_')
        if (data.uid && typeof data.uid === 'string' && data.uid.startsWith('user_')) {
          return { tenantId: data.tenantId, role: data.role as UserRole };
        }
      }
      return null;
    } catch (error) {
      console.error('Error finding invite by email:', error);
      return null;
    }
  },

  /**
   * Link an invited user to their tenant by replacing the placeholder UID
   * with the real Firebase Auth UID.
   */
  async linkInvitedUser(tenantId: string, placeholderUid: string, realUid: string, email: string) {
    const placeholderRef = doc(db, 'tenants', tenantId, 'users', placeholderUid);
    const realRef = doc(db, 'tenants', tenantId, 'users', realUid);
    try {
      const snap = await getDoc(placeholderRef);
      if (snap.exists()) {
        const data = snap.data();
        // Create real user doc with invited role
        await setDoc(realRef, {
          ...data,
          uid: realUid,
          email,
          updatedAt: serverTimestamp(),
        });
        // Remove placeholder
        await deleteDoc(placeholderRef);
        return data;
      }
      return null;
    } catch (error) {
      console.error('Error linking invited user:', error);
      return null;
    }
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

  async startProTrial(tenantId: string) {
    const tenantRef = doc(db, 'tenants', tenantId);
    const now = new Date();
    const trialEnds = new Date();
    trialEnds.setDate(now.getDate() + 30);

    const limits = { maxInvoices: 1000, maxProducts: 5000, maxUsers: 5 };

    await updateDoc(tenantRef, {
      plan: 'pro',
      limits: limits,
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
      invites: [],
      isTrialExtended: false,
      updatedAt: serverTimestamp(),
    });
  },

  async updateInvites(tenantId: string, invites: string[], isTrialExtended: boolean, newTrialEndsAt?: string) {
    const tenantRef = doc(db, 'tenants', tenantId);
    const updates: any = {
      invites,
      isTrialExtended,
      updatedAt: serverTimestamp(),
    };
    if (newTrialEndsAt) {
      updates.trialEndsAt = newTrialEndsAt;
    }
    await updateDoc(tenantRef, updates);
  },

  async getTenantUsers(tenantId: string) {
    const usersRef = collection(db, 'tenants', tenantId, 'users');
    const snap = await getDocs(usersRef);
    return snap.docs.map(doc => doc.data());
  },

  async addUserToTenant(tenantId: string, email: string, role: UserRole, name?: string, phone?: string) {
    // Use a deterministic placeholder UID that can be linked later on sign-in.
    // The placeholder is prefixed with 'user_' and keyed by email hash.
    const hash = email.toLowerCase().replace(/[^a-z0-9]/g, '');
    const userId = `user_${hash}_${tenantId.slice(-8)}`;
    const userRef = doc(db, 'tenants', tenantId, 'users', userId);
    
    try {
      await setDoc(userRef, {
        uid: userId,
        tenantId,
        role,
        email,
        name: name || '',
        phone: phone || '',
        status: 'invited',
        addedAt: serverTimestamp(),
      });
      return userRef;
    } catch (error) {
      console.error('Error adding user to tenant:', error);
      handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/users/${userId}`);
      throw error;
    }
  },

  async updateUserInTenant(tenantId: string, userId: string, data: { role: UserRole; name?: string; phone?: string; email?: string }) {
    const userRef = doc(db, 'tenants', tenantId, 'users', userId);
    try {
      await updateDoc(userRef, {
        role: data.role,
        name: data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating user in tenant:', error);
      handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/users/${userId}`);
      throw error;
    }
  },

  async deleteUserFromTenant(tenantId: string, userId: string) {
    const userRef = doc(db, 'tenants', tenantId, 'users', userId);
    try {
      await deleteDoc(userRef);
    } catch (error) {
      console.error('Error deleting user from tenant:', error);
      handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/users/${userId}`);
      throw error;
    }
  }
};