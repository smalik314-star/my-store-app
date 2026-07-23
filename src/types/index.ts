export type UserRole = 'owner' | 'admin' | 'staff' | 'viewer';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  tenantId?: string;
}

export type SubscriptionPlan = 'free' | 'pro' | 'business';

export interface Tenant {
  id: string;
  name: string;
  ownerId: string;
  plan: SubscriptionPlan;
  status: 'active' | 'cancelled' | 'past_due';
  subscriptionId?: string;
  customerId?: string; // Payment gateway customer ID
  usage: {
    invoicesCount: number;
    productsCount: number;
    usersCount: number;
  };
  limits: {
    maxInvoices: number;
    maxProducts: number;
    maxUsers: number;
  };
  createdAt: any;
  updatedAt: any;
  trialStartedAt?: string;
  trialEndsAt?: string;
  invites?: string[];
  isTrialExtended?: boolean;
}

export interface TenantUser {
  uid: string;
  tenantId: string;
  role: UserRole;
  email: string;
  addedAt: any;
}

export interface ProductBatch {
  batchNumber: string;
  mfgDate: any; // Firebase Timestamp or ISO string
  expiryDate: any; // Firebase Timestamp or ISO string
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  createdAt: any;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  genericName?: string;
  brand?: string;
  category: string;
  manufacturer?: string;
  sku: string;
  barcode: string;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  gstPercentage: number;
  stockQuantity: number;
  unit: string;
  minimumStock: number;
  batchNumber: string;
  expiryDate: any; // Firebase Timestamp
  manufacturingDate?: any; // Firebase Timestamp
  rackLocation?: string;
  description?: string;
  imageUrl?: string;
  batches?: ProductBatch[];
  createdAt: any;
  updatedAt?: any;
}

export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  phone?: string;
  gstNumber?: string;
  address?: string;
  email?: string;
  createdAt: any;
}

export interface Purchase {
  id: string;
  tenantId: string;
  purchaseNumber: string; // e.g. PUR-0001
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: any; // Timestamp
  totalAmount: number;
  itemsCount: number;
  notes?: string;
  status?: 'posted' | 'cancelled';
  cancelledAt?: any;
  cancelledBy?: string;
  cancellationReason?: string;
  createdAt: any;
}

export interface PurchaseItem {
  id: string;
  tenantId: string;
  purchaseId: string;
  productId: string;
  productName: string;
  batchNumber: string;
  mfgDate: any; // Timestamp
  expiryDate: any; // Timestamp
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  mrp?: number;
  gstPercentage?: number;
  discount?: number;
  total: number;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  type: "PURCHASE_IN" | "PURCHASE_DELETE_REVERSE" | "PURCHASE_CANCEL_REVERSE" | "SALE_OUT" | "SALE_RETURN" | "SALE_CANCEL_REVERSE" | "MANUAL_ADJUST";
  productId: string;
  productName: string;
  batchNumber: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  purchaseId?: string;
  invoiceId?: string;
  createdAt: any;
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
  gstNumber?: string;
  outstandingBalance: number;
  totalPurchases: number;
  totalPaid: number;
  createdAt: any;
  updatedAt: any;
}

export interface InvoiceItem {
  productId: string;
  name: string;
  sku?: string;
  batchNumber?: string;
  expiryDate?: any;
  manufacturingDate?: any;
  quantity: number;
  price: number;
  gst: number;
  total: number;
  gstRate?: number;
  purchaseCost?: number;
  batchDeductions?: Array<{
    batchNumber: string;
    quantity: number;
    purchaseCost: number;
    salePrice: number;
    expiryDate?: any;
  }>;
}

export interface Invoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  items: InvoiceItem[];
  subtotal: number;
  gstTotal: number;
  discount: number;
  grandTotal: number;
  paymentStatus: 'paid' | 'due' | 'partial';
  paymentMethod: 'cash' | 'upi' | 'card' | 'credit';
  amountReceived?: number;
  outstandingAmount?: number;
  isQuickBill?: boolean;
  status?: 'posted' | 'cancelled';
  cancelledAt?: any;
  cancelledBy?: string;
  cancellationReason?: string;
  createdAt: any;
  updatedAt: any;
}

export interface StoreSettings {
  storeName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  gstNumber: string;
  logoURL: string;
  invoiceFooterText: string;
  currency: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  taxMode: boolean;
  cgstRate: number;
  sgstRate: number;
  invoicePrefix: string;
  themeMode: 'light' | 'dark';
  userId?: string;
  showDashboardCharts?: boolean;
  updatedAt: any;
}

export interface Brand {
  id: string;
  tenantId: string;
  name: string;
  createdAt: any;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}
