import { 
  collection, 
  getAggregateFromServer,
  getDocs,
  limit,
  orderBy,
  query, 
  sum,
  Timestamp,
  where,
  getCountFromServer
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Product, Invoice, Purchase } from '../types';
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

    const refreshStats = async () => {
      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const twoMonthsFromNow = new Date();
        twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
        const [totalProductsCount, outOfStockCount, criticalCount, expiryCount, totalCustomersCount, totalReceivableAgg, totalInvoicesCount, cancelledInvoicesCount, supplierPayableAgg, todayInvoicesSnapshot, sixMonthInvoicesSnapshot, todayPurchasesSnapshot] = await Promise.all([
          getCountFromServer(query(collection(db, 'products'), where('tenantId', '==', tenantId))),
          getCountFromServer(query(collection(db, 'products'), where('tenantId', '==', tenantId), where('stockQuantity', '==', 0))),
          getCountFromServer(query(collection(db, 'products'), where('tenantId', '==', tenantId), where('stockQuantity', '>', 0), where('stockQuantity', '<=', 2))),
          getCountFromServer(query(collection(db, 'products'), where('tenantId', '==', tenantId), where('expiryDate', '>=', now), where('expiryDate', '<=', twoMonthsFromNow))),
          getCountFromServer(query(collection(db, 'customers'), where('tenantId', '==', tenantId))),
          getAggregateFromServer(
            query(collection(db, 'customers'), where('tenantId', '==', tenantId)),
            { totalReceivable: sum('outstandingBalance') }
          ),
          getCountFromServer(query(collection(db, 'invoices'), where('tenantId', '==', tenantId))),
          getCountFromServer(query(collection(db, 'invoices'), where('tenantId', '==', tenantId), where('status', '==', 'cancelled'))),
          getAggregateFromServer(
            query(collection(db, 'suppliers'), where('tenantId', '==', tenantId)),
            { totalPayable: sum('payableBalance') }
          ),
          getDocs(query(
            collection(db, 'invoices'),
            where('tenantId', '==', tenantId),
            where('createdAt', '>=', Timestamp.fromDate(todayStart)),
            orderBy('createdAt', 'desc')
          )),
          getDocs(query(
            collection(db, 'invoices'),
            where('tenantId', '==', tenantId),
            where('createdAt', '>=', Timestamp.fromDate(sixMonthsStart)),
            orderBy('createdAt', 'desc')
          )),
          getDocs(query(
            collection(db, 'purchases'),
            where('tenantId', '==', tenantId),
            where('createdAt', '>=', Timestamp.fromDate(todayStart)),
            orderBy('createdAt', 'desc')
          )),
        ]);

        stats.totalProducts = Number(totalProductsCount.data().count) || 0;
        stats.outOfStockItems = Number(outOfStockCount.data().count) || 0;
        stats.criticalStockItems = Number(criticalCount.data().count) || 0;
        stats.expiryAlerts = Number(expiryCount.data().count) || 0;
        stats.lowStockItems = stats.criticalStockItems + stats.outOfStockItems;
        stats.totalCustomers = Number(totalCustomersCount.data().count) || 0;
        stats.totalReceivable = Math.max(0, Number(totalReceivableAgg.data().totalReceivable) || 0);
        stats.totalPayable = Math.max(0, Number(supplierPayableAgg.data().totalPayable) || 0);
        stats.totalInvoices = Math.max(
          0,
          (Number(totalInvoicesCount.data().count) || 0) - (Number(cancelledInvoicesCount.data().count) || 0)
        );
        stats.stockValue = 0;
        stats.inventorySummaryReady = false;
        const todayInvoices = todayInvoicesSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Invoice))
          .filter(invoice => invoice.status !== 'cancelled');
        const sixMonthInvoices = sixMonthInvoicesSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Invoice))
          .filter(invoice => invoice.status !== 'cancelled');
        const todayPurchases = todayPurchasesSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Purchase))
          .filter(purchase => purchase.status !== 'cancelled');

        onInvoices?.(sixMonthInvoices);
        stats.todaySales = todayInvoices.reduce((sum, invoice) => sum + (Number(invoice.grandTotal) || 0), 0);
        stats.todayInvoiceCount = todayInvoices.length;
        stats.todayGrossProfit = todayInvoices.reduce((invoiceTotal, invoice) => (
          invoiceTotal + invoice.items.reduce((lineTotal, item) => (
            lineTotal + ((Number(item.price) || 0) - (Number(item.purchaseCost) || 0)) * (Number(item.quantity) || 0)
          ), 0)
        ), 0);
        stats.monthlyRevenue = sixMonthInvoices
          .filter(invoice => {
            const createdAt = typeof invoice.createdAt?.toDate === 'function'
              ? invoice.createdAt.toDate()
              : new Date(invoice.createdAt);
            return createdAt >= monthStart;
          })
          .reduce((sum, invoice) => sum + (Number(invoice.grandTotal) || 0), 0);
        stats.todayPurchases = todayPurchases.reduce(
          (sum, purchase) => sum + (Number(purchase.totalAmount) || 0),
          0
        );
        callback({ ...stats });
      } catch (error) {
        console.error('Stats Refresh Error:', error);
        onError?.(error);
      }
    };

    void refreshStats();
    const statsInterval = window.setInterval(() => {
      void refreshStats();
    }, 60_000);

    return () => {
      window.clearInterval(statsInterval);
    };
  },

  subscribeToRecentInvoices(tenantId: string, callback: (invoices: Invoice[]) => void, onError?: (error: any) => void) {
    const q = query(
      collection(db, 'invoices'),
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    let cancelled = false;
    void getDocs(q)
      .then(snapshot => {
        if (cancelled) return;
        const invoices = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Invoice[];
        callback(invoices);
      })
      .catch(error => {
        console.error('Recent Invoices Query Error:', error);
        onError?.(error);
      });

    return () => {
      cancelled = true;
    };
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
