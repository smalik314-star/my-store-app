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
export type BusinessMode = 'retail' | 'wholesale' | 'hybrid';

export interface Tenant {
  id: string;
  name: string;
  ownerId: string;
  businessMode?: BusinessMode;
  businessModeConfigured?: boolean;
  plan: SubscriptionPlan;
  status: 'active' | 'cancelled' | 'past_due';
  subscriptionId?: string;
  customerId?: string; // Payment gateway customer ID
  subscriptionStatus?: 'free' | 'trialing' | 'active' | 'past_due' | 'cancelled';
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
  trialStartedAt?: any;
  trialEndsAt?: any;
}

export interface SubscriptionRequest {
  id: string;
  tenantId: string;
  requestedPlan: Exclude<SubscriptionPlan, 'free'>;
  billingPeriod: 'monthly' | 'annually';
  amount: number;
  currency: 'INR';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdBy: string;
  createdAt: any;
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
  wholesalePrice?: number;
  unitsPerPack?: number;
  packsPerCase?: number;
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
  recordStatus?: 'active' | 'inactive';
  archivedAt?: any;
  archivedBy?: string;
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
  totalPurchases?: number;
  totalPaid?: number;
  payableBalance?: number;
  creditBalance?: number;
  createdAt: any;
  updatedAt?: any;
}

export interface Purchase {
  id: string;
  tenantId: string;
  purchaseNumber: string; // e.g. PUR-0001
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: any; // Timestamp
  grossAmount?: number;
  discountAmount?: number;
  taxableAmount?: number;
  gstAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  totalAmount: number;
  itemsCount: number;
  notes?: string;
  status?: 'posted' | 'cancelled';
  paidAmount?: number;
  payableAmount?: number;
  paymentStatus?: 'paid' | 'due' | 'partial';
  returnAmount?: number;
  returnCount?: number;
  supplierLedgerTracked?: boolean;
  cancelledAt?: any;
  cancelledBy?: string;
  cancellationReason?: string;
  createdBy?: string;
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
  grossAmount?: number;
  discountAmount?: number;
  taxableAmount?: number;
  gstAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  total: number;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  type: "OPENING_STOCK" | "PURCHASE_IN" | "PURCHASE_RETURN" | "PURCHASE_DELETE_REVERSE" | "PURCHASE_CANCEL_REVERSE" | "SALE_OUT" | "SALE_RETURN" | "SALE_RETURN_DAMAGED" | "SALE_CANCEL_REVERSE" | "MANUAL_ADJUST";
  productId: string;
  productName: string;
  batchNumber: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  purchaseId?: string;
  invoiceId?: string;
  userId?: string;
  reason?: string;
  notes?: string;
  createdAt: any;
}

export type StockAdjustmentReason =
  | 'physical_increase'
  | 'physical_decrease'
  | 'damage'
  | 'breakage'
  | 'expired'
  | 'lost'
  | 'found'
  | 'correction'
  | 'other';

export interface StockAdjustmentRecord {
  id: string;
  tenantId: string;
  requestId: string;
  adjustmentNumber: string;
  productId: string;
  productName: string;
  batchNumber: string;
  reason: StockAdjustmentReason;
  reasonNote: string;
  notes?: string;
  previousBatchQuantity: number;
  newBatchQuantity: number;
  quantityDifference: number;
  previousProductStock: number;
  newProductStock: number;
  status: 'posted';
  createdBy: string;
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
  pricingTier?: 'retail' | 'wholesale';
  outstandingBalance: number;
  totalPurchases: number;
  totalPaid: number;
  creditBalance?: number;
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
  saleUnit?: 'unit' | 'pack' | 'case';
  saleQuantity?: number;
  conversionFactor?: number;
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
  requestId?: string;
  customerId: string;
  customerName: string;
  customerGstNumber?: string;
  saleMode?: 'retail' | 'wholesale';
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
  invoiceDate?: any;
  createdBy?: string;
  status?: 'posted' | 'cancelled';
  cancelledAt?: any;
  cancelledBy?: string;
  cancellationReason?: string;
  returnedAmount?: number;
  returnCount?: number;
  createdAt: any;
  updatedAt: any;
}

export interface ReceiptRecord {
  id: string;
  tenantId: string;
  receiptNumber: string;
  requestId: string;
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  paymentMethod: 'cash' | 'upi' | 'card' | 'credit';
  notes?: string;
  createdBy: string;
  createdAt: any;
}

export interface SaleReturnLine {
  lineIndex: number;
  productId: string;
  productName: string;
  quantity: number;
  disposition: 'resellable' | 'damaged';
  reason: string;
  amount: number;
  batchRestorations: Array<{
    batchNumber: string;
    quantity: number;
  }>;
}

export interface SaleReturnRecord {
  id: string;
  tenantId: string;
  requestId: string;
  returnNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  lines: SaleReturnLine[];
  totalAmount: number;
  outstandingAdjusted: number;
  customerCredit: number;
  status: 'posted';
  createdBy: string;
  createdAt: any;
}

export interface LedgerEntry {
  id: string;
  tenantId: string;
  partyType: 'customer' | 'supplier';
  partyId: string;
  partyName: string;
  voucherType: string;
  voucherId: string;
  voucherNumber: string;
  referenceId?: string;
  referenceNumber?: string;
  debit: number;
  credit: number;
  createdBy: string;
  createdAt: any;
}

export interface SupplierPaymentRecord {
  id: string;
  tenantId: string;
  paymentNumber: string;
  requestId: string;
  supplierId: string;
  supplierName: string;
  purchaseId: string;
  purchaseNumber: string;
  amount: number;
  paymentMethod: 'cash' | 'upi' | 'card' | 'bank';
  notes?: string;
  createdBy: string;
  createdAt: any;
}

export interface PurchaseReturnLine {
  purchaseItemId: string;
  productId: string;
  productName: string;
  batchNumber: string;
  quantity: number;
  reason: 'expired' | 'near_expiry' | 'damaged' | 'wrong_item' | 'excess_stock' | 'rate_difference' | 'other';
  amount: number;
}

export interface PurchaseReturnRecord {
  id: string;
  tenantId: string;
  requestId: string;
  returnNumber: string;
  purchaseId: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  lines: PurchaseReturnLine[];
  totalAmount: number;
  payableAdjusted: number;
  supplierCredit: number;
  status: 'posted';
  createdBy: string;
  createdAt: any;
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
