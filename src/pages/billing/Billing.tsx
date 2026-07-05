import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, onSnapshot, getDocs, where, limit, orderBy } from 'firebase/firestore';
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
  UserPlus,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { invoiceService } from '../../services/invoiceService';
import { customerService } from '../../services/customerService';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';
import { PageTransition } from '../../components/common/PageTransition';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/currency';

import { useAuth } from '../../context/AuthContext';
import { handleFirestoreError, OperationType } from '../../utils/firestore-errors';
import { toJsDate } from '../../utils/date';

const WALK_IN_CUSTOMER: Customer = {
  id: 'walk-in',
  tenantId: '',
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
  const customerSearchRef = useRef<HTMLInputElement>(null);
  
  const [quickMode, setQuickMode] = useState(true);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);

  // Navigation states for dropdowns
  const [productActiveIndex, setProductActiveIndex] = useState(0);
  const [customerActiveIndex, setCustomerActiveIndex] = useState(0);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Quick Add Customer Modal States
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerBalance, setNewCustomerBalance] = useState<number>(0);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Fetch initial data
  useEffect(() => {
    if (!user?.tenantId) return;

    const qProducts = query(
      collection(db, 'products'),
      where('tenantId', '==', user.tenantId)
    );
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
      setProducts(items);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    const qCustomers = query(
      collection(db, 'customers'),
      where('tenantId', '==', user.tenantId)
    );
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Customer));
      setCustomers(items);
      
      // Auto-select if customerId in URL
      if (preSelectedCustomerId) {
        const found = items.find(c => c.id === preSelectedCustomerId);
        if (found) setSelectedCustomer(found);
      }

      // Recent customers (last 3 for quick select)
      setRecentCustomers(items.slice(0, 3));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'customers'));

    // Fetch recent products from last 5 invoices to show in "Quick Bar"
    const fetchRecentItems = async () => {
      try {
        const qRecentInvoices = query(
          collection(db, 'invoices'),
          where('tenantId', '==', user.tenantId)
        );
        const snapshot = await getDocs(qRecentInvoices);
        
        // Map and sort client-side to prevent requiring a composite index
        const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        invoices.sort((a, b) => {
          const dateA = toJsDate(a.createdAt);
          const dateB = toJsDate(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        });

        const recentProductIds = new Set<string>();
        invoices.slice(0, 5).forEach(inv => {
          const items = inv.items as InvoiceItem[];
          items.forEach(item => recentProductIds.add(item.productId));
        });
        
        const recentList = products.filter(p => recentProductIds.has(p.id)).slice(0, 10);
        setRecentProducts(recentList);
      } catch (err) {
        console.error('Error fetching recent products:', err);
      }
    };

    if (products.length > 0) {
      fetchRecentItems();
    }

    return () => {
      unsubProducts();
      unsubCustomers();
    };
  }, [user, preSelectedCustomerId, products.length]);

  // Keyboard Shortcuts (Standard POS shortcuts like F2, F4, F8, F9)
  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleSaveInvoice();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setCart([]);
        setDiscount(0);
        setSelectedCustomer(WALK_IN_CUSTOMER);
        showToast('New invoice started', 'success');
      } else if (e.key === 'F8') {
        e.preventDefault();
        customerSearchRef.current?.focus();
        setShowCustomerDropdown(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        productSearchRef.current?.focus();
        setShowProductDropdown(true);
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSaveInvoice();
        }
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            setCart([]);
            setDiscount(0);
            setSelectedCustomer(WALK_IN_CUSTOMER);
            showToast('New invoice started', 'success');
            break;
          case 's':
            e.preventDefault();
            handleSaveInvoice();
            break;
          case 'p':
            e.preventDefault();
            if (cart.length > 0) {
              window.print();
            } else {
              showToast('Cannot print empty invoice', 'warning');
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [cart, selectedCustomer, discount]);

  // Smart Discount Suggestions
  const suggestedDiscount = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    if (subtotal > 10000) return { amount: Math.floor(subtotal * 0.1), label: 'High Value (10%)' };
    if (subtotal > 5000) return { amount: Math.floor(subtotal * 0.05), label: 'Preferred (5%)' };
    if (selectedCustomer.id !== 'walk-in' && selectedCustomer.totalPurchases > 50000) {
      return { amount: Math.floor(subtotal * 0.03), label: 'Loyalty (3%)' };
    }
    return null;
  }, [cart, selectedCustomer]);

  // Unified Product Search/Scan input handler
  const handleProductSearchChange = (val: string) => {
    setSearchTerm(val);
    setProductActiveIndex(0);
    setShowProductDropdown(true);

    if (val.trim()) {
      // Direct exact match scan for speed (SKU or Barcode)
      const exactMatch = products.find(p => 
        (p.barcode && p.barcode.toLowerCase() === val.trim().toLowerCase()) || 
        (p.sku && p.sku.toLowerCase() === val.trim().toLowerCase())
      );
      if (exactMatch) {
        addToCart(exactMatch);
        setSearchTerm('');
        setShowProductDropdown(false);
        showToast(`${exactMatch.name} added to cart`, 'success');
      }
    }
  };

  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showProductDropdown || filteredProducts.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setProductActiveIndex(prev => (prev + 1) % filteredProducts.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setProductActiveIndex(prev => (prev - 1 + filteredProducts.length) % filteredProducts.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const activeProduct = filteredProducts[productActiveIndex] || filteredProducts[0];
      if (activeProduct) {
        addToCart(activeProduct);
        setSearchTerm('');
        setShowProductDropdown(false);
        showToast(`${activeProduct.name} added to cart`, 'success');
      }
    } else if (e.key === 'Escape') {
      setShowProductDropdown(false);
    }
  };

  // Customer search input handlers
  const handleCustomerSearchChange = (val: string) => {
    setCustomerSearch(val);
    setCustomerActiveIndex(0);
    setShowCustomerDropdown(true);
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showCustomerDropdown || filteredCustomers.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCustomerActiveIndex(prev => (prev + 1) % filteredCustomers.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCustomerActiveIndex(prev => (prev - 1 + filteredCustomers.length) % filteredCustomers.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const activeCustomer = filteredCustomers[customerActiveIndex] || filteredCustomers[0];
      if (activeCustomer) {
        setSelectedCustomer(activeCustomer);
        setCustomerSearch('');
        setShowCustomerDropdown(false);
        showToast(`Customer selected: ${activeCustomer.name}`, 'success');
        
        // Auto focus the product search box for quick item billing!
        setTimeout(() => {
          productSearchRef.current?.focus();
          setShowProductDropdown(true);
        }, 50);
      }
    } else if (e.key === 'Escape') {
      setShowCustomerDropdown(false);
    }
  };

  // Quick Add Customer Save
  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.tenantId) return;
    if (!newCustomerName || !newCustomerPhone) {
      showToast('Name and Phone are required!', 'danger');
      return;
    }
    setIsSavingCustomer(true);
    try {
      const customerId = await customerService.addCustomer(user.tenantId, {
        name: newCustomerName,
        phone: newCustomerPhone,
        address: newCustomerAddress || 'Counter Sale',
        outstandingBalance: Number(newCustomerBalance) || 0,
        totalPurchases: 0,
        totalPaid: 0,
      });
      
      const newCustomer: Customer = {
        id: customerId,
        tenantId: user.tenantId,
        name: newCustomerName,
        phone: newCustomerPhone,
        address: newCustomerAddress || 'Counter Sale',
        outstandingBalance: Number(newCustomerBalance) || 0,
        totalPurchases: 0,
        totalPaid: 0,
        createdAt: null,
        updatedAt: null,
      };
      
      setSelectedCustomer(newCustomer);
      setIsAddCustomerOpen(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerAddress('');
      setNewCustomerBalance(0);
      showToast('Customer added & selected successfully!', 'success');
      
      // Focus product search automatically
      setTimeout(() => {
        productSearchRef.current?.focus();
        setShowProductDropdown(true);
      }, 50);
    } catch (error: any) {
      console.error('Failed to add customer:', error);
      showToast(error.message || 'Failed to add customer', 'danger');
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Filtered lists
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return [];
    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.barcode && p.barcode.includes(searchTerm))
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
    if (!user?.tenantId) return;
    if (cart.length === 0) {
      showToast('Cart is empty!', 'danger');
      return;
    }

    setLoading(true);
    try {
      // Use prefix from settings
      const prefix = settings?.invoicePrefix || 'INV';
      const invoiceNumber = await invoiceService.generateInvoiceNumber(user.tenantId, prefix);
      
      const invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'> = {
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

      const invoiceId = await invoiceService.saveInvoice(user.tenantId, invoiceData);
      showToast('Invoice generated successfully!', 'success');
      
      setTimeout(() => {
        navigate(`/invoice/${invoiceId}`);
      }, 1000);
    } catch (error: any) {
      console.error('Invoice saving failed:', error);
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
          <Card className="p-6 border-border bg-surface relative overflow-visible">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-black text-text uppercase tracking-widest">Select Customer</h3>
              </div>
              <span className="text-[9px] font-black text-primary bg-primary/10 px-2 py-1 rounded-md">F8 TO SEARCH</span>
            </div>
            
            <div className="space-y-4">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
                <input
                  ref={customerSearchRef}
                  type="text"
                  placeholder="Type name or phone number..."
                  value={customerSearch}
                  onChange={(e) => handleCustomerSearchChange(e.target.value)}
                  onKeyDown={handleCustomerKeyDown}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                />
              </div>

              {/* Customer Results Dropdown */}
              <AnimatePresence>
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute left-0 right-0 top-full mt-2 z-50 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden p-2 space-y-1"
                  >
                    <div className="px-3 py-1 text-[8px] font-black text-text/30 uppercase tracking-widest">Suggestions (Arrow Keys + Enter / Tab)</div>
                    {filteredCustomers.map((customer, idx) => (
                      <button
                        key={customer.id}
                        type="button"
                        onMouseEnter={() => setCustomerActiveIndex(idx)}
                        onMouseDown={() => {
                          setSelectedCustomer(customer);
                          setCustomerSearch('');
                          setShowCustomerDropdown(false);
                          showToast(`Customer selected: ${customer.name}`, 'success');
                          setTimeout(() => {
                            productSearchRef.current?.focus();
                            setShowProductDropdown(true);
                          }, 50);
                        }}
                        className={cn(
                          "w-full p-3 rounded-xl border transition-all text-left flex items-center justify-between group",
                          selectedCustomer.id === customer.id 
                            ? "bg-primary border-primary text-white" 
                            : (customerActiveIndex === idx 
                                ? "bg-primary/10 border-primary/25 text-primary" 
                                : "bg-background/50 border-transparent hover:bg-background")
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-7 w-7 rounded-lg flex items-center justify-center font-black text-[10px]",
                            selectedCustomer.id === customer.id ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                          )}>
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-black">{customer.name}</span>
                            <span className={cn(
                              "text-[8px] font-bold uppercase tracking-widest",
                              selectedCustomer.id === customer.id ? "text-white/60" : "text-text/30"
                            )}>{customer.phone}</span>
                          </div>
                        </div>
                        {customer.outstandingBalance > 0 && (
                          <Badge variant="warning" className={cn(
                            "text-[8px] font-black px-1.5 py-0",
                            selectedCustomer.id === customer.id && "bg-white/20 text-white border-transparent"
                          )}>
                            DUE: {formatCurrency(customer.outstandingBalance)}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Selected Customer Card summary */}
              <div className="p-4 rounded-2xl bg-background/50 border border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center font-black text-primary text-sm">
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-text">{selectedCustomer.name}</span>
                    <span className="text-[9px] font-bold text-text/40 tracking-wider">{selectedCustomer.phone}</span>
                  </div>
                </div>
                {selectedCustomer.id !== 'walk-in' && (
                  <Badge variant="neutral" className="text-[8px] font-black uppercase">
                    Saved Client
                  </Badge>
                )}
              </div>

              <div className="flex gap-2">
                {recentCustomers.filter(c => c.id !== selectedCustomer.id).slice(0, 2).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(c);
                      showToast(`Customer selected: ${c.name}`, 'success');
                    }}
                    className="flex-1 py-2 px-3 rounded-xl border border-border bg-background hover:border-primary/30 transition-all text-left flex items-center gap-2"
                  >
                    <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center font-black text-[9px] text-primary">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[10px] font-black text-text/60 truncate">{c.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              <Button 
                variant="outline" 
                className="w-full font-black text-[10px] uppercase h-11 rounded-xl"
                onClick={() => setIsAddCustomerOpen(true)}
                leftIcon={<UserPlus className="h-3.5 w-3.5" />}
              >
                Quick Add Customer
              </Button>
            </div>
          </Card>

          {/* Product Search & Barcode */}
          <Card className="p-6 border-border bg-surface relative overflow-visible">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-black text-text uppercase tracking-widest">Add Items</h3>
              </div>
              <span className="text-[9px] font-black text-primary bg-primary/10 px-2 py-1 rounded-md">F9 TO SEARCH / SCAN</span>
            </div>
            
            <div className="space-y-4">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
                <input
                  ref={productSearchRef}
                  type="text"
                  placeholder="Search name, SKU, or Scan Barcode..."
                  value={searchTerm}
                  onChange={(e) => handleProductSearchChange(e.target.value)}
                  onKeyDown={handleProductKeyDown}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                />
                <ScanLine className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/30" />
              </div>

              {/* Recent Products Quick Bar */}
              {recentProducts.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-[10px] font-black text-text/30 uppercase tracking-widest ml-1">Recent Items</span>
                  <div className="flex flex-wrap gap-1.5">
                    {recentProducts.slice(0, 5).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          addToCart(p);
                          showToast(`${p.name} added`, 'success');
                        }}
                        className="px-2.5 py-1.5 rounded-xl border border-border bg-background/50 hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center gap-1.5 group"
                      >
                        <Plus className="h-3 w-3 text-text/40 group-hover:text-primary" />
                        <span className="text-[10.5px] font-black text-text/60 group-hover:text-text">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Product Results Dropdown */}
            <AnimatePresence>
              {showProductDropdown && searchTerm && filteredProducts.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute left-0 right-0 top-full mt-2 z-50 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden p-2 space-y-1"
                >
                  <div className="px-3 py-1 text-[8px] font-black text-text/30 uppercase tracking-widest">Suggestions (Arrow Keys + Enter / Tab)</div>
                  {filteredProducts.map((product, idx) => (
                    <button
                      key={product.id}
                      type="button"
                      onMouseEnter={() => setProductActiveIndex(idx)}
                      onMouseDown={() => {
                        addToCart(product);
                        setSearchTerm('');
                        setShowProductDropdown(false);
                        showToast(`${product.name} added to cart`, 'success');
                      }}
                      className={cn(
                        "w-full p-3 rounded-xl transition-all flex items-center justify-between border text-left",
                        productActiveIndex === idx 
                          ? "bg-primary/10 border-primary/25 text-primary" 
                          : "bg-transparent border-transparent hover:bg-background"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-8 w-8 rounded-lg border flex items-center justify-center transition-all",
                          productActiveIndex === idx ? "text-primary border-primary/30 bg-primary/5" : "text-text/20 border-border"
                        )}>
                          <Package className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-black">{product.name}</span>
                          <span className="text-[8px] font-black text-text/30 uppercase tracking-widest">{product.sku}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-black">{formatCurrency(product.sellingPrice)}</span>
                        <Badge variant={product.stockQuantity > 5 ? 'success' : 'warning'} className="text-[8px] py-0 px-1 font-bold">
                          {product.stockQuantity} {product.unit}
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
                                <span className="text-sm font-black text-text">{formatCurrency(item.total)}</span>
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
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-bold text-text/60">
                  <span className="uppercase tracking-widest text-[10px]">Tax (GST)</span>
                  <span className="text-success">+ {formatCurrency(totals.gstTotal)}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm font-bold text-text/60">
                    <span className="uppercase tracking-widest text-[10px]">Discount</span>
                    <span className="text-danger">- {formatCurrency(discount)}</span>
                  </div>
                  
                  {suggestedDiscount && (
                    <motion.button
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => setDiscount(suggestedDiscount.amount)}
                      className="w-full p-3 rounded-xl bg-success/5 border border-success/20 flex items-center justify-between group hover:bg-success/10 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-success" />
                        <span className="text-[10px] font-black text-success uppercase tracking-widest">{suggestedDiscount.label}</span>
                      </div>
                      <span className="text-xs font-black text-success">Apply {formatCurrency(suggestedDiscount.amount)}</span>
                    </motion.button>
                  )}

                  <input
                    type="number"
                    placeholder="Apply Discount (INR)"
                    value={discount || ''}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-4 focus:ring-danger/5 focus:border-danger transition-all outline-none text-xs font-bold"
                  />
                </div>
                
                <div className="h-px bg-border my-2" />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-text uppercase tracking-widest">Grand Total</span>
                  <span className="text-3xl font-black text-primary tracking-tighter">{formatCurrency(totals.grandTotal)}</span>
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

      {/* Mobile Sticky Total Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border p-4 pb-safe z-40 flex items-center justify-between shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col">
          <span className="text-[8px] font-black text-text/30 uppercase tracking-widest">Total Amount</span>
          <span className="text-xl font-black text-primary">{formatCurrency(totals.grandTotal)}</span>
        </div>
        <Button 
          variant="primary" 
          className="px-8 h-12 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
          onClick={handleSaveInvoice}
          isLoading={loading}
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Checkout
        </Button>
      </div>

      {/* Quick Add Customer Modal */}
      <AnimatePresence>
        {isAddCustomerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button
                type="button"
                onClick={() => setIsAddCustomerOpen(false)}
                className="absolute top-4 right-4 p-2 hover:bg-background rounded-full transition-colors text-text/40 hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
              
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-md font-black text-text uppercase tracking-widest">Quick Add Customer</h3>
                  <p className="text-[9px] font-bold text-text/40 tracking-wider uppercase">Add client to system & select instantly</p>
                </div>
              </div>
              
              <form onSubmit={handleQuickAddCustomer} className="space-y-4">
                <div>
                  <label className="block text-[8px] font-black text-text/40 uppercase tracking-widest mb-1.5 ml-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter name (e.g., Rajesh Kumar)"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                  />
                </div>
                
                <div>
                  <label className="block text-[8px] font-black text-text/40 uppercase tracking-widest mb-1.5 ml-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    pattern="[0-9]{10}"
                    maxLength={10}
                    placeholder="Enter 10-digit phone number"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                  />
                </div>
                
                <div>
                  <label className="block text-[8px] font-black text-text/40 uppercase tracking-widest mb-1.5 ml-1">Address</label>
                  <input
                    type="text"
                    placeholder="Enter address (optional)"
                    value={newCustomerAddress}
                    onChange={(e) => setNewCustomerAddress(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-black text-text/40 uppercase tracking-widest mb-1.5 ml-1">Opening Due Balance (INR)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newCustomerBalance || ''}
                    onChange={(e) => setNewCustomerBalance(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 font-black text-[10px] uppercase h-11 rounded-xl"
                    onClick={() => setIsAddCustomerOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    className="flex-1 font-black text-[10px] uppercase h-11 rounded-xl shadow-lg shadow-primary/20"
                    isLoading={isSavingCustomer}
                  >
                    Save & Select
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </PageTransition>
  );
}
