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
  writeBatch,
  runTransaction,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { BusinessMode, SubscriptionRequest, Tenant, SubscriptionPlan, UserRole } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import {
  type BillingPeriod,
  getEffectiveLimits,
  SUBSCRIPTION_PLANS,
} from '../config/subscription';

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
      businessMode: 'retail',
      businessModeConfigured: false,
      plan: 'free',
      status: 'active',
      subscriptionStatus: 'free',
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

  async getMonthlyInvoiceUsage(tenantId: string): Promise<number> {
    const month = new Date().toISOString().slice(0, 7);
    const usageRef = doc(db, 'tenants', tenantId, 'usageCounters', month);
    const snap = await getDoc(usageRef);
    if (!snap.exists() || snap.data().tenantId !== tenantId) return 0;
    return Math.max(0, Number(snap.data().invoicesCount) || 0);
  },

  async updateBusinessMode(tenantId: string, businessMode: BusinessMode) {
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('You must be signed in.');
    if (!['retail', 'wholesale', 'hybrid'].includes(businessMode)) {
      throw new Error('Select a valid business mode.');
    }
    const tenant = await this.getTenant(tenantId);
    if (!tenant || tenant.ownerId !== actorId) {
      throw new Error('Only the workspace owner can change the business mode.');
    }
    await updateDoc(doc(db, 'tenants', tenantId), {
      businessMode,
      businessModeConfigured: true,
      updatedAt: serverTimestamp(),
    });
  },

  async updateUsage(tenantId: string, field: 'invoicesCount' | 'productsCount' | 'usersCount', delta: number) {
    const tenantRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantRef, {
      [`usage.${field}`]: increment(delta),
      updatedAt: serverTimestamp(),
    });
  },

  async startProTrial(tenantId: string) {
    const tenantRef = doc(db, 'tenants', tenantId);
    const now = new Date();
    const trialEnds = new Date();
    trialEnds.setDate(now.getDate() + 30);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(tenantRef);
      if (!snapshot.exists()) throw new Error('Store profile not found.');
      const tenant = snapshot.data() as Tenant;
      if (tenant.ownerId !== auth.currentUser?.uid) {
        throw new Error('Only the workspace owner can start a trial.');
      }
      if (tenant.trialStartedAt) {
        throw new Error('The free trial has already been used for this workspace.');
      }
      if (tenant.plan !== 'free') {
        throw new Error('A trial is only available from the Free plan.');
      }
      transaction.update(tenantRef, {
        plan: 'pro',
        limits: SUBSCRIPTION_PLANS.pro.limits,
        subscriptionStatus: 'trialing',
        trialStartedAt: serverTimestamp(),
        trialEndsAt: Timestamp.fromDate(trialEnds),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async requestPlanUpgrade(
    tenantId: string,
    requestedPlan: Exclude<SubscriptionPlan, 'free'>,
    billingPeriod: BillingPeriod
  ) {
    const actorId = auth.currentUser?.uid;
    if (!actorId) throw new Error('You must be signed in.');
    const tenant = await this.getTenant(tenantId);
    if (!tenant || tenant.ownerId !== actorId) {
      throw new Error('Only the workspace owner can request a plan change.');
    }
    const plan = SUBSCRIPTION_PLANS[requestedPlan];
    const amount = billingPeriod === 'monthly' ? plan.priceMonthly : plan.priceAnnually;
    return addDoc(collection(db, 'subscriptionRequests'), {
      tenantId,
      requestedPlan,
      billingPeriod,
      amount,
      currency: 'INR',
      status: 'pending',
      createdBy: actorId,
      createdAt: serverTimestamp(),
    });
  },

  async getSubscriptionRequests(tenantId: string): Promise<SubscriptionRequest[]> {
    const snapshot = await getDocs(query(
      collection(db, 'subscriptionRequests'),
      where('tenantId', '==', tenantId)
    ));
    return snapshot.docs.map(item => ({
      id: item.id,
      ...item.data(),
    } as SubscriptionRequest));
  },

  async switchToFreePlan(tenantId: string) {
    const tenantRef = doc(db, 'tenants', tenantId);
    const snapshot = await getDoc(tenantRef);
    if (!snapshot.exists() || snapshot.data().ownerId !== auth.currentUser?.uid) {
      throw new Error('Only the workspace owner can change the plan.');
    }
    await updateDoc(tenantRef, {
      plan: 'free',
      limits: SUBSCRIPTION_PLANS.free.limits,
      subscriptionStatus: 'cancelled',
      updatedAt: serverTimestamp(),
    });
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
      const tenant = await this.getTenant(tenantId);
      if (!tenant) throw new Error('Store profile not found.');
      const members = await this.getTenantUsers(tenantId);
      if (members.length >= getEffectiveLimits(tenant).maxUsers) {
        throw new Error('User limit reached. Upgrade the plan before inviting another team member.');
      }
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
