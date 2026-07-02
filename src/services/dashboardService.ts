import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  Timestamp,
  where
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Product, Customer, Invoice } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';

export interface DashboardStats {
  totalProducts: number;
  totalCustomers: number;
  totalInvoices: number;
  todaySales: number;
  monthlyRevenue: number;
  lowStockItems: number;
  outOfStockItems: number;
  criticalStockItems: number;
  expiryAlerts: number;
}

export const dashboardService = {
  subscribeToStats(userId: string, callback: (stats: DashboardStats) => void, onError?: (error: any) => void) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let stats: DashboardStats = {
      totalProducts: 0,
      totalCustomers: 0,
      totalInvoices: 0,
      todaySales: 0,
      monthlyRevenue: 0,
      lowStockItems: 0,
      outOfStockItems: 0,
      criticalStockItems: 0,
      expiryAlerts: 0,
    };

    // Products Stats
    const unsubProducts = onSnapshot(
      query(collection(db, 'products'), where('userId', '==', userId)), 
      (snapshot) => {
        try {
          const products = snapshot.docs.map(doc => doc.data() as Product);
          stats.totalProducts = products.length;
          stats.lowStockItems = products.filter(p => p.stockQuantity <= p.minimumStock && p.stockQuantity > 0).length;
          stats.outOfStockItems = products.filter(p => p.stockQuantity === 0).length;
          stats.criticalStockItems = products.filter(p => p.stockQuantity > 0 && p.stockQuantity <= 2).length;
          
          const twoMonthsFromNow = new Date();
          twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
          
          stats.expiryAlerts = products.filter(p => {
            if (!p.expiryDate) return false;
            try {
              const expiry = typeof p.expiryDate.toDate === 'function' ? p.expiryDate.toDate() : new Date(p.expiryDate);
              return expiry <= twoMonthsFromNow && expiry >= now;
            } catch (e) {
              return false;
            }
          }).length;
          
          callback({ ...stats });
        } catch (error) {
          console.error('Stats Products Processing Error:', error);
          if (onError) onError(error);
        }
      },
      (error) => {
        console.error('Stats Products Error:', error);
        if (onError) onError(error);
      }
    );

    // Customers Stats
    const unsubCustomers = onSnapshot(
      query(collection(db, 'customers'), where('userId', '==', userId)), 
      (snapshot) => {
        stats.totalCustomers = snapshot.size;
        callback({ ...stats });
      },
      (error) => {
        console.error('Stats Customers Error:', error);
        if (onError) onError(error);
      }
    );

    // Invoices Stats
    const unsubInvoices = onSnapshot(
      query(collection(db, 'invoices'), where('userId', '==', userId)), 
      (snapshot) => {
        try {
          const invoices = snapshot.docs.map(doc => doc.data() as Invoice);
          stats.totalInvoices = invoices.length;
          
          stats.todaySales = invoices
            .filter(inv => {
              const date = typeof inv.createdAt?.toDate === 'function' ? inv.createdAt.toDate() : new Date(inv.createdAt);
              return date >= todayStart && inv.paymentStatus === 'paid';
            })
            .reduce((sum, inv) => sum + inv.grandTotal, 0);

          stats.monthlyRevenue = invoices
            .filter(inv => {
              const date = typeof inv.createdAt?.toDate === 'function' ? inv.createdAt.toDate() : new Date(inv.createdAt);
              return date >= monthStart && inv.paymentStatus === 'paid';
            })
            .reduce((sum, inv) => sum + inv.grandTotal, 0);

          callback({ ...stats });
        } catch (error) {
          console.error('Stats Invoices Processing Error:', error);
          if (onError) onError(error);
        }
      },
      (error) => {
        console.error('Stats Invoices Error:', error);
        if (onError) onError(error);
      }
    );

    return () => {
      unsubProducts();
      unsubCustomers();
      unsubInvoices();
    };
  },

  subscribeToRecentInvoices(userId: string, callback: (invoices: Invoice[]) => void, onError?: (error: any) => void) {
    // Note: This query requires a composite index on (userId, createdAt DESC).
    // We remove the orderBy to allow the app to function without the index, 
    // and perform sorting client-side for now.
    const q = query(
      collection(db, 'invoices'), 
      where('userId', '==', userId)
    );

    return onSnapshot(q, (snapshot) => {
      try {
        const invoices = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Invoice[];
        
        // Client-side sort: Recent first
        invoices.sort((a, b) => {
          const dateA = typeof a.createdAt?.toDate === 'function' ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = typeof b.createdAt?.toDate === 'function' ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        });

        // Limit to 10
        callback(invoices.slice(0, 10));
      } catch (err) {
        console.error('Recent Invoices Processing Error:', err);
        if (onError) onError(err);
      }
    }, (error) => {
      console.error('Recent Invoices Subscription Error:', error);
      if (onError) onError(error);
    });
  },

  subscribeToAlerts(userId: string, callback: (alerts: { lowStock: Product[], expiring: Product[] }) => void, onError?: (error: any) => void) {
    const now = new Date();
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

    return onSnapshot(
      query(collection(db, 'products'), where('userId', '==', userId)), 
      (snapshot) => {
        try {
          const products = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Product[];

          const lowStock = products.filter(p => p.stockQuantity <= p.minimumStock);
          const expiring = products.filter(p => {
            if (!p.expiryDate) return false;
            try {
              const expiry = typeof p.expiryDate.toDate === 'function' ? p.expiryDate.toDate() : new Date(p.expiryDate);
              return expiry <= twoMonthsFromNow && expiry >= now;
            } catch (e) {
              return false;
            }
          });

          callback({ lowStock, expiring });
        } catch (err) {
          console.error('Alerts Processing Error:', err);
          if (onError) onError(err);
        }
      }, 
      (error) => {
        console.error('Alerts Subscription Error:', error);
        if (onError) onError(error);
      }
    );
  }
};
