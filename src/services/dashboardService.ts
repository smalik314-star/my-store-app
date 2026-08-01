import { 
  collection, 
  query, 
  onSnapshot,
  where,
  getCountFromServer
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Product, Invoice, Purchase, Supplier } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestore-errors';
import { productService } from './productService';

export interface DashboardStats {
  totalProducts: number;
  totalCustomers: number;
  totalInvoices: number;
  todaySales: number;
  todayGrossProfit: number;
  todayInvoiceCount: number;
  todayPurchases: number;
  monthlyRevenue: number;
  totalReceivable: number;
  totalPayable: number;
  stockValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  criticalStockItems: number;
  expiryAlerts: number;
  inventorySummaryReady: boolean;
}

export const dashboardService = {
  subscribeToStats(
    tenantId: string,
    callback: (stats: DashboardStats) => void,
    onError?: (error: any) => void,
    onInvoices?: (invoices: Invoice[]) => void
  ) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let stats: DashboardStats = {
      totalProducts: 0,
      totalCustomers: 0,
      totalInvoices: 0,
      todaySales: 0,
      todayGrossProfit: 0,
      todayInvoiceCount: 0,
      todayPurchases: 0,
      monthlyRevenue: 0,
      totalReceivable: 0,
      totalPayable: 0,
      stockValue: 0,
      lowStockItems: 0,
      outOfStockItems: 0,
      criticalStockItems: 0,
      expiryAlerts: 0,
      inventorySummaryReady: false,
    };

    const refreshInventoryStats = async () => {
      try {
        const twoMonthsFromNow = new Date();
        twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
        const [totalProductsCount, outOfStockCount, criticalCount, expiryCount] = await Promise.all([
          getCountFromServer(query(collection(db, 'products'), where('tenantId', '==', tenantId))),
          getCountFromServer(query(collection(db, 'products'), where('tenantId', '==', tenantId), where('stockQuantity', '==', 0))),
          getCountFromServer(query(collection(db, 'products'), where('tenantId', '==', tenantId), where('stockQuantity', '>', 0), where('stockQuantity', '<=', 2))),
          getCountFromServer(query(collection(db, 'products'), where('tenantId', '==', tenantId), where('expiryDate', '>=', now), where('expiryDate', '<=', twoMonthsFromNow))),
        ]);

        stats.totalProducts = Number(totalProductsCount.data().count) || 0;
        stats.outOfStockItems = Number(outOfStockCount.data().count) || 0;
        stats.criticalStockItems = Number(criticalCount.data().count) || 0;
        stats.expiryAlerts = Number(expiryCount.data().count) || 0;
        stats.lowStockItems = stats.criticalStockItems + stats.outOfStockItems;
        stats.stockValue = 0;
        stats.inventorySummaryReady = false;
        callback({ ...stats });
      } catch (error) {
        console.error('Stats Products Error:', error);
        onError?.(error);
      }
    };

    void refreshInventoryStats();
    const inventoryStatsInterval = window.setInterval(() => {
      void refreshInventoryStats();
    }, 60_000);

    // Customers Stats
    const unsubCustomers = onSnapshot(
      query(collection(db, 'customers'), where('tenantId', '==', tenantId)), 
      (snapshot) => {
        const customers = snapshot.docs
          .map(row => row.data() as { outstandingBalance?: number; recordStatus?: string })
          .filter(customer => customer.recordStatus !== 'inactive');
        stats.totalCustomers = customers.length;
        stats.totalReceivable = customers.reduce(
          (total, customer) => total + Math.max(0, Number(customer.outstandingBalance) || 0),
          0
        );
        callback({ ...stats });
      },
      (error) => {
        console.error('Stats Customers Error:', error);
        if (onError) onError(error);
      }
    );

    // Invoices Stats
    const unsubInvoices = onSnapshot(
      query(collection(db, 'invoices'), where('tenantId', '==', tenantId)), 
      (snapshot) => {
        try {
          const invoices = snapshot.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data()
            }) as Invoice)
            .filter(invoice => (invoice as Invoice & { status?: string }).status !== 'cancelled');

          invoices.sort((a, b) => {
            const dateA = typeof a.createdAt?.toDate === 'function' ? a.createdAt.toDate() : new Date(a.createdAt);
            const dateB = typeof b.createdAt?.toDate === 'function' ? b.createdAt.toDate() : new Date(b.createdAt);
            return dateB.getTime() - dateA.getTime();
          });

          onInvoices?.(invoices);
          stats.totalInvoices = invoices.length;
          
          stats.todaySales = invoices
            .filter(inv => {
              const date = typeof inv.createdAt?.toDate === 'function' ? inv.createdAt.toDate() : new Date(inv.createdAt);
              return date >= todayStart;
            })
            .reduce((sum, inv) => sum + inv.grandTotal, 0);
          const todayInvoices = invoices.filter(inv => {
            const date = typeof inv.createdAt?.toDate === 'function' ? inv.createdAt.toDate() : new Date(inv.createdAt);
            return date >= todayStart;
          });
          stats.todayInvoiceCount = todayInvoices.length;
          stats.todayGrossProfit = todayInvoices.reduce((invoiceTotal, invoice) => (
            invoiceTotal + invoice.items.reduce((lineTotal, item) => (
              lineTotal + ((Number(item.price) || 0) - (Number(item.purchaseCost) || 0)) * (Number(item.quantity) || 0)
            ), 0)
          ), 0);

          stats.monthlyRevenue = invoices
            .filter(inv => {
              const date = typeof inv.createdAt?.toDate === 'function' ? inv.createdAt.toDate() : new Date(inv.createdAt);
              return date >= monthStart;
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

    const unsubPurchases = onSnapshot(
      query(collection(db, 'purchases'), where('tenantId', '==', tenantId)),
      snapshot => {
        stats.todayPurchases = snapshot.docs
          .map(row => row.data() as Purchase)
          .filter(purchase => {
            if ((purchase as Purchase & { status?: string }).status === 'cancelled') return false;
            const date = typeof purchase.createdAt?.toDate === 'function'
              ? purchase.createdAt.toDate()
              : new Date(purchase.createdAt);
            return date >= todayStart;
          })
          .reduce((sum, purchase) => sum + (Number(purchase.totalAmount) || 0), 0);
        callback({ ...stats });
      },
      error => onError?.(error)
    );

    const unsubSuppliers = onSnapshot(
      query(collection(db, 'suppliers'), where('tenantId', '==', tenantId)),
      snapshot => {
        stats.totalPayable = snapshot.docs
          .map(row => row.data() as Supplier)
          .reduce((total, supplier) => total + Math.max(
            0,
            Number((supplier as Supplier & { payableBalance?: number }).payableBalance) || 0
          ), 0);
        callback({ ...stats });
      },
      error => onError?.(error)
    );

    return () => {
      window.clearInterval(inventoryStatsInterval);
      unsubCustomers();
      unsubInvoices();
      unsubPurchases();
      unsubSuppliers();
    };
  },

  subscribeToRecentInvoices(tenantId: string, callback: (invoices: Invoice[]) => void, onError?: (error: any) => void) {
    const q = query(
      collection(db, 'invoices'), 
      where('tenantId', '==', tenantId)
    );

    return onSnapshot(q, (snapshot) => {
      try {
        const invoices = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Invoice[];
        
        invoices.sort((a, b) => {
          const dateA = typeof a.createdAt?.toDate === 'function' ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = typeof b.createdAt?.toDate === 'function' ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        });

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

  subscribeToAlerts(tenantId: string, callback: (alerts: { lowStock: Product[], expiring: Product[], allProducts: Product[] }) => void, onError?: (error: any) => void) {
    const now = new Date();
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

    let cancelled = false;
    const refreshAlerts = async () => {
      try {
        const [lowStockResult, expiryResult] = await Promise.all([
          productService.getLowStockProductsPage(tenantId, 20, null),
          productService.getExpiryProductsPage(tenantId, 20, null),
        ]);
        if (cancelled) return;
        const expiring = (expiryResult?.products || []).filter(product => {
          if (!product.expiryDate) return false;
          const expiry = typeof product.expiryDate.toDate === 'function' ? product.expiryDate.toDate() : new Date(product.expiryDate);
          return expiry <= twoMonthsFromNow && expiry >= now;
        });
        callback({
          lowStock: (lowStockResult?.products || []),
          expiring,
          allProducts: [],
        });
      } catch (error) {
        console.error('Alerts Processing Error:', error);
        onError?.(error);
      }
    };

    void refreshAlerts();
    const alertsInterval = window.setInterval(() => {
      void refreshAlerts();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(alertsInterval);
    };
  }
};
