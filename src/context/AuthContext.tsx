import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult
} from 'firebase/auth';
import { auth, isConfigValid } from '../firebase/config';
import { User, AuthContextType } from '../types';
import { userService } from '../services/userService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In Module 1 foundation, we simulate a logged-in state if a flag is set
    // to allow viewing the dashboard and layout.
    const simulationMode = localStorage.getItem('pharmaflow_simulated_auth') === 'true';

    if (!isConfigValid || !auth) {
      if (simulationMode) {
        setUser({
          uid: 'simulated-user',
          email: 'admin@pharmaflow.com',
          displayName: 'Admin User',
          photoURL: null,
          role: 'admin',
        });
      } else {
        setUser(null);
      }
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Sync with Firestore and get role
          const userData = await userService.createUserIfNotExists(firebaseUser);
          
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            role: (userData?.role as 'admin' | 'staff' | 'owner') || 'staff',
          });
        } catch (error) {
          console.error('Error syncing user with Firestore:', error);
          // Fallback for simulation/testing if Firestore isn't fully seeded yet
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || 'Test User',
            photoURL: firebaseUser.photoURL,
            role: 'owner',
          });
        }
      } else if (simulationMode) {
        setUser({
          uid: 'simulated-user',
          email: 'admin@pharmaflow.com',
          displayName: 'Admin User',
          photoURL: null,
          role: 'admin',
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // Handle redirect result
    if (auth) {
      getRedirectResult(auth).catch((error) => {
        console.error('Redirect Sign-In Error:', error);
      });
    }

    return () => unsubscribe();
  }, []);

  const login = async () => {
    if (!isConfigValid || !auth) {
      // Simulated login for Module 1 fallback
      localStorage.setItem('pharmaflow_simulated_auth', 'true');
      window.location.href = '/dashboard';
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      // Using redirect instead of popup for better iframe compatibility
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      throw error;
    }
  };

  const logout = async () => {
    localStorage.removeItem('pharmaflow_simulated_auth');
    if (auth) {
      await signOut(auth);
    }
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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
