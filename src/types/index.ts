export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'staff' | 'owner';
}

export interface Product {
  id: string;
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
  rackLocation?: string;
  description?: string;
  imageUrl?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface Customer {
  id: string;
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
  sku: string;
  quantity: number;
  price: number;
  gst: number;
  total: number;
}

export interface Invoice {
  id: string;
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
  updatedAt: any;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}
