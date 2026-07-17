import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, onSnapshot, getDocs, where, limit, orderBy, addDoc, Timestamp } from 'firebase/firestore';
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
import { medicineMasterService, MasterMedicine } from '../../services/medicineMasterService';

import { useAuth } from '../../context/AuthContext';
import { handleFirestoreError, OperationType } from '../../utils/firestore-errors';
import { toJsDate, formatDate } from '../../utils/date';

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
  const formatDateForInput = (dateVal: any) => {
    if (!dateVal) return '';
    try {
      const d = toJsDate(dateVal);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch (e) {
      return '';
    }
  };

  const { user } = useAuth();
  const { settings } = useSettings();
  const [searchParams] = useSearchParams();
  const preSelectedCustomerId = searchParams.get('customerId');
  
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [masterSuggestions, setMasterSuggestions] = useState<MasterMedicine[]>([]);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Debounce search term changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Query master medicine database in IndexedDB
  useEffect(() => {
    if (debouncedSearchTerm.trim().length >= 2) {
      medicineMasterService.search(debouncedSearchTerm).then(results => {
        setMasterSuggestions(results);
      });
    } else {
      setMasterSuggestions([]);
    }
  }, [debouncedSearchTerm]);

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

  // Fetch initial data (Products and Customers subscriptions)
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

    return () => {
      unsubProducts();
      unsubCustomers();
    };
  }, [user?.tenantId, preSelectedCustomerId]);

  // Fetch recent products separately to prevent subscription loop
  useEffect(() => {
    if (!user?.tenantId || products.length === 0) return;

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

    fetchRecentItems();
  }, [user?.tenantId, products.length]);

  // Keyboard Shortcuts (Standard POS shortcuts like F2, F4, F8, F9, Ctrl+S, Ctrl+N, Esc)
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
      } else if (e.key === 'Escape') {
        if (isAddCustomerOpen) {
          e.preventDefault();
          setIsAddCustomerOpen(false);
          showToast('Closed add customer dialog', 'info');
          return;
        }

        const activeEl = document.activeElement;
        if (activeEl === productSearchRef.current) {
          e.preventDefault();
          setSearchTerm('');
          setShowProductDropdown(false);
          productSearchRef.current?.blur();
          showToast('Product input cleared', 'info');
        } else if (activeEl === customerSearchRef.current) {
          e.preventDefault();
          setCustomerSearch('');
          setShowCustomerDropdown(false);
          customerSearchRef.current?.blur();
          showToast('Customer input cleared', 'info');
        } else {
          // If neither is focused but there's search text, clear it
          if (searchTerm || customerSearch || showProductDropdown || showCustomerDropdown) {
            e.preventDefault();
            setSearchTerm('');
            setCustomerSearch('');
            setShowProductDropdown(false);
            setShowCustomerDropdown(false);
            showToast('Search inputs cleared', 'info');
          }
        }
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
  }, [cart, selectedCustomer, discount, isAddCustomerOpen, searchTerm, customerSearch, showProductDropdown, showCustomerDropdown]);

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
      }
    }
  };

  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setSearchTerm('');
      setShowProductDropdown(false);
      productSearchRef.current?.blur();
      showToast('Product input cleared', 'info');
      return;
    }

    if (!showProductDropdown || combinedSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setProductActiveIndex(prev => (prev + 1) % combinedSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setProductActiveIndex(prev => (prev - 1 + combinedSuggestions.length) % combinedSuggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const activeSuggestion = combinedSuggestions[productActiveIndex] || combinedSuggestions[0];
      if (activeSuggestion) {
        if (activeSuggestion.type === 'inventory') {
          addToCart(activeSuggestion.data);
          setSearchTerm('');
          setShowProductDropdown(false);
        } else {
          handleSelectMasterMedicine(activeSuggestion.data);
        }
      }
    }
  };

  // Customer search input handlers
  const handleCustomerSearchChange = (val: string) => {
    setCustomerSearch(val);
    setCustomerActiveIndex(0);
    setShowCustomerDropdown(true);
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setCustomerSearch('');
      setShowCustomerDropdown(false);
      customerSearchRef.current?.blur();
      showToast('Customer input cleared', 'info');
      return;
    }

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
    const term = (searchTerm || '').trim().toLowerCase();
    const inStock = products.filter(p => p && (p.stockQuantity ?? 0) > 0);
    if (!term) {
      // Show first 10 products with stock by default when focused
      return inStock.slice(0, 10);
    }
    return products.filter(p => {
      if (!p) return false;
      const name = (p.name || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      const genericName = (p.genericName || '').toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      return name.includes(term) || 
             sku.includes(term) || 
             barcode.includes(term) ||
             genericName.includes(term) ||
             brand.includes(term);
    }).slice(0, 10);
  }, [products, searchTerm]);

  const combinedSuggestions = useMemo(() => {
    return [
      ...filteredProducts.map(p => ({ type: 'inventory' as const, data: p })),
      ...masterSuggestions.map(med => ({ type: 'master' as const, data: med }))
    ];
  }, [filteredProducts, masterSuggestions]);

  // Handle selecting a master database medicine, automatically logging it to local stock & adding to active invoice
  const handleSelectMasterMedicine = async (med: MasterMedicine) => {
    if (!user?.tenantId) return;
    try {
      showToast(`Adding ${med.name} from master dataset...`, 'info');
      
      const sku = `SKU-${Date.now().toString().slice(-6)}`;
      const barcode = `BAR-${Date.now().toString().slice(-6)}`;
      
      const newProductData = {
        tenantId: user.tenantId,
        sku,
        barcode,
        name: med.name,
        brand: med.brand || '',
        genericName: med.genericName || '',
        category: med.category || 'Others',
        manufacturer: med.manufacturer || '',
        mrp: med.mrp || 100,
        purchasePrice: med.purchasePrice || 70,
        sellingPrice: med.sellingPrice || 85,
        unit: med.unit || 'Strip',
        stockQuantity: 100, // Safe buffer quantity for active billing
        minimumStock: 10,
        batchNumber: 'MASTER-AUTO',
        expiryDate: Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)), // 1 year
        manufacturingDate: Timestamp.fromDate(new Date()),
        gstPercentage: 12,
        rackLocation: 'A1',
        createdAt: Timestamp.now()
      };

      const docRef = await addDoc(collection(db, 'products'), newProductData);
      
      const createdProduct: Product = {
        id: docRef.id,
        ...newProductData
      };

      addToCart(createdProduct);
      setSearchTerm('');
      setShowProductDropdown(false);
      showToast(`${med.name} added to inventory and loaded!`, 'success');
    } catch (err: any) {
      console.error('Failed to auto-create master product:', err);
      showToast('Could not register master product.', 'danger');
    }
  };

  const filteredCustomers = useMemo(() => {
    const term = (customerSearch || '').trim().toLowerCase();
    if (!term) return [WALK_IN_CUSTOMER];
    return [
      WALK_IN_CUSTOMER,
      ...customers.filter(c => {
        if (!c) return false;
        const name = (c.name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return name.includes(term) || phone.includes(term);
      })
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
        sku: product.sku || '',
        batchNumber: product.batchNumber || '',
        expiryDate: product.expiryDate || null,
        manufacturingDate: product.manufacturingDate || null,
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

  const updateCartItemField = (productId: string, field: string, value: any) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        let updated = { ...item, [field]: value };
        
        // Recalculate GST and total if price (rate) or quantity changes
        if (field === 'price' || field === 'quantity') {
          const product = products.find(p => p.id === productId);
          const effectiveGstRate = settings?.taxMode ? (product?.gstPercentage || 0) : 0;
          const rate = field === 'price' ? Number(value) : item.price;
          const qty = field === 'quantity' ? Math.max(1, Number(value)) : item.quantity;
          
          const gstAmount = (rate * effectiveGstRate) / 100;
          updated.price = rate;
          updated.quantity = qty;
          updated.gst = gstAmount;
          updated.total = qty * (rate + gstAmount);
        }
        
        return updated;
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
                              {(customer.name || 'C').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-black">{customer.name || 'Unnamed'}</span>
                              <span className={cn(
                                "text-[8px] font-bold uppercase tracking-widest",
                                selectedCustomer.id === customer.id ? "text-white/60" : "text-text/30"
                              )}>{customer.phone || 'N/A'}</span>
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
              </div>

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
                {selectedCustomer.id !== 'walk-in' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(WALK_IN_CUSTOMER);
                      showToast('Switched to Walk-In Customer', 'info');
                    }}
                    className="text-[10px] font-black text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-md transition-all shrink-0"
                  >
                    Reset to Walk-In
                  </button>
                ) : (
                  <Badge variant="neutral" className="text-[8px] font-black uppercase shrink-0">
                    Walk-In Client
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
                      {(c.name || 'C').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[10px] font-black text-text/60 truncate">{(c.name || '').split(' ')[0]}</span>
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
                <ScanLine className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/30" />                 {/* Product Results Dropdown */}
                <AnimatePresence>
                  {showProductDropdown && (filteredProducts.length > 0 || masterSuggestions.length > 0) && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="absolute left-0 right-0 top-full mt-2 z-50 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden p-2 space-y-1 max-h-[350px] overflow-y-auto"
                    >
                      {filteredProducts.length > 0 && (
                        <div>
                          <div className="px-3 py-1.5 text-[8px] font-black text-text/30 uppercase tracking-widest border-b border-border/40 mb-1">
                            In-Stock Inventory Matches (Arrow Keys + Enter)
                          </div>
                          <div className="space-y-1">
                            {filteredProducts.map((product, idx) => {
                              const overallIdx = idx;
                              return (
                                <button
                                  key={product.id}
                                  type="button"
                                  onMouseEnter={() => setProductActiveIndex(overallIdx)}
                                  onMouseDown={() => {
                                    addToCart(product);
                                    setSearchTerm('');
                                    setShowProductDropdown(false);
                                  }}
                                  className={cn(
                                    "w-full p-3 rounded-xl transition-all flex items-center justify-between border text-left",
                                    productActiveIndex === overallIdx 
                                      ? "bg-primary/10 border-primary/25 text-primary" 
                                      : "bg-transparent border-transparent hover:bg-background"
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "h-8 w-8 rounded-lg border flex items-center justify-center transition-all",
                                      productActiveIndex === overallIdx ? "text-primary border-primary/30 bg-primary/5" : "text-text/20 border-border"
                                    )}>
                                      <Package className="h-4 w-4" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-xs font-black">{product.name}</span>
                                      <span className="text-[8px] font-bold text-text/40 tracking-wide uppercase">
                                        Batch: {product.batchNumber || '—'} | Exp: {product.expiryDate ? formatDate(product.expiryDate) : '—'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className="text-xs font-black">{formatCurrency(product.sellingPrice)}</span>
                                    <Badge variant={product.stockQuantity > 5 ? 'success' : 'warning'} className="text-[8px] py-0 px-1 font-bold">
                                      {product.stockQuantity} {product.unit}
                                    </Badge>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {masterSuggestions.length > 0 && (
                        <div className="pt-2">
                          <div className="px-3 py-1.5 text-[8px] font-black text-primary bg-primary/5 uppercase tracking-widest flex justify-between items-center rounded-lg mb-1">
                            <span>From Master Database (250k+ Dataset)</span>
                            <span className="text-[7.5px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-black">Instant Bill & Stock</span>
                          </div>
                          <div className="space-y-1">
                            {masterSuggestions.slice(0, 10).map((med, idx) => {
                              const overallIdx = filteredProducts.length + idx;
                              return (
                                <button
                                  key={med.id || overallIdx}
                                  type="button"
                                  onMouseEnter={() => setProductActiveIndex(overallIdx)}
                                  onMouseDown={() => {
                                    handleSelectMasterMedicine(med);
                                  }}
                                  className={cn(
                                    "w-full p-3 rounded-xl transition-all flex items-center justify-between border text-left",
                                    productActiveIndex === overallIdx 
                                      ? "bg-primary/10 border-primary/25 text-primary" 
                                      : "bg-transparent border-transparent hover:bg-background"
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "h-8 w-8 rounded-lg border flex items-center justify-center transition-all",
                                      productActiveIndex === overallIdx ? "text-primary border-primary/30 bg-primary/5" : "text-text/20 border-border"
                                    )}>
                                      <Plus className="h-4 w-4" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-xs font-black flex items-center gap-1.5">
                                        {med.name}
                                        {med.unit && <span className="text-[8px] font-bold text-primary/70 bg-primary/5 px-1 rounded-sm">{med.unit}</span>}
                                      </span>
                                      <span className="text-[8.5px] font-bold text-text/40 tracking-wide">
                                        Brand: {med.brand || '—'} | Gen: {med.genericName || '—'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className="text-xs font-black">MRP: ₹{med.mrp || med.sellingPrice || 100}</span>
                                    <span className="text-[8px] font-black text-primary bg-primary/5 px-1 rounded">Auto Stock 100</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
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

              {/* In-Stock Medicines (Quick Add Catalog) */}
              <div className="space-y-2 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" />
                    In-Stock Medicines (Quick Add)
                  </span>
                  <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                    {products.filter(p => p.stockQuantity > 0).length} Items
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 max-h-[240px] overflow-y-auto pr-1 scrollbar-thin">
                  {products.filter(p => p.stockQuantity > 0).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        addToCart(p);
                      }}
                      className="p-2.5 rounded-xl border border-border bg-background/30 hover:border-primary/30 hover:bg-primary/5 transition-all flex items-center justify-between text-left group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-7 w-7 rounded-lg bg-primary/5 border border-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-all">
                          <Package className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-text truncate group-hover:text-primary transition-colors">{p.name}</p>
                          <p className="text-[9px] font-bold text-text/40 tracking-wide uppercase">
                            Batch: {p.batchNumber || '—'} | Exp: {p.expiryDate ? formatDate(p.expiryDate) : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-3">
                        <div>
                          <p className="text-xs font-black text-text">{formatCurrency(p.sellingPrice)}</p>
                          <span className={cn(
                            "text-[8px] font-bold px-1 py-0.5 rounded",
                            p.stockQuantity > 10 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                          )}>
                            Stock: {p.stockQuantity}
                          </span>
                        </div>
                        <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                          <Plus className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    </button>
                  ))}
                  {products.filter(p => p.stockQuantity > 0).length === 0 && (
                    <div className="text-center py-6 bg-background/10 rounded-xl border border-dashed border-border">
                      <Package className="h-5 w-5 text-text/20 mx-auto mb-1" />
                      <p className="text-[10px] font-bold text-text/40">No medicines in stock</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
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
                <div className="min-w-[850px]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-background/20 border-b border-border sticky top-0 z-10">
                        <th className="px-4 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest">Medicine</th>
                        <th className="px-3 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest text-center w-[110px]">Batch</th>
                        <th className="px-3 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest text-center w-[140px]">Mfg Date</th>
                        <th className="px-3 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest text-center w-[140px]">Expiry Date</th>
                        <th className="px-3 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest text-center w-[130px]">Qty</th>
                        <th className="px-3 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest text-right w-[110px]">Rate</th>
                        <th className="px-4 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest text-right w-[110px]">Price</th>
                        <th className="px-4 py-4 text-[10px] font-black text-text/40 uppercase tracking-widest text-center w-[60px]">Action</th>
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
                            <td className="px-4 py-3">
                              <span className="text-xs font-black text-text leading-tight block truncate max-w-[150px]">{item.name}</span>
                            </td>
                            <td className="px-2 py-3 text-center">
                              <input
                                type="text"
                                value={item.batchNumber || ''}
                                onChange={(e) => updateCartItemField(item.productId, 'batchNumber', e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-bold text-center focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
                                placeholder="Batch"
                              />
                            </td>
                            <td className="px-2 py-3 text-center">
                              <input
                                type="date"
                                value={formatDateForInput(item.manufacturingDate)}
                                onChange={(e) => updateCartItemField(item.productId, 'manufacturingDate', e.target.value ? new Date(e.target.value) : null)}
                                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-[11px] font-bold text-center focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
                              />
                            </td>
                            <td className="px-2 py-3 text-center">
                              <input
                                type="date"
                                value={formatDateForInput(item.expiryDate)}
                                onChange={(e) => updateCartItemField(item.productId, 'expiryDate', e.target.value ? new Date(e.target.value) : null)}
                                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-[11px] font-bold text-center focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
                              />
                            </td>
                            <td className="px-2 py-3">
                              <div className="flex items-center justify-center gap-1 bg-background/50 rounded-xl p-1 w-fit mx-auto border border-border">
                                <button 
                                  onClick={() => updateQuantity(item.productId, -1)}
                                  className="h-7 w-7 rounded-lg hover:bg-surface flex items-center justify-center text-text/40 hover:text-text transition-all shrink-0"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    updateCartItemField(item.productId, 'quantity', val);
                                  }}
                                  className="w-10 text-center bg-transparent text-xs font-black text-text focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button 
                                  onClick={() => updateQuantity(item.productId, 1)}
                                  className="h-7 w-7 rounded-lg hover:bg-surface flex items-center justify-center text-text/40 hover:text-text transition-all shrink-0"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-3 text-right">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-text/30 font-bold">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.price}
                                  onChange={(e) => updateCartItemField(item.productId, 'price', Number(e.target.value))}
                                  className="w-20 pl-5 pr-2 py-1.5 rounded-lg border border-border bg-background text-xs font-black text-right focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-col">
                                <span className="text-xs font-black text-text">{formatCurrency(item.total)}</span>
                                <span className="text-[8px] font-bold text-text/30 uppercase">Incl. GST</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button 
                                onClick={() => removeFromCart(item.productId)}
                                className="h-8 w-8 rounded-lg hover:bg-danger/10 text-text/20 hover:text-danger transition-all inline-flex items-center justify-center"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                      {cart.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-32 text-center">
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
