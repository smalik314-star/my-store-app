import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  Timestamp,
  startAt,
  endAt,
  doc,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { AIIntent, AIResponse, AIAction } from '../types/ai';

const COLLECTION_INVOICES = 'invoices';
const COLLECTION_PRODUCTS = 'products';
const COLLECTION_CUSTOMERS = 'customers';

export const aiService = {
  parseIntent(queryText: string): AIIntent {
    const q = queryText.toLowerCase();

    // Revenue Intents
    if (q.includes('today') && q.includes('revenue')) return 'REVENUE_TODAY';
    if (q.includes('monthly') && q.includes('revenue')) return 'REVENUE_MONTHLY';
    if (q.includes('total') && (q.includes('sales') || q.includes('revenue'))) return 'SALES_TOTAL';

    // Inventory Intents
    if (q.includes('low stock')) return 'LOW_STOCK';
    if (q.includes('out of stock')) return 'OUT_OF_STOCK';
    if (q.includes('expiry') || q.includes('expired')) return 'EXPIRY_ITEMS';

    // Customer Intents
    if (q.includes('top customers')) return 'TOP_CUSTOMERS';
    if (q.includes('pending dues') || q.includes('highest dues')) return 'PENDING_DUES';
    if (q.includes('new customers')) return 'NEW_CUSTOMERS';

    // Profit Intents
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

  createFallbackResponse(query: string, message?: string): AIResponse {
    return {
      id: Math.random().toString(36).substr(2, 9),
      query,
      answer: message || "I'm not sure I understand that query. Try asking about revenue, low stock, or pending dues.",
      intent: 'UNKNOWN',
      type: 'text',
      timestamp: new Date(),
      actions: [
        { label: 'View Inventory', path: '/inventory' },
        { label: 'Check Reports', path: '/reports' }
      ]
    };
  },

  // Revenue Queries
  async getTodayRevenue(tenantId: string, queryText: string): Promise<AIResponse> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const q = query(
      collection(db, COLLECTION_INVOICES),
      where('tenantId', '==', tenantId),
      where('createdAt', '>=', Timestamp.fromDate(startOfToday))
    );
    
    const snapshot = await getDocs(q);
    let total = 0;
    snapshot.forEach(doc => total += doc.data().grandTotal || 0);

    return {
      id: Math.random().toString(36).substr(2, 9),
      query: queryText,
      answer: `Today's total revenue is ₹${total.toLocaleString('en-IN')}.`,
      intent: 'REVENUE_TODAY',
      data: total,
      type: 'number',
      timestamp: new Date(),
      actions: [{ label: 'View Today\'s Invoices', path: '/invoices' }]
    };
  },

  async getMonthlyRevenue(tenantId: string, queryText: string): Promise<AIResponse> {
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);
    
    const q = query(
      collection(db, COLLECTION_INVOICES),
      where('tenantId', '==', tenantId),
      where('createdAt', '>=', Timestamp.fromDate(firstDayOfMonth))
    );
    
    const snapshot = await getDocs(q);
    let total = 0;
    snapshot.forEach(doc => total += doc.data().grandTotal || 0);

    return {
      id: Math.random().toString(36).substr(2, 9),
      query: queryText,
      answer: `Your total revenue for this month is ₹${total.toLocaleString('en-IN')}.`,
      intent: 'REVENUE_MONTHLY',
      data: total,
      type: 'number',
      timestamp: new Date(),
      actions: [{ label: 'Detailed Reports', path: '/reports' }]
    };
  },

  // Inventory Queries
  async getLowStock(tenantId: string, queryText: string): Promise<AIResponse> {
    const q = query(
      collection(db, COLLECTION_PRODUCTS),
      where('tenantId', '==', tenantId),
      where('stockQuantity', '<=', 10),
      where('stockQuantity', '>', 0)
    );
    
    const snapshot = await getDocs(q);
    const items: any[] = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

    return {
      id: Math.random().toString(36).substr(2, 9),
      query: queryText,
      answer: `Found ${items.length} items with low stock (below 10 units).`,
      intent: 'LOW_STOCK',
      data: items,
      type: 'list',
      timestamp: new Date(),
      actions: [{ label: 'Manage Inventory', path: '/low-stock' }]
    };
  },

  async getOutOfStock(tenantId: string, queryText: string): Promise<AIResponse> {
    const q = query(
      collection(db, COLLECTION_PRODUCTS),
      where('tenantId', '==', tenantId),
      where('stockQuantity', '==', 0)
    );
    
    const snapshot = await getDocs(q);
    const items: any[] = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

    return {
      id: Math.random().toString(36).substr(2, 9),
      query: queryText,
      answer: `There are ${items.length} products currently out of stock.`,
      intent: 'OUT_OF_STOCK',
      data: items,
      type: 'list',
      timestamp: new Date(),
      actions: [{ label: 'Restock Now', path: '/inventory' }]
    };
  },

  async getExpiryItems(tenantId: string, queryText: string): Promise<AIResponse> {
    const next30Days = new Date();
    next30Days.setDate(next30Days.getDate() + 30);
    
    const q = query(
      collection(db, COLLECTION_PRODUCTS),
      where('tenantId', '==', tenantId),
      where('expiryDate', '<=', Timestamp.fromDate(next30Days))
    );
    
    const snapshot = await getDocs(q);
    const items: any[] = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

    return {
      id: Math.random().toString(36).substr(2, 9),
      query: queryText,
      answer: `Found ${items.length} products expiring within the next 30 days.`,
      intent: 'EXPIRY_ITEMS',
      data: items,
      type: 'list',
      timestamp: new Date(),
      actions: [{ label: 'View Expiry Alerts', path: '/expiry-alerts' }]
    };
  },

  // Customer Queries
  async getPendingDues(tenantId: string, queryText: string): Promise<AIResponse> {
    const q = query(
      collection(db, COLLECTION_CUSTOMERS),
      where('tenantId', '==', tenantId),
      where('outstandingBalance', '>', 0),
      orderBy('outstandingBalance', 'desc'),
      limit(5)
    );
    
    const snapshot = await getDocs(q);
    const items: any[] = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

    return {
      id: Math.random().toString(36).substr(2, 9),
      query: queryText,
      answer: `Found ${items.length} customers with pending dues. Here are the top ones.`,
      intent: 'PENDING_DUES',
      data: items,
      type: 'list',
      timestamp: new Date(),
      actions: [{ label: 'View All Customers', path: '/customers' }]
    };
  },

  async getTopCustomers(tenantId: string, queryText: string): Promise<AIResponse> {
    const q = query(
      collection(db, COLLECTION_CUSTOMERS),
      where('tenantId', '==', tenantId),
      orderBy('totalPurchases', 'desc'),
      limit(5)
    );
    
    const snapshot = await getDocs(q);
    const items: any[] = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

    return {
      id: Math.random().toString(36).substr(2, 9),
      query: queryText,
      answer: `Here are your top 5 customers by lifetime purchases.`,
      intent: 'TOP_CUSTOMERS',
      data: items,
      type: 'list',
      timestamp: new Date(),
      actions: [{ label: 'All Customers', path: '/customers' }]
    };
  },

  // Profit Queries
  async getTotalProfit(tenantId: string, queryText: string): Promise<AIResponse> {
    // This requires calculating from invoices/products
    // For simplicity, we'll fetch invoices and sum grandTotal - estimatedCost
    const q = query(
      collection(db, COLLECTION_INVOICES),
      where('tenantId', '==', tenantId)
    );
    
    const snapshot = await getDocs(q);
    let totalRevenue = 0;
    // In a real app, you'd store profit per invoice. 
    // Assuming for now we calculate a rough 20% margin if not explicitly stored
    snapshot.forEach(doc => totalRevenue += doc.data().grandTotal || 0);
    const estimatedProfit = totalRevenue * 0.2; 

    return {
      id: Math.random().toString(36).substr(2, 9),
      query: queryText,
      answer: `Your total estimated profit is ₹${estimatedProfit.toLocaleString('en-IN')} (based on 20% average margin).`,
      intent: 'TOTAL_PROFIT',
      data: estimatedProfit,
      type: 'number',
      timestamp: new Date(),
      actions: [{ label: 'Financial Reports', path: '/reports' }]
    };
  },

  async getProfit7Days(tenantId: string, queryText: string): Promise<AIResponse> {
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    
    const q = query(
      collection(db, COLLECTION_INVOICES),
      where('tenantId', '==', tenantId),
      where('createdAt', '>=', Timestamp.fromDate(last7Days))
    );
    
    const snapshot = await getDocs(q);
    let totalRevenue = 0;
    snapshot.forEach(doc => totalRevenue += doc.data().grandTotal || 0);
    const estimatedProfit = totalRevenue * 0.2;

    return {
      id: Math.random().toString(36).substr(2, 9),
      query: queryText,
      answer: `Estimated profit over the last 7 days is ₹${estimatedProfit.toLocaleString('en-IN')}.`,
      intent: 'PROFIT_7DAYS',
      data: estimatedProfit,
      type: 'number',
      timestamp: new Date(),
      actions: [{ label: 'View Sales Report', path: '/reports' }]
    };
  }
};
