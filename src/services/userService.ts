import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { User as FirebaseUser } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import { tenantService } from './tenantService';
import { UserRole } from '../types';

export const userService = {
  async createUserIfNotExists(user: FirebaseUser) {
    const userRef = doc(db, 'users', user.uid);
    const path = `users/${user.uid}`;
    
    try {
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // Check for pending invites by email BEFORE creating a new tenant
        const invite = await tenantService.findInviteByEmail(user.email || '');
        
        if (invite) {
          // Link invited user to existing tenant
          const placeholderUid = invite.tenantId 
            ? await this.findPlaceholderUid(invite.tenantId, user.email || '')
            : null;
          
          if (placeholderUid) {
            await tenantService.linkInvitedUser(invite.tenantId, placeholderUid, user.uid, user.email || '');
          }

          const userData = {
            uid: user.uid,
            displayName: user.displayName || 'User',
            email: user.email,
            photoURL: user.photoURL || '',
            role: invite.role as UserRole || 'staff',
            tenantId: invite.tenantId,
            status: 'active',
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
          };
          await setDoc(userRef, userData);

          // Bump tenant user count
          await tenantService.updateUsage(invite.tenantId, 'usersCount', 1);

          return userData;
        }

        // No invite found — create a new tenant
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
      console.error('Error in createUserIfNotExists:', error);
      // Re-throw so AuthContext can handle gracefully
      handleFirestoreError(error, OperationType.WRITE, path);
      // Fallback: return minimal user data rather than leaving the caller hanging
      return {
        uid: user.uid,
        displayName: user.displayName || 'User',
        email: user.email,
        photoURL: user.photoURL || '',
        role: 'staff' as UserRole,
        tenantId: undefined,
      };
    }
  },

  // Helper: find the placeholder UID for an invited user in a tenant
  async findPlaceholderUid(tenantId: string, email: string): Promise<string | null> {
    try {
      const users = await tenantService.getTenantUsers(tenantId);
      const match = users.find(u => 
        u.email === email && 
        u.uid && typeof u.uid === 'string' && u.uid.startsWith('user_')
      );
      return match ? match.uid : null;
    } catch (error) {
      console.error('Error finding placeholder UID:', error);
      return null;
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
      return null;
    }
  }
};