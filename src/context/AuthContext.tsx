import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth, isConfigValid } from '../firebase/config';
import { User, AuthContextType, UserRole } from '../types';
import { userService } from '../services/userService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncUserWithFirestore = useCallback(async (firebaseUser: FirebaseUser) => {
    try {
      const userData = await userService.createUserIfNotExists(firebaseUser);
      
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        role: (userData?.role as UserRole) || 'staff',
        tenantId: userData?.tenantId,
      });
      setSyncError(null);
    } catch (error: any) {
      console.error('Error syncing user with Firestore:', error);
      // Graceful degradation: keep the user signed in with minimal data
      // so they are not silently logged out on a transient backend issue.
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        role: 'staff',
        tenantId: undefined,
      });
      setSyncError(error?.message || 'Profile sync failed. Some features may be limited.');
    }
  }, []);

  useEffect(() => {
    if (!isConfigValid || !auth) {
      setUser(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await syncUserWithFirestore(firebaseUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [syncUserWithFirestore]);

  const login = async () => {
    if (!isConfigValid || !auth) {
      console.error('Firebase Auth configuration is not valid.');
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      // Using popup instead of redirect to avoid iframe third-party cookie/redirect URI issues
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      throw error;
    }
  };

  const logout = async () => {
    if (auth) {
      await signOut(auth);
    }
    // No manual redirect needed: AppRouter watches `user` and
    // automatically redirects to /login when it becomes null.
    setUser(null);
    setSyncError(null);
  };

  const retrySync = useCallback(async () => {
    if (!auth?.currentUser) return;
    setSyncError(null);
    await syncUserWithFirestore(auth.currentUser);
  }, [syncUserWithFirestore]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, syncError, retrySync }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};