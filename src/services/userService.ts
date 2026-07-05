import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
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
        // Check for pending invites
        // (Skipping for now for simplicity, assume new users create new tenants)
        
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
        
        // Migration: If user exists but has no tenantId, create one
        if (!existingData.tenantId) {
          const tenant = await tenantService.createTenant(user.uid, `${existingData.displayName || 'My'}'s Pharmacy`, existingData.email || undefined);
          await updateDoc(userRef, {
            tenantId: tenant.id,
            role: 'owner',
            lastLogin: serverTimestamp(),
          });
          return { ...existingData, tenantId: tenant.id, role: 'owner' };
        }

        await updateDoc(userRef, {
          lastLogin: serverTimestamp(),
        });
        return existingData;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
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
    }
  }
};
