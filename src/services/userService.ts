import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { User as FirebaseUser } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';

export const userService = {
  async createUserIfNotExists(user: FirebaseUser) {
    const userRef = doc(db, 'users', user.uid);
    const path = `users/${user.uid}`;
    
    try {
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const userData = {
          uid: user.uid,
          displayName: user.displayName || 'User',
          email: user.email,
          photoURL: user.photoURL || '',
          role: 'owner',
          status: 'active',
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        };
        await setDoc(userRef, userData);
        return { role: 'owner' };
      } else {
        await updateDoc(userRef, {
          lastLogin: serverTimestamp(),
        });
        return userSnap.data();
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
