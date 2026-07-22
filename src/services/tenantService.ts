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
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Tenant, SubscriptionPlan, UserRole } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';

export const tenantService = {
  async createTenant(ownerId: string, storeName: string, email?: string): Promise<Tenant> {
    // Firebase UID is stable for the same Google account in this project.
    // A deterministic tenant ID makes first-login onboarding retry-safe:
    // the same account can never be assigned a second workspace accidentally.
    const tenantId = `tenant_${ownerId}`;
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
    const invitationsSnap = await getDocs(query(
      collection(db, 'invitations'),
      where('tenantId', '==', tenantId),
      where('status', '==', 'pending')
    ));
    return [
      ...snap.docs.map(member => member.data()),
      ...invitationsSnap.docs.map(invite => ({ ...invite.data(), uid: invite.id, isInvitation: true }))
    ];
  },

  async addUserToTenant(tenantId: string, email: string, role: UserRole, name?: string, phone?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const existing = await getDocs(query(collection(db, 'invitations'), where('tenantId', '==', tenantId), where('email', '==', normalizedEmail), where('status', '==', 'pending')));
      if (!existing.empty) throw new Error('A pending invitation already exists for this email.');
      await addDoc(collection(db, 'invitations'), {
        tenantId,
        role,
        email: normalizedEmail,
        name: name || '',
        phone: phone || '',
        status: 'pending',
        createdBy: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error adding user to tenant:', error);
      handleFirestoreError(error, OperationType.WRITE, `invitations/${tenantId}`);
      throw error;
    }
  },

  async updateUserInTenant(tenantId: string, userId: string, data: { role: UserRole; name?: string; phone?: string; email?: string }) {
    const userRef = doc(db, 'tenants', tenantId, 'users', userId);
    try {
      const member = await getDoc(userRef);
      const targetRef = member.exists() ? userRef : doc(db, 'invitations', userId);
      if (member.exists()) {
        const batch = writeBatch(db);
        batch.update(targetRef, {
          role: data.role, name: data.name || '', phone: data.phone || '',
          email: data.email?.trim().toLowerCase() || '', updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'users', userId), { role: data.role });
        await batch.commit();
      } else {
        await updateDoc(targetRef, {
          role: data.role, name: data.name || '', phone: data.phone || '',
          email: data.email?.trim().toLowerCase() || '', updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error updating user in tenant:', error);
      handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/users/${userId}`);
      throw error;
    }
  },

  async deleteUserFromTenant(tenantId: string, userId: string) {
    const userRef = doc(db, 'tenants', tenantId, 'users', userId);
    try {
      const member = await getDoc(userRef);
      if (member.exists()) {
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', userId), { status: 'disabled' });
        batch.delete(userRef);
        await batch.commit();
      } else {
        await deleteDoc(doc(db, 'invitations', userId));
      }
    } catch (error) {
      console.error('Error deleting user from tenant:', error);
      handleFirestoreError(error, OperationType.WRITE, `tenants/${tenantId}/users/${userId}`);
      throw error;
    }
  }
};
