import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { StoreSettings } from '../types';
import { useAuth } from './AuthContext';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';

interface SettingsContextType {
  settings: StoreSettings | null;
  loading: boolean;
  updateSettings: (newSettings: Partial<StoreSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'PharmaFlow',
  ownerName: 'Admin',
  phone: '+91 98765 43210',
  email: 'support@pharmaflow.com',
  address: '123 Healthcare Avenue, Mumbai, Maharashtra - 400001',
  gstNumber: '27AAAAA0000A1Z5',
  logoURL: '',
  invoiceFooterText: 'Thank you for choosing PharmaFlow Pharmacy',
  currency: '₹',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12h',
  taxMode: true,
  cgstRate: 9,
  sgstRate: 9,
  invoicePrefix: 'INV',
  themeMode: 'light',
  updatedAt: null,
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.tenantId) {
      setSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const path = `settings/${user.tenantId}`;
    const unsub = onSnapshot(doc(db, 'settings', user.tenantId), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as StoreSettings);
      } else {
        // Initialize with defaults if not found for this new tenant
        setSettings({ ...DEFAULT_SETTINGS });
      }
      setLoading(false);
    }, (error) => {
      console.error('Settings Error:', error);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.tenantId]);

  const updateSettings = async (newSettings: Partial<StoreSettings>) => {
    if (!user?.tenantId) throw new Error('Tenant not found');
    
    const path = `settings/${user.tenantId}`;
    try {
      const settingsRef = doc(db, 'settings', user.tenantId);
      await setDoc(settingsRef, {
        ...settings,
        ...newSettings,
        tenantId: user.tenantId,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
