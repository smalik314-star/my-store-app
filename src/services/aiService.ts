import {
  collection,
  doc,
  endAt,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAt,
  sum,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { AIIntent, AIResponse } from '../types/ai';
import { toJsDate } from '../utils/date';
import { formatCurrency } from '../utils/currency';
import { sumInvoiceProfit } from '../utils/aiMetrics';

const COLLECTION_INVOICES = 'invoices';
const COLLECTION_PRODUCTS = 'products';
const COLLECTION_CUSTOMERS = 'customers';
const MAX_AI_PROFIT_INVOICES = 500;

const createResponseId = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2, 11);
const createResponse = (
  queryText: string,
  intent: AIIntent,
  answer: string,
  type: AIResponse['type'],
  data?: unknown,
  actions: AIResponse['actions'] = []
): AIResponse => ({
  id: createResponseId(),
  query: queryText,
  answer,
  intent,
  data,
  type,
  timestamp: new Date(),
  actions,
});

const postedInvoicesQuery = (tenantId: string) => query(
  collection(db, COLLECTION_INVOICES),
  where('tenantId', '==', tenantId),
  where('status', '==', 'posted')
);

const postedInvoicesSinceQuery = (tenantId: string, startDate: Date) => query(
  collection(db, COLLECTION_INVOICES),
  where('tenantId', '==', tenantId),
  where('status', '==', 'posted'),
  where('createdAt', '>=', Timestamp.fromDate(startDate)),
  orderBy('createdAt', 'desc')
);

const trimTime = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const aiService = {
  parseIntent(queryText: string): AIIntent {
    const q = queryText.toLowerCase();

    if (q.includes('today') && q.includes('revenue')) return 'REVENUE_TODAY';
    if (q.includes('monthly') && q.includes('revenue')) return 'REVENUE_MONTHLY';
    if (q.includes('total') && (q.includes('sales') || q.includes('revenue'))) return 'SALES_TOTAL';
    if (q.includes('low stock')) return 'LOW_STOCK';
    if (q.includes('out of stock')) return 'OUT_OF_STOCK';
    if (q.includes('expiry') || q.includes('expired')) return 'EXPIRY_ITEMS';
    if (q.includes('top customers')) return 'TOP_CUSTOMERS';
    if (q.includes('pending dues') || q.includes('highest dues')) return 'PENDING_DUES';
    if (q.includes('new customers')) return 'NEW_CUSTOMERS';
    if (q.includes('total profit')) return 'TOTAL_PROFIT';
    if (q.includes('profit') && q.includes('7 days')) return 'PROFIT_7DAYS';
    if (q.includes('high margin') || q.includes('highest margin')) return 'HIGH_MARGIN_PRODUCTS';

    return 'UNKNOWN';
  },

  async executeQuery(queryText: string): Promise<AIResponse> {
    const intent = this.parseIntent(queryText);
    const uid = auth.currentUser?.uid;

    if (!uid) {
      return this.createFallbackResponse(queryText, 'Please sign in to use the AI Assistant.');
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      const userData = userDoc.data();
      const tenantId = userData?.tenantId;
      if (!tenantId) {
        return this.createFallbackResponse(queryText, 'Tenant configuration not found for your account.');
      }

      switch (intent) {
        case 'REVENUE_TODAY':
          return await this.getTodayRevenue(tenantId, queryText);
        case 'REVENUE_MONTHLY':
          return await this.getMonthlyRevenue(tenantId, queryText);
        case 'LOW_STOCK':
          return await this.getLowStock(tenantId, queryText);
        case 'OUT_OF_STOCK':
          return await this.getOutOfStock(tenantId, queryText);
        case 'EXPIRY_ITEMS':
          return await this.getExpiryItems(tenantId, queryText);
        case 'PENDING_DUES':
          return await this.getPendingDues(tenantId, queryText);
        case 'TOP_CUSTOMERS':
          return await this.getTopCustomers(tenantId, queryText);
        case 'NEW_CUSTOMERS':
          return await this.getNewCustomers(tenantId, queryText);
        case 'TOTAL_PROFIT':
          return await this.getTotalProfit(tenantId, queryText);
        case 'PROFIT_7DAYS':
          return await this.getProfit7Days(tenantId, queryText);
        default:
          return this.createFallbackResponse(queryText);
      }
    } catch (error) {
      console.error('AI Query Error:', error);
      return this.createFallbackResponse(queryText, 'I encountered an error while fetching the data. Please try again.');
    }
  },

  createFallbackResponse(queryText: string, message?: string): AIResponse {
    return createResponse(
      queryText,
      'UNKNOWN',
      message || "I'm not sure I understand that query. Try asking about revenue, low stock, or pending dues.",
      'text',
      undefined,
      [
        { label: 'View Inventory', path: '/inventory' },
        { label: 'Check Reports', path: '/reports' },
      ]
    );
  },

  async getTodayRevenue(tenantId: string, queryText: string): Promise<AIResponse> {
    const startOfToday = trimTime(new Date());
    const revenueQuery = postedInvoicesSinceQuery(tenantId, startOfToday);
    const [aggregate, invoiceCount] = await Promise.all([
      getAggregateFromServer(revenueQuery, { totalRevenue: sum('grandTotal') }),
      getCountFromServer(revenueQuery),
    ]);
    const total = Number(aggregate.data().totalRevenue) || 0;
    const count = Number(invoiceCount.data().count) || 0;

    return createResponse(
      queryText,
      'REVENUE_TODAY',
      count === 0
        ? 'No posted invoices have been recorded today yet.'
        : `Today's posted revenue is ${formatCurrency(total)} across ${count} invoice${count === 1 ? '' : 's'}.`,
      'number',
      total,
      [{ label: "View Today's Invoices", path: '/invoices' }]
    );
  },

  async getMonthlyRevenue(tenantId: string, queryText: string): Promise<AIResponse> {
    const firstDayOfMonth = trimTime(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const revenueQuery = postedInvoicesSinceQuery(tenantId, firstDayOfMonth);
    const [aggregate, invoiceCount] = await Promise.all([
      getAggregateFromServer(revenueQuery, { totalRevenue: sum('grandTotal') }),
      getCountFromServer(revenueQuery),
    ]);
    const total = Number(aggregate.data().totalRevenue) || 0;
    const count = Number(invoiceCount.data().count) || 0;

    return createResponse(
      queryText,
      'REVENUE_MONTHLY',
      count === 0
        ? 'No posted invoices have been recorded this month yet.'
        : `This month's posted revenue is ${formatCurrency(total)} across ${count} invoice${count === 1 ? '' : 's'}.`,
      'number',
      total,
      [{ label: 'Detailed Reports', path: '/reports' }]
    );
  },

  async getLowStock(tenantId: string, queryText: string): Promise<AIResponse> {
    const snapshot = await getDocs(query(
      collection(db, COLLECTION_PRODUCTS),
      where('tenantId', '==', tenantId),
      where('stockQuantity', '>', 0),
      where('stockQuantity', '<=', 10),
      orderBy('stockQuantity', 'asc'),
      limit(25)
    ));
    const items = snapshot.docs
      .map(row => ({ id: row.id, ...row.data() }))
      .map(row => row as Record<string, any>)
      .filter(row => row.recordStatus !== 'inactive');

    return createResponse(
      queryText,
      'LOW_STOCK',
      items.length === 0
        ? 'No active products are currently below the 10-unit low-stock threshold.'
        : `Showing ${items.length} low-stock product${items.length === 1 ? '' : 's'} below 10 units.`,
      'list',
      items,
      [{ label: 'Manage Inventory', path: '/low-stock' }]
    );
  },

  async getOutOfStock(tenantId: string, queryText: string): Promise<AIResponse> {
    const snapshot = await getDocs(query(
      collection(db, COLLECTION_PRODUCTS),
      where('tenantId', '==', tenantId),
      where('stockQuantity', '==', 0),
      limit(25)
    ));
    const items = snapshot.docs
      .map(row => ({ id: row.id, ...row.data() }))
      .map(row => row as Record<string, any>)
      .filter(row => row.recordStatus !== 'inactive');

    return createResponse(
      queryText,
      'OUT_OF_STOCK',
      items.length === 0
        ? 'No active products are currently out of stock.'
        : `Showing ${items.length} out-of-stock product${items.length === 1 ? '' : 's'}.`,
      'list',
      items,
      [{ label: 'Restock Now', path: '/inventory' }]
    );
  },

  async getExpiryItems(tenantId: string, queryText: string): Promise<AIResponse> {
    const next30Days = new Date();
    next30Days.setDate(next30Days.getDate() + 30);

    const snapshot = await getDocs(query(
      collection(db, COLLECTION_PRODUCTS),
      where('tenantId', '==', tenantId),
      where('expiryDate', '<=', Timestamp.fromDate(next30Days)),
      orderBy('expiryDate', 'asc'),
      limit(25)
    ));
    const items = snapshot.docs
      .map(row => ({ id: row.id, ...row.data() }))
      .map(row => row as Record<string, any>)
      .filter(row => row.recordStatus !== 'inactive');

    return createResponse(
      queryText,
      'EXPIRY_ITEMS',
      items.length === 0
        ? 'No active products are due to expire within the next 30 days.'
        : `Showing ${items.length} active product${items.length === 1 ? '' : 's'} expiring within the next 30 days.`,
      'list',
      items,
      [{ label: 'View Expiry Alerts', path: '/expiry-alerts' }]
    );
  },

  async getPendingDues(tenantId: string, queryText: string): Promise<AIResponse> {
    const snapshot = await getDocs(query(
      collection(db, COLLECTION_CUSTOMERS),
      where('tenantId', '==', tenantId),
      where('outstandingBalance', '>', 0),
      orderBy('outstandingBalance', 'desc'),
      limit(5)
    ));
    const items = snapshot.docs.map(row => ({ id: row.id, ...row.data() }));

    return createResponse(
      queryText,
      'PENDING_DUES',
      items.length === 0
        ? 'No customers currently have pending dues.'
        : `Here are the ${items.length} customers with the highest pending dues.`,
      'list',
      items,
      [{ label: 'View All Customers', path: '/customers' }]
    );
  },

  async getTopCustomers(tenantId: string, queryText: string): Promise<AIResponse> {
    const snapshot = await getDocs(query(
      collection(db, COLLECTION_CUSTOMERS),
      where('tenantId', '==', tenantId),
      orderBy('totalPurchases', 'desc'),
      limit(5)
    ));
    const items = snapshot.docs.map(row => ({ id: row.id, ...row.data() }));

    return createResponse(
      queryText,
      'TOP_CUSTOMERS',
      items.length === 0
        ? 'No customer purchase history is available yet.'
        : 'Here are your top customers by recorded lifetime purchases.',
      'list',
      items,
      [{ label: 'All Customers', path: '/customers' }]
    );
  },

  async getNewCustomers(tenantId: string, queryText: string): Promise<AIResponse> {
    const firstDayOfMonth = trimTime(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const snapshot = await getDocs(query(
      collection(db, COLLECTION_CUSTOMERS),
      where('tenantId', '==', tenantId),
      where('createdAt', '>=', Timestamp.fromDate(firstDayOfMonth)),
      orderBy('createdAt', 'desc'),
      limit(10)
    ));
    const items = snapshot.docs.map(row => ({ id: row.id, ...row.data() }));

    return createResponse(
      queryText,
      'NEW_CUSTOMERS',
      items.length === 0
        ? 'No new customers have been added this month yet.'
        : `Showing ${items.length} customer${items.length === 1 ? '' : 's'} added this month.`,
      'list',
      items,
      [{ label: 'All Customers', path: '/customers' }]
    );
  },

  async getTotalProfit(tenantId: string, queryText: string): Promise<AIResponse> {
    const baseQuery = postedInvoicesQuery(tenantId);
    const totalCount = Number((await getCountFromServer(baseQuery)).data().count) || 0;

    if (totalCount === 0) {
      return createResponse(
        queryText,
        'TOTAL_PROFIT',
        'No posted invoices are available yet, so there is no recorded profit to calculate.',
        'number',
        0,
        [{ label: 'Financial Reports', path: '/reports' }]
      );
    }

    if (totalCount > MAX_AI_PROFIT_INVOICES) {
      return createResponse(
        queryText,
        'TOTAL_PROFIT',
        `All-time profit is not shown here because it would require scanning ${totalCount} posted invoices. Use Reports with a date range for an exact result.`,
        'text',
        { invoiceCount: totalCount },
        [{ label: 'Financial Reports', path: '/reports' }]
      );
    }

    const snapshot = await getDocs(query(baseQuery, orderBy('createdAt', 'desc'), limit(MAX_AI_PROFIT_INVOICES)));
    const invoices = snapshot.docs.map(row => ({ id: row.id, ...row.data() })) as Array<Record<string, any>>;
    const totalProfit = sumInvoiceProfit(invoices);

    return createResponse(
      queryText,
      'TOTAL_PROFIT',
      `Recorded profit across ${totalCount} posted invoice${totalCount === 1 ? '' : 's'} is ${formatCurrency(totalProfit)}.`,
      'number',
      totalProfit,
      [{ label: 'Financial Reports', path: '/reports' }]
    );
  },

  async getProfit7Days(tenantId: string, queryText: string): Promise<AIResponse> {
    const last7Days = trimTime(new Date());
    last7Days.setDate(last7Days.getDate() - 6);
    const profitQuery = postedInvoicesSinceQuery(tenantId, last7Days);
    const invoiceCount = Number((await getCountFromServer(profitQuery)).data().count) || 0;

    if (invoiceCount === 0) {
      return createResponse(
        queryText,
        'PROFIT_7DAYS',
        'No posted invoices were recorded in the last 7 days.',
        'number',
        0,
        [{ label: 'View Sales Report', path: '/reports' }]
      );
    }

    if (invoiceCount > MAX_AI_PROFIT_INVOICES) {
      return createResponse(
        queryText,
        'PROFIT_7DAYS',
        `The last 7 days contain ${invoiceCount} posted invoices, so inline profit is deferred to Reports to avoid scanning too much data here.`,
        'text',
        { invoiceCount },
        [{ label: 'View Sales Report', path: '/reports' }]
      );
    }

    const snapshot = await getDocs(query(profitQuery, limit(MAX_AI_PROFIT_INVOICES)));
    const invoices = snapshot.docs.map(row => ({ id: row.id, ...row.data() })) as Array<Record<string, any>>;
    const totalProfit = sumInvoiceProfit(invoices);

    return createResponse(
      queryText,
      'PROFIT_7DAYS',
      `Recorded profit over the last 7 days is ${formatCurrency(totalProfit)}.`,
      'number',
      totalProfit,
      [{ label: 'View Sales Report', path: '/reports' }]
    );
  },
};
