import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, onSnapshot, getDocs, where, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Product, Customer, InvoiceItem, Invoice } from '../../types';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  User, 
  CreditCard, 
  Receipt, 
  AlertCircle,
  Package,
  ScanLine,
  ChevronRight,
  ArrowRight,
  Save,
  X,
  UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { invoiceService } from '../../services/invoiceService';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';
import { PageTransition } from '../../components/common/PageTransition';
import { useToast } from '../../context/ToastContext';

import { useAuth } from '../../context/AuthContext';
import { handleFirestoreError, OperationType } from '../../utils/firestore-errors';

const WALK_IN_CUSTOMER: Customer = {
  id: 'walk-in',
  name: 'Walk-in Customer',
  phone: '0000000000',
  address: 'Counter Sale',
  outstandingBalance: 0,
  totalPurchases: 0,
  totalPaid: 0,
  createdAt: null,
  updatedAt: null
};

export default function Billing() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const currency = settings?.currency || '₹';
  const [searchParams] = useSearchParams();
  const preSelectedCustomerId = searchParams.get('customerId');
  
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer>(WALK_IN_CUSTOMER);
  const [cart, setCart] = useState<InvoiceItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'credit'>('cash');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'due'>('paid');
  
  const { showToast } = useToast();
  
  const navigate = useNavigate();
  const productSearchRef = useRef<HTMLInputElement>(null);

  // Fetch initial data
  useEffect(() => {
    if (!user) return;

    const qProducts = query(
      collection(db, 'products'),
      where('userId', '==', user.uid)
    );
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
      setProducts(items);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    const qCustomers = query(
      collection(db, 'customers'),
      where('userId', '==', user.uid)
    );
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Customer));
      setCustomers(items);
      
      // Auto-select if customerId in URL
      if (preSelectedCustomerId) {
        const found = items.find(c => c.id === preSelectedCustomerId);
        if (found) setSelectedCustomer(found);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'customers'));

    return () => {
      unsubProducts();
      unsubCustomers();
    };
  }, [user, preSelectedCustomerId]);

  // Filtered lists
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return [];
    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode?.includes(searchTerm)
    ).slice(0, 5);
  }, [products, searchTerm]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [WALK_IN_CUSTOMER];
    return [
      WALK_IN_CUSTOMER,
      ...customers.filter(c => 
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
        c.phone.includes(customerSearch)
      )
    ].slice(0, 5);
  }, [customers, customerSearch]);

  // Cart Calculations
  const totals = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const gstTotal = cart.reduce((acc, item) => acc + (item.gst * item.quantity), 0);
    const grandTotal = Math.max(0, subtotal + gstTotal - discount);
    
    return { subtotal, gstTotal, grandTotal };
  }, [cart, discount]);

  // Cart Actions
  const addToCart = (product: Product) => {
    if (product.stockQuantity <= 0) {
      showToast(`${product.name} is out of stock!`, 'danger');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQuantity) {
          showToast(`Cannot add more. Only ${product.stockQuantity} available.`, 'danger');
          return prev;
        }
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * (item.price + item.gst) }
            : item
        );
      }

      const itemTotal = product.sellingPrice;
      
      // Use system GST rates if tax mode is enabled
      const cgstRate = settings?.taxMode ? (settings.cgstRate || 9) : 0;
      const sgstRate = settings?.taxMode ? (settings.sgstRate || 9) : 0;
      const totalTaxRate = cgstRate + sgstRate;
      
      // If product has a specific GST, we could use that, but prompt says "Tax calculation rules" in settings.
      // Usually pharma products have specific GST (5%, 12%, 18%). 
      // Let's stick to product's gstPercentage but respect settings.taxMode.
      const effectiveGstRate = settings?.taxMode ? product.gstPercentage : 0;
      const gstAmount = (product.sellingPrice * effectiveGstRate) / 100;
      
      return [...prev, {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        quantity: 1,
        price: product.sellingPrice,
        gst: gstAmount,
        total: product.sellingPrice + gstAmount
      }];
    });
    setSearchTerm('');
    productSearchRef.current?.focus();
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const product = products.find(p => p.id === productId);
        const newQty = Math.max(1, item.quantity + delta);
        
        if (product && newQty > product.stockQuantity) {
          showToast(`Max stock reached for ${item.name}`, 'danger');
          return item;
        }
        
        return { ...item, quantity: newQty, total: newQty * (item.price + item.gst) };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const handleSaveInvoice = async () => {
    if (cart.length === 0) {
      showToast('Cart is empty!', 'danger');
      return;
    }

    setLoading(true);
    try {
      // Use prefix from settings
      const prefix = settings?.invoicePrefix || 'INV';
      const invoiceNumber = await invoiceService.generateInvoiceNumber(prefix);
      
      const invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'> = {
        invoiceNumber,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        items: cart,
        subtotal: totals.subtotal,
        gstTotal: totals.gstTotal,
        discount,
        grandTotal: totals.grandTotal,
        paymentStatus,
        paymentMethod,
      };

      const invoiceId = await invoiceService.saveInvoice(invoiceData);
      showToast('Invoice generated successfully!', 'success');
      
      setTimeout(() => {
        navigate(`/invoice/${invoiceId}`);
      }, 1000);
    } catch (error: any) {
      showToast(error.message || 'Failed to save invoice', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-text tracking-tight flex items-center gap-4">
            Billing Terminal
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
          </h1>
          <p className="text-[10px] font-black text-text/30 uppercase tracking-[0.3em] mt-2">
            {settings?.storeName || 'PharmaFlow'} — Professional Pharmacy Point of Sale
          </p>
        </div>
        <div className="flex items-center gap-4 bg-surface p-2 rounded-2xl border border-border">
          <div className="flex flex-col items-end px-4">
            <span className="text-[8px] font-black text-text/30 uppercase tracking-widest">Active Station</span>
            <span className="text-xs font-black text-text">STATION-01</span>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="flex flex-col px-4">
            <span className="text-[8px] font-black text-text/30 uppercase tracking-widest">Date & Time</span>
            <span className="text-xs font-black text-text">{new Date().toLocaleDateString(settings?.dateFormat === 'DD/MM/YYYY' ? 'en-IN' : 'en-US')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Product Search & Customer Selection (4 cols) */}
        <div className="lg:col-span-4 space-y-6 order-2 lg:order-1">
          {/* Customer Selection */}
          <Card className="p-6 border-border bg-surface">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-sm font-black text-text uppercase tracking-widest">Select Customer</h3>
            </div>
            
            <div className="space-y-4">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                {filteredCustomers.map(customer => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setCustomerSearch('');
                    }}
                    className={cn(
                      "w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between group",
                      selectedCustomer.id === customer.id 
                        ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" 
                        : "bg-background/50 border-border hover:border-primary/30"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center font-black text-xs",
                        selectedCustomer.id === customer.id ? "bg-white/20" : "bg-primary/10 text-primary"
                      )}>
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-black">{customer.name}</span>
                        <span className={cn(
                          "text-[9px] font-bold uppercase tracking-widest",
                          selectedCustomer.id === customer.id ? "text-white/60" : "text-text/30"
                        )}>{customer.phone}</span>
                      </div>
                    </div>
                    {customer.outstandingBalance > 0 && (
                      <Badge variant="warning" className={cn(
                        "text-[8px] font-black",
                        selectedCustomer.id === customer.id && "bg-white/20 text-white"
                      )}>
                        DUE: {currency}{customer.outstandingBalance}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>

              <Button 
                variant="outline" 
                className="w-full font-black text-[10px] uppercase h-12 rounded-xl"
                onClick={() => navigate('/customers')}
                leftIcon={<UserPlus className="h-4 w-4" />}
              >
                Add New Customer
              </Button>
            </div>
          </Card>

          {/* Product Search */}
          <Card className="p-6 border-border bg-surface relative overflow-visible">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-sm font-black text-text uppercase tracking-widest">Search Products</h3>
            </div>
            
            <div className="relative group">
              <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
              <input
                ref={productSearchRef}
                type="text"
                placeholder="Product Name, SKU or Barcode..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
              />
            </div>

            {/* Product Results Dropdown */}
            <AnimatePresence>
              {searchTerm && filteredProducts.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute left-0 right-0 top-full mt-2 z-50 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden p-2"
                >
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="w-full p-4 hover:bg-background rounded-xl transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center text-text/20 group-hover:text-primary group-hover:border-primary/30 transition-all">
                          <Package className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-text group-hover:text-primary transition-colors">{product.name}</span>
                          <span className="text-[10px] font-bold text-text/30 uppercase tracking-widest">{product.sku}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-black text-text">{currency}{product.sellingPrice}</span>
                        <Badge variant={product.stockQuantity > 5 ? 'success' : 'warning'} className="text-[8px] py-0">
                          {product.stockQuantity} {product.unit} left
                        </Badge>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>

        {/* Center: Cart Table (8 cols total, nested) */}
        <div className="lg:col-span-8 grid grid-cols-1 lg:grid-cols-8 gap-8 order-1 lg:order-2">
          {/* Cart Section (5 cols) */}
          <div className="lg:col-span-5 space-y-6 order-1">
            <Card className="p-0 overflow-hidden border-border bg-surface h-full flex flex-col">
              <div className="p-6 border-b border-border bg-background/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-black text-text uppercase tracking-widest">Active Cart</h3>
                </div>
                <Badge variant="neutral" className="font-black px-4">{cart.length} ITEMS</Badge>
              </div>

              <div className="flex-1 overflow-auto max-h-[400px] lg:max-h-[600px] scrollbar-thin">
                <div className="min-w-[600px] lg:min-w-0">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-background/20 border-b border-border sticky top-0 z-10">
                        <th className="px-6 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest">Product</th>
                        <th className="px-6 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest text-center">Qty</th>
                        <th className="px-6 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest text-right">Price</th>
                        <th className="px-6 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      <AnimatePresence mode="popLayout">
                        {cart.map((item) => (
                          <motion.tr
                            layout
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            key={item.productId}
                            className="group hover:bg-background/30 transition-all"
                          >
                            <td className="px-6 py-5">
                              <div className="flex flex-col">
                                <span className="text-sm font-black text-text">{item.name}</span>
                                <span className="text-[10px] font-bold text-text/30 uppercase tracking-widest">{item.sku}</span>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center justify-center gap-3 bg-background/50 rounded-xl p-1 w-fit mx-auto border border-border">
                                <button 
                                  onClick={() => updateQuantity(item.productId, -1)}
                                  className="h-8 w-8 rounded-lg hover:bg-surface flex items-center justify-center text-text/40 hover:text-text transition-all"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="text-sm font-black text-text w-8 text-center">{item.quantity}</span>
                                <button 
                                  onClick={() => updateQuantity(item.productId, 1)}
                                  className="h-8 w-8 rounded-lg hover:bg-surface flex items-center justify-center text-text/40 hover:text-text transition-all"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-5 text-right">
                              <div className="flex flex-col">
                                <span className="text-sm font-black text-text">{currency}{item.total.toLocaleString()}</span>
                                <span className="text-[9px] font-bold text-text/30 uppercase">Incl. GST</span>
                              </div>
                            </td>
                            <td className="px-6 py-5 text-right">
                              <button 
                                onClick={() => removeFromCart(item.productId)}
                                className="h-10 w-10 rounded-xl hover:bg-danger/10 text-text/20 hover:text-danger transition-all inline-flex items-center justify-center"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                      {cart.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-32 text-center">
                            <div className="flex flex-col items-center">
                              <div className="h-20 w-20 rounded-[2rem] bg-background border border-border flex items-center justify-center mb-4">
                                <ShoppingCart className="h-8 w-8 text-text/10" />
                              </div>
                              <span className="text-sm font-black text-text/20 uppercase tracking-widest">Cart is currently empty</span>
                              <span className="text-[9px] font-bold text-text/10 uppercase mt-2">Add products to begin checkout</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </div>

          {/* Checkout Summary (3 cols) */}
          <div className="lg:col-span-3 space-y-6 order-2">
            <Card className="p-6 border-border bg-surface space-y-8">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Receipt className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-black text-text uppercase tracking-widest">Order Summary</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm font-bold text-text/60">
                  <span className="uppercase tracking-widest text-[10px]">Subtotal</span>
                  <span>{currency}{totals.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-bold text-text/60">
                  <span className="uppercase tracking-widest text-[10px]">Tax (GST)</span>
                  <span className="text-success">+ {currency}{totals.gstTotal.toLocaleString()}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm font-bold text-text/60">
                    <span className="uppercase tracking-widest text-[10px]">Discount</span>
                    <span className="text-danger">- {currency}{discount.toLocaleString()}</span>
                  </div>
                  <input
                    type="number"
                    placeholder={`Apply Discount ${currency}`}
                    value={discount || ''}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-4 focus:ring-danger/5 focus:border-danger transition-all outline-none text-xs font-bold"
                  />
                </div>
                
                <div className="h-px bg-border my-2" />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-text uppercase tracking-widest">Grand Total</span>
                  <span className="text-3xl font-black text-primary tracking-tighter">{currency}{totals.grandTotal.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-border">
                <div className="space-y-3">
                  <span className="text-[10px] font-black text-text/40 uppercase tracking-widest block ml-1">Payment Method</span>
                  <div className="grid grid-cols-2 gap-2">
                    {['cash', 'upi', 'card', 'credit'].map(method => (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method as any)}
                        className={cn(
                          "py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                          paymentMethod === method 
                            ? "bg-text text-white border-text shadow-lg shadow-text/10" 
                            : "bg-background border-border hover:border-primary/30"
                        )}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-[10px] font-black text-text/40 uppercase tracking-widest block ml-1">Payment Status</span>
                  <div className="flex gap-2 p-1 bg-background rounded-xl border border-border">
                    <button
                      onClick={() => setPaymentStatus('paid')}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                        paymentStatus === 'paid' ? "bg-success text-white shadow-md shadow-success/20" : "text-text/30"
                      )}
                    >
                      Paid
                    </button>
                    <button
                      disabled={selectedCustomer.id === 'walk-in'}
                      onClick={() => setPaymentStatus('due')}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                        paymentStatus === 'due' ? "bg-warning text-white shadow-md shadow-warning/20" : "text-text/30",
                        selectedCustomer.id === 'walk-in' && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      Credit/Due
                    </button>
                  </div>
                  {selectedCustomer.id === 'walk-in' && (
                    <span className="text-[8px] font-bold text-danger uppercase block text-center">Walk-in customers cannot have credit</span>
                  )}
                </div>
              </div>

              <Button 
                variant="primary" 
                className="w-full font-black uppercase tracking-[0.2em] h-20 rounded-[2rem] shadow-2xl shadow-primary/30 text-lg group"
                isLoading={loading}
                onClick={handleSaveInvoice}
                rightIcon={<ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />}
              >
                Complete Sale
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
    </PageTransition>
  );
}
