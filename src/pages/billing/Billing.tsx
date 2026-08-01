import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, onSnapshot, getDocs, where, limit, addDoc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Product, Customer, InvoiceItem, Invoice } from '../../types';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { 
  Search, 
  Trash2, 
  Plus, 
  User, 
  CreditCard, 
  Receipt, 
  AlertCircle,
  Package,
  ChevronDown,
  X,
  UserPlus,
  Send,
  Calendar,
  CheckCircle,
  Clock,
  QrCode,
  Smartphone,
  RefreshCw,
  FileText,
  Barcode,
  PauseCircle,
  Play,
  Keyboard,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { invoiceService } from '../../services/invoiceService';
import { customerService } from '../../services/customerService';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';
import { PageTransition } from '../../components/common/PageTransition';
import { useToast } from '../../context/ToastContext';
import { addMoney, calculateLineTax, formatCurrency, roundMoney, subtractMoney } from '../../utils/currency';
import { useAuth } from '../../context/AuthContext';
import { handleFirestoreError, OperationType } from '../../utils/firestore-errors';
import { toJsDate } from '../../utils/date';
import { getFefoAvailableBatch, getValidBatchQuantity } from '../../utils/stock';
import { calculateLossSale } from '../../utils/pricing';
import { useMedicineSuggestions } from '../../hooks/useMedicineSuggestions';
import type { MasterMedicine } from '../../services/medicineMasterService';
import { useBusinessMode } from '../../context/BusinessModeContext';
import { supportsRetail, supportsWholesale } from '../../utils/businessMode';
import { getSaleConversionFactor, resolveSalePrice, type SaleUnit } from '../../utils/wholesale';

type BillingSuggestion =
  | { type: 'inventory'; product: Product }
  | { type: 'catalogue'; medicine: MasterMedicine };

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

const EMPTY_BILL_ROW: InvoiceItem = {
  productId: '',
  name: '',
  quantity: 1,
  price: 0,
  gst: 0,
  total: 0
};

export default function Billing() {
  const { user } = useAuth();
  const { mode } = useBusinessMode();
  const { settings } = useSettings();
  const canCollectGst = Boolean(settings?.taxMode && settings?.gstNumber && (settings.gstRegistrationType || 'regular') === 'regular');
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const routeSaleMode = location.pathname.endsWith('/wholesale')
    ? 'wholesale'
    : location.pathname.endsWith('/retail')
      ? 'retail'
      : null;

  // Primary POS States
  const [loading, setLoading] = useState(false);
  const saveInProgressRef = useRef(false);
  const invoiceRequestIdRef = useRef<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [saleMode, setSaleMode] = useState<'retail' | 'wholesale'>(
    routeSaleMode || (mode === 'wholesale' ? 'wholesale' : 'retail')
  );

  useEffect(() => {
    if (routeSaleMode === 'wholesale' && !supportsWholesale(mode)) {
      navigate('/billing/retail', { replace: true });
      return;
    }
    if (routeSaleMode === 'retail' && !supportsRetail(mode)) {
      navigate('/billing/wholesale', { replace: true });
      return;
    }
    if (routeSaleMode === 'wholesale' && supportsWholesale(mode)) {
      setSaleMode('wholesale');
      return;
    }
    if (routeSaleMode === 'retail' && supportsRetail(mode)) {
      setSaleMode('retail');
      return;
    }
    setSaleMode(mode === 'wholesale' ? 'wholesale' : 'retail');
  }, [mode, navigate, routeSaleMode]);
  
  // Selection states
  const [selectedCustomer, setSelectedCustomer] = useState<Customer>(WALK_IN_CUSTOMER);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerActiveIndex, setCustomerActiveIndex] = useState(-1);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  
  // Inline Add Customer
  const [showInlineAddCustomer, setShowInlineAddCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Cart/Table Items
  const [cart, setCart] = useState<InvoiceItem[]>([
    { ...EMPTY_BILL_ROW }
  ]);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [productActiveIndex, setProductActiveIndex] = useState(-1);
  const medicineQueries = useMemo(
    () => Object.fromEntries(cart.map((item, index) => [String(index), item.name])),
    [cart]
  );
  const catalogueSuggestions = useMedicineSuggestions(medicineQueries, 10);

  // Collapsible Extra Details
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [discount, setDiscount] = useState<number>(0);
  const [customInvoiceDate, setCustomInvoiceDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Payment configuration
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'due' | 'partial'>('paid');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'credit'>('cash');

  // Success Confirmation modal
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState<any>(null);
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [hasHeldBill, setHasHeldBill] = useState(false);

  // Focus references
  const customerInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHasHeldBill(Boolean(sessionStorage.getItem('pharmaflow-held-bill')));
  }, []);

  // Load products, customers, and recent bills subscriptions
  useEffect(() => {
    if (!user?.tenantId) return;

    // Sub to Products
    const qProducts = query(
      collection(db, 'products'),
      where('tenantId', '==', user.tenantId)
    );
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
      setProducts(items);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    // Sub to Customers
    const qCustomers = query(
      collection(db, 'customers'),
      where('tenantId', '==', user.tenantId)
    );
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Customer));
      setCustomers(items);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'customers'));

    // Sub to Invoices for local history
    const qInvoices = query(
      collection(db, 'invoices'),
      where('tenantId', '==', user.tenantId),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice));
      setRecentInvoices(items);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invoices'));

    return () => {
      unsubProducts();
      unsubCustomers();
      unsubInvoices();
    };
  }, [user?.tenantId]);

  useEffect(() => {
    const recentCustomerIds = new Set(
      recentInvoices
        .filter(invoice => invoice.customerId && invoice.customerId !== 'walk-in')
        .map(invoice => invoice.customerId)
    );
    setRecentCustomers(customers.filter(customer => recentCustomerIds.has(customer.id)).slice(0, 4));
  }, [customers, recentInvoices]);

  // Cart Calculations
  const totals = useMemo(() => {
    const subtotal = addMoney(...cart.map(item => roundMoney(item.price * item.quantity)));
    const gstTotal = addMoney(...cart.map(item => roundMoney(item.gst * item.quantity)));
    const grandTotal = Math.max(0, subtractMoney(addMoney(subtotal, gstTotal), discount));
    
    return { subtotal, gstTotal, grandTotal };
  }, [cart, discount]);

  // Auto-calculated fields when Grand Total updates
  useEffect(() => {
    if (paymentStatus === 'paid') {
      setAmountReceived(totals.grandTotal.toString());
    } else if (paymentStatus === 'due') {
      setAmountReceived('0');
    }
  }, [totals.grandTotal, paymentStatus]);

  // Handle customer search suggestion filtering
  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return [];
    return customers.filter(c => 
      c.name.toLowerCase().includes(term) || 
      c.phone.includes(term)
    ).slice(0, 5);
  }, [customers, customerSearch]);

  const changeSaleMode = (nextMode: 'retail' | 'wholesale') => {
    navigate(`/billing/${nextMode}`, { replace: true });
    setSaleMode(nextMode);
    setCart(current => current.map(item => {
      const product = products.find(candidate => candidate.id === item.productId);
      if (!product) return item;
      const price = resolveSalePrice(product, nextMode, selectedCustomer);
      const gstRate = canCollectGst ? product.gstPercentage : 0;
      const lineTax = calculateLineTax({ quantity: item.quantity, rate: price, gstRate });
      return {
        ...item,
        price,
        gst: roundMoney(lineTax.tax / item.quantity),
        total: lineTax.total,
      };
    }));
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    if (mode === 'hybrid' && customer.pricingTier === 'wholesale') {
      setSaleMode('wholesale');
    }
    setCustomerSearch('');
    setShowCustomerDropdown(false);
    setCustomerActiveIndex(-1);
  };

  const handleCustomerSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showCustomerDropdown || filteredCustomers.length === 0) {
      if (e.key === 'Escape') setShowCustomerDropdown(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCustomerActiveIndex(prev => (prev + 1) % filteredCustomers.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCustomerActiveIndex(prev => (prev <= 0 ? filteredCustomers.length - 1 : prev - 1));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const index = customerActiveIndex >= 0 ? customerActiveIndex : 0;
      selectCustomer(filteredCustomers[index]);
      window.setTimeout(() => {
        document.querySelector<HTMLInputElement>('[data-billing-medicine="0"]')?.focus();
      }, 0);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowCustomerDropdown(false);
      setCustomerActiveIndex(-1);
    }
  };

  // Inline Customer Saving
  const handleSaveCustomerInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.tenantId) return;
    if (!newCustName.trim()) {
      showToast('Customer name is required.', 'danger');
      return;
    }
    const normalizedPhone = newCustPhone.replace(/\D/g, '');
    if (normalizedPhone && !/^\d{10}$/.test(normalizedPhone)) {
      showToast('Enter a valid 10-digit phone number or leave it blank.', 'danger');
      return;
    }
    
    setIsSavingCustomer(true);
    try {
      const customerId = await customerService.addCustomer(user.tenantId, {
        name: newCustName.trim(),
        phone: normalizedPhone,
        address: 'Counter Sale',
        pricingTier: saleMode === 'wholesale' ? 'wholesale' : 'retail',
        outstandingBalance: 0,
        totalPurchases: 0,
        totalPaid: 0,
      });

      const newCust: Customer = {
        id: customerId!,
        tenantId: user.tenantId,
        name: newCustName.trim(),
        phone: normalizedPhone,
        address: 'Counter Sale',
        pricingTier: saleMode === 'wholesale' ? 'wholesale' : 'retail',
        outstandingBalance: 0,
        totalPurchases: 0,
        totalPaid: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      selectCustomer(newCust);
      setCustomers(prev => prev.some(customer => customer.id === newCust.id) ? prev : [newCust, ...prev]);
      setRecentCustomers(prev => [newCust, ...prev.filter(customer => customer.id !== newCust.id)].slice(0, 4));
      setNewCustName('');
      setNewCustPhone('');
      setShowInlineAddCustomer(false);
      showToast(`Customer "${newCust.name}" added and selected!`, 'success');
      window.setTimeout(() => {
        document.querySelector<HTMLInputElement>('[data-billing-medicine="0"]')?.focus();
      }, 0);
    } catch (error: any) {
      showToast(error.message || 'Failed to save customer', 'danger');
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Add Item Row Instantly
  const handleAddItemRow = () => {
    setCart(prev => [
      ...prev,
      { ...EMPTY_BILL_ROW }
    ]);
  };

  // Remove Item Row Instantly
  const handleRemoveItemRow = (index: number) => {
    setCart(prev => {
      const copy = [...prev];
      copy.splice(index, 1);
      if (copy.length === 0) {
        return [{ ...EMPTY_BILL_ROW }];
      }
      return copy;
    });
  };

  // Autocomplete suggestions based on typed input for row index
  const getProductSuggestions = (rowName: string, rowIndex: number): BillingSuggestion[] => {
    const term = rowName.trim().toLowerCase();
    if (!term) return [];
    const inventory = products.filter(p =>
      p.name.toLowerCase().includes(term) || 
      (p.genericName && p.genericName.toLowerCase().includes(term)) ||
      (p.brand && p.brand.toLowerCase().includes(term)) ||
      (p.manufacturer && p.manufacturer.toLowerCase().includes(term)) ||
      p.sku?.toLowerCase().includes(term) ||
      p.barcode?.toLowerCase().includes(term)
    ).slice(0, 8).map(product => ({ type: 'inventory' as const, product }));
    const inventoryKeys = new Set(inventory.map(({ product }) =>
      `${product.name.trim().toLowerCase()}|${(product.manufacturer || '').trim().toLowerCase()}`
    ));
    const catalogue = (catalogueSuggestions[String(rowIndex)] || [])
      .filter(medicine => !inventoryKeys.has(
        `${medicine.name.trim().toLowerCase()}|${(medicine.manufacturer || '').trim().toLowerCase()}`
      ))
      .slice(0, 8)
      .map(medicine => ({ type: 'catalogue' as const, medicine }));
    return [...inventory, ...catalogue];
  };

  // Auto-fill row with selected product suggestion
  const handleSelectProductSuggestion = (index: number, product: Product) => {
    const fefoBatch = getFefoAvailableBatch(product.batches || []);
    const validStock = product.batches?.length
      ? getValidBatchQuantity(product.batches)
      : product.stockQuantity;
    if (product.stockQuantity <= 0 || validStock <= 0 || (product.batches?.length && !fefoBatch)) {
      showToast(`${product.name} has no saleable, non-expired batch stock.`, 'danger');
      return;
    }

    setCart(prev => prev.map((item, i) => {
      if (i === index) {
        const effectiveGstRate = canCollectGst ? product.gstPercentage : 0;
        const salePrice = resolveSalePrice(product, saleMode, selectedCustomer);
        const gstAmount = calculateLineTax({ quantity: 1, rate: salePrice, gstRate: effectiveGstRate }).tax;
        return {
          productId: product.id,
          name: product.name,
          sku: product.sku || '',
          batchNumber: fefoBatch?.batchNumber || product.batchNumber || '',
          expiryDate: fefoBatch?.expiryDate || product.expiryDate || null,
          manufacturingDate: fefoBatch?.mfgDate || product.manufacturingDate || null,
          quantity: 1,
          saleQuantity: 1,
          saleUnit: 'unit',
          conversionFactor: 1,
          price: salePrice,
          gst: gstAmount,
          total: addMoney(salePrice, gstAmount)
        };
      }
      return item;
    }));

    setFocusedRowIndex(null); // Close suggestions
    setProductActiveIndex(-1);
    showToast(`Loaded ${product.name}`, 'info');
  };

  const addScannedProduct = (product: Product) => {
    if (product.stockQuantity <= 0) {
      showToast(`${product.name} is out of stock!`, 'danger');
      return;
    }

    setCart(prev => {
      const existingIndex = prev.findIndex(item => item.productId === product.id);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        if (existing.quantity >= product.stockQuantity) {
          showToast(`Only ${product.stockQuantity} units available for ${product.name}.`, 'danger');
          return prev;
        }
        return prev.map((item, index) => index === existingIndex
          ? {
              ...item,
              quantity: item.quantity + 1,
              total: (item.quantity + 1) * (item.price + item.gst)
            }
          : item
        );
      }

      const effectiveGstRate = canCollectGst ? product.gstPercentage : 0;
      const gstAmount = (product.sellingPrice * effectiveGstRate) / 100;
      const scannedItem: InvoiceItem = {
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
      };
      const blankIndex = prev.findIndex(item => !item.productId && !item.name);
      if (blankIndex >= 0) {
        return prev.map((item, index) => index === blankIndex ? scannedItem : item);
      }
      return [...prev, scannedItem];
    });
    showToast(`${product.name} scanned`, 'success');
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeSearch.trim().toLowerCase();
    if (!code) return;
    const product = products.find(item =>
      item.barcode?.trim().toLowerCase() === code ||
      item.sku?.trim().toLowerCase() === code
    );
    if (!product) {
      showToast(`No product found for barcode/SKU: ${barcodeSearch}`, 'danger');
      barcodeInputRef.current?.select();
      return;
    }
    addScannedProduct(product);
    setBarcodeSearch('');
    barcodeInputRef.current?.focus();
  };

  const resetBill = () => {
    invoiceRequestIdRef.current = null;
    setCart([{ ...EMPTY_BILL_ROW }]);
    setSelectedCustomer(WALK_IN_CUSTOMER);
    setCustomerSearch('');
    setDiscount(0);
    setPaymentStatus('paid');
    setPaymentMethod('cash');
    setAmountReceived('');
    setCustomInvoiceDate(new Date().toISOString().split('T')[0]);
    if (mode === 'hybrid') setSaleMode('retail');
    setFocusedRowIndex(null);
    window.setTimeout(() => customerInputRef.current?.focus(), 0);
  };

  const holdCurrentBill = () => {
    const validItems = cart.filter(item => item.productId);
    if (validItems.length === 0) {
      showToast('Add at least one inventory item before holding this bill.', 'danger');
      return;
    }
    sessionStorage.setItem('pharmaflow-held-bill', JSON.stringify({
      cart,
      selectedCustomer,
      discount,
      paymentStatus,
      paymentMethod,
      amountReceived,
      customInvoiceDate,
      saleMode,
    }));
    setHasHeldBill(true);
    resetBill();
    showToast('Bill held safely. Use Recall Bill to continue it.', 'success');
  };

  const recallHeldBill = () => {
    const rawBill = sessionStorage.getItem('pharmaflow-held-bill');
    if (!rawBill) {
      showToast('No held bill is available.', 'info');
      return;
    }
    try {
      const heldBill = JSON.parse(rawBill);
      setCart(Array.isArray(heldBill.cart) && heldBill.cart.length ? heldBill.cart : [{ ...EMPTY_BILL_ROW }]);
      setSelectedCustomer(heldBill.selectedCustomer || WALK_IN_CUSTOMER);
      setDiscount(Number(heldBill.discount) || 0);
      setPaymentStatus(heldBill.paymentStatus || 'paid');
      setPaymentMethod(heldBill.paymentMethod || 'cash');
      setAmountReceived(heldBill.amountReceived || '');
      setCustomInvoiceDate(heldBill.customInvoiceDate || new Date().toISOString().split('T')[0]);
      if (
        heldBill.saleMode === 'wholesale' && supportsWholesale(mode)
        || heldBill.saleMode === 'retail' && supportsRetail(mode)
      ) {
        setSaleMode(heldBill.saleMode);
      }
      sessionStorage.removeItem('pharmaflow-held-bill');
      setHasHeldBill(false);
      showToast('Held bill restored.', 'success');
    } catch {
      sessionStorage.removeItem('pharmaflow-held-bill');
      setHasHeldBill(false);
      showToast('Held bill data was invalid and has been cleared.', 'danger');
    }
  };

  const handleProductKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    suggestions: BillingSuggestion[]
  ) => {
    if (suggestions.length > 0 && focusedRowIndex === index) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setProductActiveIndex(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setProductActiveIndex(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const activeIndex = productActiveIndex >= 0 ? productActiveIndex : 0;
        const selected = suggestions[activeIndex];
        if (selected.type === 'inventory') {
          handleSelectProductSuggestion(index, selected.product);
        } else {
          handleRowInputChange(index, 'name', selected.medicine.name);
          setFocusedRowIndex(null);
          setProductActiveIndex(-1);
          showToast(`${selected.medicine.name} catalogue mein hai, lekin sale ke liye pehle stock add karein.`, 'warning');
        }
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>(`[data-billing-quantity="${index}"]`)?.focus();
          document.querySelector<HTMLInputElement>(`[data-billing-quantity="${index}"]`)?.select();
        }, 0);
        return;
      }
    }

    if (e.key === 'Escape') {
      setFocusedRowIndex(null);
      setProductActiveIndex(-1);
    }
  };

  const focusBillingInput = (field: 'medicine' | 'quantity' | 'rate', index: number) => {
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-billing-${field}="${index}"]`);
      input?.focus();
      input?.select();
    }, 0);
  };

  const handleRateEnter = (index: number) => {
    if (index < cart.length - 1) {
      focusBillingInput('medicine', index + 1);
      return;
    }
    handleAddItemRow();
    focusBillingInput('medicine', index + 1);
  };

  // Input changes for direct inline table edits
  const handleRowInputChange = (index: number, field: string, value: any) => {
    setCart(prev => prev.map((item, i) => {
      if (i === index) {
        const updated = { ...item, [field]: value };
        const matchedProd = products.find(p => p.id === item.productId);

        if ((field === 'saleQuantity' || field === 'saleUnit') && matchedProd) {
          const saleUnit = (field === 'saleUnit' ? value : item.saleUnit || 'unit') as SaleUnit;
          const saleQuantity = Math.max(
            1,
            Math.floor(Number(field === 'saleQuantity' ? value : item.saleQuantity || 1))
          );
          const conversionFactor = getSaleConversionFactor(matchedProd, saleUnit);
          const quantity = saleQuantity * conversionFactor;
          const gstRate = canCollectGst ? matchedProd.gstPercentage : 0;
          updated.saleUnit = saleUnit;
          updated.saleQuantity = saleQuantity;
          updated.conversionFactor = conversionFactor;
          updated.quantity = quantity;
          updated.total = calculateLineTax({ quantity, rate: item.price, gstRate }).total;
          return updated;
        }
        
        // Recalculate calculations live if rates/quantities edit
        if (field === 'price' || field === 'quantity' || field === 'name') {
          const qty = field === 'quantity' ? Math.max(1, Number(value)) : item.quantity;
          const rate = field === 'price' ? Math.max(0, Number(value)) : item.price;
          
          // Use product's gst if product was resolved
          const gstRate = matchedProd ? matchedProd.gstPercentage : 0;
          const effectiveGstRate = canCollectGst ? gstRate : 0;
          const gstAmount = calculateLineTax({ quantity: 1, rate, gstRate: effectiveGstRate }).tax;
          
          updated.quantity = qty;
          updated.price = rate;
          updated.gst = gstAmount;
          updated.total = calculateLineTax({ quantity: qty, rate, gstRate: effectiveGstRate }).total;
        }
        return updated;
      }
      return item;
    }));
  };

  // Save the invoice to backend database
  const handleSaveInvoice = async () => {
    if (!user?.tenantId) return;
    if (saveInProgressRef.current) return;

    // Validate requirements
    if (selectedCustomer.id === 'walk-in' && paymentStatus !== 'paid') {
      showToast('Walk-in Customers must pay fully (Status: Paid). Choose or register a customer for Credit.', 'danger');
      return;
    }
    if (saleMode === 'wholesale' && selectedCustomer.id === 'walk-in') {
      showToast('Select a registered customer for a wholesale/B2B invoice.', 'danger');
      return;
    }

    const validItems = cart.filter(item => item.productId && item.quantity > 0);
    if (validItems.length === 0) {
      showToast('Please add at least one valid item from inventory autocomplete.', 'danger');
      return;
    }
    for (const item of validItems) {
      const product = products.find(candidate => candidate.id === item.productId);
      if (!product) {
        showToast(`Select ${item.name} again from inventory.`, 'danger');
        return;
      }
      if (!Number.isFinite(item.price) || item.price < 0) {
        showToast(`Enter a valid sale rate for ${item.name}.`, 'danger');
        return;
      }
    }
    const parsedAmtReceived = roundMoney(Number(amountReceived) || 0);
    if (paymentStatus === 'partial' && (parsedAmtReceived <= 0 || parsedAmtReceived >= totals.grandTotal)) {
      showToast('For a partial payment, received amount must be above zero and below the bill total.', 'danger');
      return;
    }

    saveInProgressRef.current = true;
    invoiceRequestIdRef.current ||= crypto.randomUUID();
    setLoading(true);
    try {
      const prefix = settings?.invoicePrefix || 'INV';
      const parsedAmtDue = Math.max(0, subtractMoney(totals.grandTotal, parsedAmtReceived));
      const selectedDate = new Date(`${customInvoiceDate}T12:00:00`);

      const invoiceData: any = {
        requestId: invoiceRequestIdRef.current,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerGstNumber: selectedCustomer.gstNumber || '',
        saleMode,
        items: validItems,
        subtotal: addMoney(...validItems.map(item => roundMoney(item.price * item.quantity))),
        gstTotal: addMoney(...validItems.map(item => roundMoney(item.gst * item.quantity))),
        discount: roundMoney(discount),
        grandTotal: totals.grandTotal,
        paymentStatus,
        paymentMethod,
        amountReceived: parsedAmtReceived,
        outstandingAmount: parsedAmtDue,
        invoiceDate: Timestamp.fromDate(selectedDate)
      };

      const saved = await invoiceService.saveInvoice(user.tenantId, invoiceData, prefix);
      
      // Store saved invoice details for the instant WhatsApp sharing flow
      setSavedInvoice({
        id: saved!.id,
        invoiceNumber: saved!.invoiceNumber,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        grandTotal: totals.grandTotal,
        items: validItems,
        paymentStatus,
        amountReceived: parsedAmtReceived,
        outstandingAmount: parsedAmtDue,
      });

      setShowSuccessModal(true);
      showToast('Bill successfully generated & saved to Khata records!', 'success');
      
      // Reset POS form
      resetBill();
    } catch (error: any) {
      console.error('Save failed:', error);
      showToast(error.message || 'Failed to process transaction', 'danger');
    } finally {
      saveInProgressRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleBillingShortcuts = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      } else if (event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        resetBill();
        showToast('New bill ready.', 'info');
      } else if (event.altKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        navigate('/invoices');
      } else if (event.key === 'F2') {
        event.preventDefault();
        handleSaveInvoice();
      }
    };
    window.addEventListener('keydown', handleBillingShortcuts);
    return () => window.removeEventListener('keydown', handleBillingShortcuts);
  }, [cart, selectedCustomer, discount, paymentStatus, paymentMethod, amountReceived, customInvoiceDate, totals.grandTotal]);

  // Build high-converting Indian regional billing summary and open WhatsApp
  const handleWhatsAppShare = () => {
    if (!savedInvoice) return;
    
    const storeName = settings?.storeName || 'Pharmacy Store';
    const cleanPhone = savedInvoice.customerPhone.replace(/\D/g, '');
    const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    
    // Format individual medicine lines nicely
    const itemLines = savedInvoice.items.map((item: any) => 
      `• ${item.name} (${item.quantity} x ₹${item.price}) = ₹${(item.total).toFixed(1)}`
    ).join('\n');

    const paymentText = savedInvoice.paymentStatus === 'paid' 
      ? `✅ FULLY PAID via ${paymentMethod.toUpperCase()}`
      : savedInvoice.paymentStatus === 'due'
        ? `⚠️ OUTSTANDING CREDIT: ₹${savedInvoice.grandTotal}`
        : `🔸 PARTIAL: Received ₹${savedInvoice.amountReceived}, Due ₹${savedInvoice.outstandingAmount}`;

    const textMessage = 
`*Bill from ${storeName}*
-----------------------------
🧾 *Invoice:* ${savedInvoice.invoiceNumber}
👤 *Customer:* ${savedInvoice.customerName}
📱 *Phone:* ${savedInvoice.customerPhone}
-----------------------------
*Items:*
${itemLines}

*Grand Total:* ₹${savedInvoice.grandTotal.toFixed(1)}
*Payment:* ${paymentText}
-----------------------------
Thank you for your visit! 🙏
_Powered by PharmaFlow_`;

    const encodedText = encodeURIComponent(textMessage);
    const waUrl = `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodedText}`;
    
    // Use an elegant anchor element injection to safely bypass iframe window popup blocks
    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <PageTransition>
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6 pb-20">
        
        {/* ERP sale header */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary text-white flex items-center justify-center">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-text tracking-tight">Sale Bill</h1>
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.18em]">Pharma Counter Billing</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/invoices')}
              className="rounded-2xl h-11 text-xs font-bold border-border hover:bg-background flex items-center gap-2"
            >
              <FileText className="h-4 w-4 text-text/60" />
              View Full History
            </Button>
            <div className="h-11 px-4 rounded-2xl bg-primary/5 text-primary text-xs font-black uppercase flex items-center gap-2">
              <span className="h-2.5 w-2.5 bg-success rounded-full animate-pulse" />
              Realtime Inventory Sync
            </div>
          </div>
          </div>

          <div className="border-t border-border bg-background/40 px-4 py-2.5 flex flex-wrap items-center gap-2">
            {supportsRetail(mode) && supportsWholesale(mode) && (
              <div className="flex rounded-lg border border-border bg-surface p-0.5">
                {(['retail', 'wholesale'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => changeSaleMode(option)}
                    className={cn(
                      'h-7 rounded-md px-3 text-[10px] font-black uppercase transition-colors',
                      saleMode === option ? 'bg-primary text-white' : 'text-text/50 hover:text-primary'
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            <Badge variant={saleMode === 'wholesale' ? 'warning' : 'success'} className="text-[9px] font-black uppercase">
              {saleMode === 'wholesale' ? 'B2B Wholesale Invoice' : 'Retail Invoice'}
            </Badge>
            <button type="button" onClick={resetBill} className="h-8 px-3 rounded-lg border border-border bg-surface text-[10px] font-black text-text/60 hover:text-primary hover:border-primary/30 flex items-center gap-1.5 transition-colors [&_kbd]:text-[8px] [&_kbd]:text-text/30">
              <RotateCcw className="h-3.5 w-3.5" /> New Bill <kbd>Alt+N</kbd>
            </button>
            <button type="button" onClick={holdCurrentBill} className="h-8 px-3 rounded-lg border border-border bg-surface text-[10px] font-black text-text/60 hover:text-primary hover:border-primary/30 flex items-center gap-1.5 transition-colors [&_kbd]:text-[8px] [&_kbd]:text-text/30">
              <PauseCircle className="h-3.5 w-3.5" /> Hold Bill
            </button>
            <button
              type="button"
              onClick={recallHeldBill}
              disabled={!hasHeldBill}
              className="h-8 px-3 rounded-lg border border-border bg-surface text-[10px] font-black text-text/60 hover:text-primary hover:border-primary/30 flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="h-3.5 w-3.5" /> Recall Bill
            </button>
            <button type="button" onClick={() => navigate('/invoices')} className="h-8 px-3 rounded-lg border border-border bg-surface text-[10px] font-black text-text/60 hover:text-primary hover:border-primary/30 flex items-center gap-1.5 transition-colors [&_kbd]:text-[8px] [&_kbd]:text-text/30">
              <FileText className="h-3.5 w-3.5" /> Bill List <kbd>Alt+M</kbd>
            </button>
            <span className="ml-auto hidden lg:flex items-center gap-1.5 text-[10px] font-bold text-text/40">
              <Keyboard className="h-3.5 w-3.5" /> Enter/Tab moves forward • F2 saves
            </span>
          </div>
        </div>

        {/* Core Billing Console GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Main POS column: Customers and Item Table */}
          <div className="lg:col-span-8 space-y-6">

            {/* Fast barcode scanning */}
            <form onSubmit={handleBarcodeSubmit} className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 min-w-fit">
                <div className="h-9 w-9 rounded-lg bg-primary text-white flex items-center justify-center">
                  <Barcode className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-text uppercase">Fast Scan</p>
                  <p className="text-[9px] font-bold text-text/40">Barcode or SKU <kbd>Ctrl+B</kbd></p>
                </div>
              </div>
              <input
                ref={barcodeInputRef}
                value={barcodeSearch}
                onChange={(event) => setBarcodeSearch(event.target.value)}
                placeholder="Scan barcode and press Enter..."
                className="h-10 flex-1 rounded-xl border border-border bg-surface px-4 text-sm font-black outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
              <Button type="submit" variant="primary" className="h-10 rounded-xl px-5 text-xs font-black">
                Add Item
              </Button>
            </form>
            
            {/* 1. CUSTOMER SELECT & FAST RE-SELECTION */}
            <Card className="p-6 border-border bg-surface relative overflow-visible shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="text-xs font-black text-text/60 uppercase tracking-widest">Customer Account</h3>
                </div>
                {selectedCustomer.id !== 'walk-in' && (
                  <Badge variant="warning" className="text-[10px] font-black uppercase py-0.5">
                    Credit Active (Udhaar Mode)
                  </Badge>
                )}
              </div>

              {/* Autocomplete Input */}
              <div className="relative">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/30" />
                    <input
                      ref={customerInputRef}
                      type="text"
                      placeholder="Search customers by Name or Phone..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                        setCustomerActiveIndex(-1);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onKeyDown={handleCustomerSearchKeyDown}
                      role="combobox"
                      aria-expanded={showCustomerDropdown}
                      aria-controls="billing-customer-options"
                      aria-autocomplete="list"
                      className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                    />
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => setShowInlineAddCustomer(!showInlineAddCustomer)}
                    className={cn(
                      "h-[48px] px-4 rounded-2xl border flex items-center gap-2 font-bold text-xs transition-all",
                      showInlineAddCustomer 
                        ? "bg-danger/10 border-danger/30 text-danger" 
                        : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                    )}
                  >
                    <UserPlus className="h-4 w-4" />
                    {showInlineAddCustomer ? 'Cancel' : '+ New Customer'}
                  </button>
                </div>

                {/* Search suggestion box */}
                <AnimatePresence>
                  {showCustomerDropdown && customerSearch.trim() && (
                    <motion.div
                      id="billing-customer-options"
                      role="listbox"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="absolute left-0 right-0 top-full mt-2 z-50 bg-surface border border-border rounded-2xl shadow-xl overflow-hidden p-2 space-y-1"
                    >
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((cust, index) => (
                          <button
                            key={cust.id}
                            type="button"
                            role="option"
                            aria-selected={customerActiveIndex === index}
                            onMouseEnter={() => setCustomerActiveIndex(index)}
                            onClick={() => selectCustomer(cust)}
                            className={cn(
                              "w-full p-3 rounded-xl hover:bg-background text-left flex items-center justify-between transition-colors",
                              customerActiveIndex === index && "bg-primary/10"
                            )}
                          >
                            <div>
                              <p className="text-xs font-black text-text">{cust.name}</p>
                              <p className="text-[10px] font-bold text-text/40">{cust.phone}</p>
                            </div>
                            {cust.outstandingBalance > 0 && (
                              <Badge variant="danger" className="text-[9px]">
                                Due: ₹{cust.outstandingBalance}
                              </Badge>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-xs font-bold text-text/30">No customer found</p>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCustName(customerSearch);
                              setShowInlineAddCustomer(true);
                              setShowCustomerDropdown(false);
                            }}
                            className="text-xs font-black text-primary mt-2 uppercase hover:underline"
                          >
                            + Add &quot;{customerSearch}&quot; Immediately
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Inline customer addition panel */}
              <AnimatePresence>
                {showInlineAddCustomer && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={handleSaveCustomerInline}
                    className="mt-4 p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-3 overflow-hidden"
                  >
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">Add New customer</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Customer Full Name"
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-xs font-bold"
                        required
                      />
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="Mobile Number (optional)"
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-xs font-bold"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => setShowInlineAddCustomer(false)}
                        className="rounded-xl font-bold"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        type="submit"
                        isLoading={isSavingCustomer}
                        className="rounded-xl font-black uppercase text-[10px] tracking-wider px-6"
                      >
                        Save & Select Customer
                      </Button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Fast Re-selection / Recently billed */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black text-text/30 uppercase tracking-widest mr-1">Recently Billed:</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(WALK_IN_CUSTOMER);
                    showToast('Counter Sale selected', 'info');
                  }}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
                    selectedCustomer.id === 'walk-in'
                      ? "bg-primary border-primary text-white shadow-md shadow-primary/10"
                      : "bg-background border-border text-text/60 hover:border-text/20"
                  )}
                >
                  🏪 Counter Walk-In
                </button>
                {recentCustomers.map(cust => (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(cust);
                      showToast(`Customer selected: ${cust.name}`, 'info');
                    }}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-bold border transition-all",
                      selectedCustomer.id === cust.id
                        ? "bg-primary border-primary text-white shadow-md shadow-primary/10"
                        : "bg-background border-border text-text/60 hover:border-text/20"
                    )}
                  >
                    👤 {cust.name}
                  </button>
                ))}
              </div>
            </Card>

            {/* 2. TABLE-STYLE FAST ITEM ENTRY */}
            <Card className="border-border bg-surface overflow-hidden shadow-sm">
              <div className="p-6 pb-0 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="h-5 w-5 text-primary" />
                  <h3 className="text-xs font-black text-text/60 uppercase tracking-widest">Bill Line Items</h3>
                </div>
                <Badge variant="success" className="mb-4 text-[10px] font-black">
                  {cart.filter(item => item.productId).length} items added
                </Badge>
              </div>

              {/* Desktop Scrollable Table */}
              <div className="overflow-x-auto min-h-[250px]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-background/40 border-b border-border">
                      <th className="px-4 py-3 text-left text-[10px] font-black text-text/40 uppercase tracking-widest w-12 text-center">#</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-text/40 uppercase tracking-widest min-w-[200px]">Medicine / Item Name</th>
                      <th className="px-4 py-3 text-center text-[10px] font-black text-text/40 uppercase tracking-widest w-40">Quantity / Pack</th>
                      <th className="px-4 py-3 text-right text-[10px] font-black text-text/40 uppercase tracking-widest w-32">Rate (₹)</th>
                      <th className="px-4 py-3 text-right text-[10px] font-black text-text/40 uppercase tracking-widest w-32">Amount (₹)</th>
                      <th className="px-4 py-3 text-center text-[10px] font-black text-text/40 uppercase tracking-widest w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {cart.map((item, index) => {
                      const suggestions = getProductSuggestions(item.name, index);
                      const selectedProduct = products.find(candidate => candidate.id === item.productId);
                      const selectedBatch = selectedProduct?.batches?.find(
                        batch => batch.batchNumber === item.batchNumber
                      );
                      const purchaseRate = Number(
                        selectedBatch?.purchasePrice ?? selectedProduct?.purchasePrice ?? 0
                      );
                      const lossSale = calculateLossSale(item.price, purchaseRate, item.quantity);
                      return (
                        <tr key={index} className="hover:bg-background/10 transition-colors relative">
                          {/* Row Index */}
                          <td className="px-4 py-3.5 text-center text-xs font-black text-text/30">
                            {index + 1}
                          </td>
                          
                          {/* Item Autocomplete Name Cell */}
                          <td className="px-4 py-3.5 relative">
                            <input
                              data-billing-medicine={index}
                              type="text"
                              placeholder="Search medicine / barcode / SKU..."
                              value={item.name}
                              onChange={(e) => {
                                handleRowInputChange(index, 'name', e.target.value);
                                setFocusedRowIndex(index);
                                setProductActiveIndex(-1);
                              }}
                              onFocus={() => {
                                setFocusedRowIndex(index);
                                setProductActiveIndex(-1);
                              }}
                              onKeyDown={(e) => handleProductKeyDown(e, index, suggestions)}
                              role="combobox"
                              aria-expanded={focusedRowIndex === index && suggestions.length > 0}
                              aria-autocomplete="list"
                              className="w-full bg-transparent border-none text-xs font-black text-text focus:outline-none focus:ring-0 placeholder:text-text/20"
                            />
                            
                            {/* Auto-fill dropdown for this specific row */}
                            <AnimatePresence>
                              {focusedRowIndex === index && item.name.trim() && suggestions.length > 0 && (
                                <motion.div
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 5 }}
                                  className="absolute left-4 right-4 top-full mt-1.5 z-40 bg-surface border border-border rounded-2xl shadow-2xl p-1 space-y-0.5 max-h-60 overflow-y-auto"
                                >
                                  {suggestions.map((suggestion, suggestionIndex) => {
                                    const isInventory = suggestion.type === 'inventory';
                                    const medicine = isInventory ? suggestion.product : suggestion.medicine;
                                    return (
                                    <button
                                      key={isInventory
                                        ? suggestion.product.id
                                        : `catalogue-${medicine.name}-${medicine.manufacturer || ''}`}
                                      type="button"
                                      role="option"
                                      aria-selected={productActiveIndex === suggestionIndex}
                                      onMouseEnter={() => setProductActiveIndex(suggestionIndex)}
                                      onClick={() => {
                                        if (isInventory) {
                                          handleSelectProductSuggestion(index, suggestion.product);
                                        } else {
                                          handleRowInputChange(index, 'name', suggestion.medicine.name);
                                          setFocusedRowIndex(null);
                                          setProductActiveIndex(-1);
                                          showToast('Catalogue medicine selected. Add its stock before making a sale.', 'warning');
                                        }
                                      }}
                                      className={cn(
                                        "w-full p-2.5 hover:bg-background rounded-xl text-left flex items-center justify-between transition-colors",
                                        productActiveIndex === suggestionIndex && "bg-primary/10"
                                      )}
                                    >
                                      <div>
                                        <p className="text-xs font-black text-text">{medicine.name}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5 text-[9px] font-bold text-text/30 uppercase">
                                          {isInventory ? (
                                            <>
                                              <span>Batch: {suggestion.product.batchNumber}</span>
                                              <span>•</span>
                                              <span>Exp: {suggestion.product.expiryDate ? toJsDate(suggestion.product.expiryDate).toLocaleDateString() : 'N/A'}</span>
                                            </>
                                          ) : (
                                            <span>Catalogue · Mfg: {suggestion.medicine.manufacturer || 'Not listed'} · Add stock before sale</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        {isInventory ? (
                                          <>
                                            <p className="text-xs font-black text-primary">
                                              ₹{resolveSalePrice(suggestion.product, saleMode, selectedCustomer)}
                                            </p>
                                            <p className={cn(
                                              "text-[9px] font-bold uppercase",
                                              suggestion.product.stockQuantity <= 5 ? "text-danger" : "text-success"
                                            )}>
                                              Stock: {suggestion.product.stockQuantity}
                                            </p>
                                          </>
                                        ) : (
                                          <p className="text-[9px] font-black uppercase text-warning">Catalogue only</p>
                                        )}
                                      </div>
                                    </button>
                                  )})}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </td>

                          {/* Quantity Cell */}
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1 bg-background/50 rounded-lg p-0.5 border border-border w-max mx-auto">
                              <button
                                type="button"
                                onClick={() => handleRowInputChange(
                                  index,
                                  saleMode === 'wholesale' ? 'saleQuantity' : 'quantity',
                                  Math.max(1, saleMode === 'wholesale'
                                    ? Number(item.saleQuantity || 1) - 1
                                    : item.quantity - 1)
                                )}
                                className="h-6 w-6 rounded flex items-center justify-center text-xs text-text/60 hover:bg-background font-black"
                              >
                                -
                              </button>
                              <input
                                data-billing-quantity={index}
                                type="number"
                                min={1}
                                value={saleMode === 'wholesale' ? item.saleQuantity || 1 : item.quantity}
                                onChange={(e) => handleRowInputChange(
                                  index,
                                  saleMode === 'wholesale' ? 'saleQuantity' : 'quantity',
                                  e.target.value
                                )}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    focusBillingInput('rate', index);
                                  }
                                }}
                                className="w-8 bg-transparent text-center text-xs font-black focus:outline-none focus:ring-0 border-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleRowInputChange(
                                  index,
                                  saleMode === 'wholesale' ? 'saleQuantity' : 'quantity',
                                  saleMode === 'wholesale'
                                    ? Number(item.saleQuantity || 1) + 1
                                    : item.quantity + 1
                                )}
                                className="h-6 w-6 rounded flex items-center justify-center text-xs text-text/60 hover:bg-background font-black"
                              >
                                +
                              </button>
                              {saleMode === 'wholesale' && selectedProduct && (
                                <select
                                  value={item.saleUnit || 'unit'}
                                  onChange={event => handleRowInputChange(index, 'saleUnit', event.target.value)}
                                  className="h-7 rounded-md border-0 bg-surface px-1 text-[9px] font-black uppercase outline-none"
                                  aria-label={`Sale unit for ${item.name}`}
                                >
                                  <option value="unit">{selectedProduct.unit || 'Unit'}</option>
                                  {(selectedProduct.unitsPerPack || 1) > 1 && <option value="pack">Pack</option>}
                                  {(selectedProduct.packsPerCase || 1) > 1 && <option value="case">Case</option>}
                                </select>
                              )}
                            </div>
                            {saleMode === 'wholesale' && item.quantity > 1 && (
                              <p className="mt-1 text-[8px] font-bold text-text/35">
                                Deducts {item.quantity} base units
                              </p>
                            )}
                          </td>

                          {/* Rate Cell */}
                          <td className="px-4 py-3.5 text-right font-bold text-xs">
                            <input
                              data-billing-rate={index}
                              type="number"
                              min={0}
                              value={item.price || ''}
                              placeholder="0"
                              onChange={(e) => handleRowInputChange(index, 'price', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleRateEnter(index);
                                }
                              }}
                              aria-invalid={lossSale.isLoss}
                              className={cn(
                                "w-20 bg-transparent text-right text-xs font-black focus:outline-none border-none p-0 outline-none",
                                lossSale.isLoss && "text-danger"
                              )}
                            />
                            {lossSale.isLoss && (
                              <div
                                role="alert"
                                className="mt-1 ml-auto w-max max-w-40 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-right text-[9px] font-black leading-tight text-danger"
                              >
                                LOSS {formatCurrency(lossSale.lossPerUnit)}/unit
                                <span className="block">
                                  {formatCurrency(lossSale.totalLoss)} total
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Amount (GST calculated) */}
                          <td className="px-4 py-3.5 text-right font-black text-xs text-text">
                            ₹{item.total ? item.total.toFixed(2) : '0.00'}
                          </td>

                          {/* Row Remove */}
                          <td className="px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(index)}
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-text/20 hover:text-danger hover:bg-danger/10 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer: Instant Item Insertion */}
              <div className="p-4 bg-background/20 border-t border-border flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  className="px-5 py-3 rounded-2xl bg-primary text-white font-black text-xs flex items-center gap-2 hover:bg-primary/95 transition-all shadow-md shadow-primary/10"
                >
                  <Plus className="h-4 w-4" />
                  Add Medicine Row Instantly
                </button>
                <div className="text-right flex items-center gap-2">
                  <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">Running Total:</span>
                  <span className="text-lg font-black text-text">
                    {formatCurrency(totals.subtotal + totals.gstTotal)}
                  </span>
                </div>
              </div>
            </Card>

            {/* 3. OPTIONAL COLLAPSIBLE SECTION */}
            <div className="border border-border/60 bg-surface rounded-3xl overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setShowMoreDetails(!showMoreDetails)}
                className="w-full p-5 flex items-center justify-between font-black text-xs text-text/60 uppercase tracking-widest hover:bg-background/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>Configure Bill details (Discount, Custom Date, Tax)</span>
                </div>
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", showMoreDetails ? "rotate-180" : "")} />
              </button>

              <AnimatePresence>
                {showMoreDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-6 border-t border-border bg-background/20 grid grid-cols-1 md:grid-cols-3 gap-4"
                  >
                    <div>
                      <label className="block text-[9px] font-black text-text/40 uppercase tracking-widest mb-1.5">Discount Value (₹)</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Enter direct discount in Rupees..."
                        value={discount || ''}
                        onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                        className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-xs font-bold outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-text/40 uppercase tracking-widest mb-1.5">Custom Invoice Date</label>
                      <input
                        type="date"
                        value={customInvoiceDate}
                        onChange={(e) => setCustomInvoiceDate(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-xs font-bold outline-none text-text/60"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-text/40 uppercase tracking-widest mb-1.5">GST Calculation Mode</label>
                      <div className="flex items-center gap-2 h-11 px-4 rounded-xl border border-border bg-surface">
                        <span className="h-2 w-2 bg-success rounded-full" />
                        <span className="text-xs font-bold text-text/60">
                          {canCollectGst ? 'Automated Tax Rules ON' : 'GST collection disabled'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* Right sidebar column: Checkout and payment settings (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* CHECKOUT CARD */}
            <Card className="p-6 border-border bg-surface relative overflow-hidden shadow-md flex flex-col justify-between min-h-[450px]">
              
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <h3 className="text-xs font-black text-text/60 uppercase tracking-widest">Billing & Payment</h3>
                </div>

                {/* Subtotal stack */}
                <div className="space-y-3.5 border-b border-border pb-6">
                  <div className="flex justify-between items-center text-xs font-bold text-text/40">
                    <span>Subtotal</span>
                    <span>{formatCurrency(totals.subtotal)}</span>
                  </div>
                  {totals.gstTotal > 0 && (
                    <div className="flex justify-between items-center text-xs font-bold text-text/40">
                      <span>GST Component</span>
                      <span>{formatCurrency(totals.gstTotal)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between items-center text-xs font-bold text-danger">
                      <span>Discount Coupon</span>
                      <span>-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  
                  {/* Huge Grand Total Display */}
                  <div className="pt-2 flex justify-between items-baseline">
                    <span className="text-sm font-black text-text uppercase">Total Amount</span>
                    <span className="text-3xl font-black text-primary tracking-tight">
                      {formatCurrency(totals.grandTotal)}
                    </span>
                  </div>
                </div>

                {/* PAYMENT STATUS TOGGLES */}
                <div className="pt-6 space-y-4">
                  <label className="block text-[9px] font-black text-text/40 uppercase tracking-widest">Payment Status (Khata Entry)</label>
                  
                  <div className="grid grid-cols-3 gap-2">
                    {(['paid', 'due', 'partial'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          setPaymentStatus(status);
                          if (status === 'paid') {
                            setPaymentMethod('cash');
                          } else if (status === 'due') {
                            setPaymentMethod('credit');
                          }
                        }}
                        className={cn(
                          "py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all",
                          paymentStatus === status 
                            ? "bg-primary border-primary text-white shadow-md shadow-primary/10" 
                            : "bg-background border-border text-text/60 hover:border-text/20"
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>

                  {/* Partial configuration options */}
                  <AnimatePresence>
                    {paymentStatus === 'partial' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 pt-2 overflow-hidden"
                      >
                        <div>
                          <label className="block text-[9px] font-black text-text/30 uppercase tracking-widest mb-1">Amount Received (₹)</label>
                          <input
                            type="number"
                            min={0}
                            max={totals.grandTotal}
                            value={amountReceived}
                            onChange={(e) => setAmountReceived(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm font-black outline-none focus:border-primary text-text"
                          />
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold text-text/40 bg-background/50 p-2.5 rounded-xl border border-border">
                          <span>Balance Due (Udhaar Ledger)</span>
                          <span className="text-danger font-black">
                            {formatCurrency(Math.max(0, totals.grandTotal - (Number(amountReceived) || 0)))}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Payment Mode */}
                  {paymentStatus !== 'due' && (
                    <div className="space-y-2 pt-2">
                      <label className="block text-[9px] font-black text-text/40 uppercase tracking-widest">Payment Method</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['cash', 'upi', 'card'] as const).map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setPaymentMethod(method)}
                            className={cn(
                              "py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all flex flex-col items-center justify-center gap-1",
                              paymentMethod === method 
                                ? "bg-text border-text text-white" 
                                : "bg-background border-border text-text/60 hover:border-text/20"
                            )}
                          >
                            {method === 'upi' ? <QrCode className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                            <span>{method}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* SAVE AND SHARE CTA BUTTON */}
              <div className="pt-6">
                <Button
                  variant="primary"
                  type="button"
                  onClick={handleSaveInvoice}
                  isLoading={loading}
                  className="w-full py-4.5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center justify-center gap-2 bg-success text-white border-transparent hover:bg-success/95"
                >
                  <Send className="h-5 w-5" />
                  Save & Share Bill
                </Button>
              </div>

            </Card>

          </div>

        </div>

        {/* 4. HISTORY VIEW: SIMPLE LIST AT THE BOTTOM */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h3 className="text-xs font-black text-text/60 uppercase tracking-widest">Recent POS Transactions</h3>
          </div>
          
          <Card className="overflow-hidden border-border bg-surface shadow-sm">
            <div className="divide-y divide-border/40">
              {recentInvoices.slice(0, 5).map((inv) => {
                const isPaid = inv.paymentStatus === 'paid';
                return (
                  <div
                    key={inv.id}
                    onClick={() => navigate(`/invoice/${inv.id}`)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-background/20 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-9 w-9 rounded-xl flex items-center justify-center text-xs font-black uppercase",
                        isPaid ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                      )}>
                        {isPaid ? 'PA' : 'UD'}
                      </div>
                      <div>
                        <p className="text-sm font-black text-text group-hover:text-primary transition-colors">
                          {inv.customerName}
                        </p>
                        <p className="text-[10px] font-bold text-text/30 uppercase tracking-wider">
                          Invoice: {inv.invoiceNumber} • {toJsDate(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end gap-6">
                      <div className="text-left sm:text-right">
                        <p className="text-sm font-black text-text">{formatCurrency(inv.grandTotal)}</p>
                        <p className="text-[9px] font-bold text-text/30 uppercase">
                          {inv.paymentMethod}
                        </p>
                      </div>
                      <Badge 
                        variant={isPaid ? 'success' : 'danger'}
                        className="font-black text-[9px] uppercase tracking-wider py-0.5"
                      >
                        {inv.paymentStatus}
                      </Badge>
                    </div>
                  </div>
                );
              })}
              
              {recentInvoices.length === 0 && (
                <div className="p-8 text-center text-xs font-bold text-text/30">
                  No billing transactions logged yet. Let&apos;s start!
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* COMPLETED SUCCESS DIALOG / MODAL (SAFE TO BYPASS IFRAME BLOCKS) */}
        <AnimatePresence>
          {showSuccessModal && savedInvoice && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-surface border border-border rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-6"
              >
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="h-14 w-14 rounded-full bg-success/10 flex items-center justify-center text-success">
                    <CheckCircle className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-black text-text tracking-tight uppercase">Invoice Saved Successfully!</h3>
                  <p className="text-xs font-bold text-text/40">
                    Invoice #{savedInvoice.invoiceNumber} registered in Ledger.
                  </p>
                </div>

                {/* mini slip layout */}
                <div className="p-4 rounded-2xl bg-background border border-border space-y-2.5">
                  <div className="flex justify-between text-xs font-bold text-text/40">
                    <span>Customer:</span>
                    <span className="text-text font-black">{savedInvoice.customerName}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-text/40">
                    <span>Outstanding:</span>
                    <span className={cn("font-black", savedInvoice.outstandingAmount > 0 ? "text-danger" : "text-success")}>
                      ₹{savedInvoice.outstandingAmount.toFixed(1)}
                    </span>
                  </div>
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-black text-text/60">Total Amount:</span>
                    <span className="text-xl font-black text-primary">₹{savedInvoice.grandTotal.toFixed(1)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={handleWhatsAppShare}
                    className="w-full py-3.5 rounded-xl bg-success text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-success/10 hover:bg-success/95 transition-all flex items-center justify-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    Instant WhatsApp Share
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSuccessModal(false);
                      navigate(`/invoice/${savedInvoice.id}`);
                    }}
                    className="w-full py-3 rounded-xl border border-border hover:bg-background text-text/60 font-bold text-xs transition-colors"
                  >
                    View Invoice PDF / Receipt
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSuccessModal(false)}
                    className="w-full py-3 rounded-xl hover:bg-background text-text font-black text-xs uppercase tracking-widest transition-colors"
                  >
                    Start New Bill
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </PageTransition>
  );
}
