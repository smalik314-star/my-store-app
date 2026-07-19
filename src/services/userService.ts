import { collection, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { User as FirebaseUser } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import { tenantService } from './tenantService';

export const userService = {
  async createUserIfNotExists(user: FirebaseUser) {
    const userRef = doc(db, 'users', user.uid);
    const path = `users/${user.uid}`;
    
    try {
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const normalizedEmail = user.email?.trim().toLowerCase();
        if (normalizedEmail) {
          const inviteQuery = query(
            collection(db, 'invitations'),
            where('email', '==', normalizedEmail),
            where('status', '==', 'pending'),
            limit(1)
          );
          const inviteSnap = await getDocs(inviteQuery);
          if (!inviteSnap.empty) {
            const inviteDoc = inviteSnap.docs[0];
            const invite = inviteDoc.data();
            const userData = {
              uid: user.uid,
              displayName: user.displayName || invite.name || 'User',
              email: normalizedEmail,
              photoURL: user.photoURL || '',
              role: invite.role,
              tenantId: invite.tenantId,
              status: 'active',
              invitationId: inviteDoc.id,
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp(),
            };
            await runTransaction(db, async transaction => {
              const freshInvite = await transaction.get(inviteDoc.ref);
              if (!freshInvite.exists() || freshInvite.data().status !== 'pending') throw new Error('Invitation is no longer available.');
              transaction.set(userRef, userData);
              transaction.set(doc(db, 'tenants', invite.tenantId, 'users', user.uid), {
                uid: user.uid, tenantId: invite.tenantId, role: invite.role,
                email: normalizedEmail, name: invite.name || user.displayName || '',
                phone: invite.phone || '', status: 'active', invitationId: inviteDoc.id,
                addedAt: serverTimestamp(),
              });
              transaction.update(inviteDoc.ref, { status: 'accepted', acceptedBy: user.uid, acceptedAt: serverTimestamp() });
            });
            return userData;
          }
        }
        
        const tenant = await tenantService.createTenant(user.uid, `${user.displayName || 'My'}'s Pharmacy`, user.email || undefined);

        const userData = {
          uid: user.uid,
          displayName: user.displayName || 'User',
          email: user.email,
          photoURL: user.photoURL || '',
          role: 'owner',
          tenantId: tenant.id,
          status: 'active',
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        };
        await setDoc(userRef, userData);
        return userData;
      } else {
        const existingData = userSnap.data();
        if (existingData.status !== 'active') {
          await auth.signOut();
          throw new Error('This account has been disabled by the workspace owner.');
        }
        
        // Migration: If user exists but has no tenantId, create one
        if (!existingData.tenantId) {
          throw new Error('This legacy user needs an administrator-managed tenant migration.');
        }

        await updateDoc(userRef, {
          lastLogin: serverTimestamp(),
        });
        return existingData;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  },

  async getUserById(uid: string) {
    const userRef = doc(db, 'users', uid);
    const path = `users/${uid}`;
    try {
      const userSnap = await getDoc(userRef);
      return userSnap.exists() ? userSnap.data() : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      throw error;
    }
  }
};
