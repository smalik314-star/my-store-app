import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from './AuthContext';
import { tenantService } from '../services/tenantService';
import type { BusinessMode, Tenant } from '../types';
import { isBusinessModeConfigured, resolveBusinessMode } from '../utils/businessMode';

interface BusinessModeContextValue {
  mode: BusinessMode;
  configured: boolean;
  loading: boolean;
  updateMode: (mode: BusinessMode) => Promise<void>;
}

const BusinessModeContext = createContext<BusinessModeContextValue | undefined>(undefined);

export function BusinessModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mode, setMode] = useState<BusinessMode>('retail');
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.tenantId) {
      setMode('retail');
      setConfigured(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    return onSnapshot(
      doc(db, 'tenants', user.tenantId),
      snapshot => {
        const tenant = snapshot.exists() ? snapshot.data() as Tenant : null;
        setMode(resolveBusinessMode(tenant));
        setConfigured(isBusinessModeConfigured(tenant));
        setLoading(false);
      },
      () => {
        setMode('retail');
        setConfigured(true);
        setLoading(false);
      }
    );
  }, [user?.tenantId]);

  const updateMode = async (nextMode: BusinessMode) => {
    if (!user?.tenantId) throw new Error('Store profile is not available.');
    await tenantService.updateBusinessMode(user.tenantId, nextMode);
  };

  return (
    <BusinessModeContext.Provider value={{ mode, configured, loading, updateMode }}>
      {children}
    </BusinessModeContext.Provider>
  );
}

export const useBusinessMode = () => {
  const context = useContext(BusinessModeContext);
  if (!context) throw new Error('useBusinessMode must be used within BusinessModeProvider');
  return context;
};
