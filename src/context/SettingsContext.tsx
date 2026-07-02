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
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const path = `settings/${user.uid}`;
    const unsub = onSnapshot(doc(db, 'settings', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as StoreSettings);
      } else {
        // Initialize with defaults if not found for this new user
        setSettings({ ...DEFAULT_SETTINGS, userId: user.uid });
      }
      setLoading(false);
    }, (error) => {
      console.error('Settings Error:', error);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const updateSettings = async (newSettings: Partial<StoreSettings>) => {
    if (!user) throw new Error('User not authenticated');
    
    const path = `settings/${user.uid}`;
    try {
      const settingsRef = doc(db, 'settings', user.uid);
      await setDoc(settingsRef, {
        ...settings,
        ...newSettings,
        userId: user.uid,
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
