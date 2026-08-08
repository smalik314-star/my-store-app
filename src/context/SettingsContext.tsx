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
  showDashboardCharts: true,
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
    const settingsRef = doc(db, 'settings', user.tenantId);
    const unsub = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as StoreSettings;
        setSettings(data);
      } else {
        // Initialize with defaults if not found for this new tenant.
        // Persist defaults immediately so they survive page refreshes.
        setSettings({ ...DEFAULT_SETTINGS });
        setDoc(settingsRef, {
          ...DEFAULT_SETTINGS,
          tenantId: user.tenantId,
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch((error) => {
          console.error('Failed to persist default settings:', error);
        });
      }
      setLoading(false);
    }, (error) => {
      console.error('Settings Error:', error);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.tenantId]);

  useEffect(() => {
    if (settings?.themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings?.themeMode]);

  useEffect(() => {
    // 1. Sync Document Title
    const storeName = settings?.storeName || 'PharmaFlow';
    document.title = `${storeName} - Pharmacy Management`;

    // 2. Sync Browser Favicon
    let faviconLink: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.rel = 'icon';
      document.head.appendChild(faviconLink);
    }
    
    if (settings?.logoURL) {
      faviconLink.href = settings.logoURL;
    } else {
      // Elegant teal-colored SVG Data URI representing PharmaFlow brand mark
      faviconLink.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230ea5e9' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='5' fill='%230f172a'/%3E%3Cpath d='M12 7v10M7 12h10' stroke='%230ea5e9' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E";
    }
  }, [settings?.storeName, settings?.logoURL]);

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
