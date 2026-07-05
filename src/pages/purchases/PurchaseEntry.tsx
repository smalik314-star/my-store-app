import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseService } from '../../services/purchaseService';
import { productService } from '../../services/productService';
import { brandService } from '../../services/brandService';
import { Supplier, Product, PurchaseItem, ProductBatch } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/PageTransition';
import { formatCurrency } from '../../utils/currency';
import { toJsDate } from '../../utils/date';
import { Timestamp } from 'firebase/firestore';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  UserPlus, 
  X, 
  Search, 
  FileText, 
  Percent, 
  ChevronDown, 
  HelpCircle 
} from 'lucide-react';

const MONTHS = [
  { value: '01', label: 'Jan (01)' },
  { value: '02', label: 'Feb (02)' },
  { value: '03', label: 'Mar (03)' },
  { value: '04', label: 'Apr (04)' },
  { value: '05', label: 'May (05)' },
  { value: '06', label: 'Jun (06)' },
  { value: '07', label: 'Jul (07)' },
  { value: '08', label: 'Aug (08)' },
  { value: '09', label: 'Sep (09)' },
  { value: '10', label: 'Oct (10)' },
  { value: '11', label: 'Nov (11)' },
  { value: '12', label: 'Dec (12)' },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 30 }, (_, i) => currentYear - 5 + i);

interface FormItem {
  id: string; // client-side temp id
  productId: string;
  productName: string;
  brand: string;
  category: string;
  manufacturer: string;
  unit: string;
  gstPercentage: number;
  minimumStock: number;
  
  batchNumber: string;
  mfgMonth: string;
  mfgYear: string;
  expMonth: string;
  expYear: string;
  purchasePrice: number;
  salePrice: number;
  mrp: number;
  discount: number;
  quantity: number;
  
  showSuggestions: boolean;
  searchQuery: string;
}

export default function PurchaseEntry() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Master Data State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form Header State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Form Items State
  const [items, setItems] = useState<FormItem[]>([createEmptyItem()]);

  // Inline Supplier Add Modal State
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierGst, setNewSupplierGst] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');
  const [newSupplierEmail, setNewSupplierEmail] = useState('');

  // Autofill Modal State
  const [autofillModal, setAutofillModal] = useState<{
    itemIdx: number;
    product: Product;
  } | null>(null);

  useEffect(() => {
    if (!user?.tenantId) return;
    loadMasterData();
  }, [user]);

  const loadMasterData = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    try {
      const supps = await purchaseService.getSuppliers(user.tenantId);
      setSuppliers(supps);

      // Subscribe to all products for super fast offline searching
      const unsubscribe = productService.subscribeToProducts(user.tenantId, (loadedProducts) => {
        setProducts(loadedProducts);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error loading master data:', error);
      showToast('Error initializing form data', 'danger');
      setLoading(false);
    }
  };

  function createEmptyItem(): FormItem {
    const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
    const currentYearStr = String(new Date().getFullYear());
    const expiryYearStr = String(new Date().getFullYear() + 2); // default expiry 2 years out

    return {
      id: Math.random().toString(36).substring(2, 9),
      productId: '',
      productName: '',
      brand: '',
      category: '',
      manufacturer: '',
      unit: 'Units',
      gstPercentage: 18,
      minimumStock: 10,
      
      batchNumber: '',
      mfgMonth: currentMonthStr,
      mfgYear: currentYearStr,
      expMonth: currentMonthStr,
      expYear: expiryYearStr,
      purchasePrice: 0,
      salePrice: 0,
      mrp: 0,
      discount: 0,
      quantity: 0,
      
      showSuggestions: false,
      searchQuery: ''
    };
  }

  const handleAddRow = () => {
    setItems([...items, createEmptyItem()]);
  };

  const handleRemoveRow = (idx: number) => {
    if (items.length === 1) {
      setItems([createEmptyItem()]);
    } else {
      setItems(items.filter((_, i) => i !== idx));
    }
  };

  // Autocomplete search filtering
  const getProductSuggestions = (query: string) => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      p.sku.toLowerCase().includes(q)
    );
  };

  const handleProductSearchChange = (idx: number, queryStr: string) => {
    const updated = [...items];
    updated[idx].searchQuery = queryStr;
    updated[idx].showSuggestions = queryStr.length > 0;
    
    // Reset product identification if they are typing afresh
    if (updated[idx].productId) {
      updated[idx].productId = '';
      updated[idx].productName = '';
    }
    setItems(updated);
  };

  const handleSelectProduct = (idx: number, product: Product) => {
    const updated = [...items];
    // Autofill metadata immediately
    updated[idx].productId = product.id;
    updated[idx].productName = product.name;
    updated[idx].brand = product.brand || '';
    updated[idx].category = product.category || '';
    updated[idx].manufacturer = product.manufacturer || '';
    updated[idx].unit = product.unit || 'Units';
    updated[idx].gstPercentage = product.gstPercentage || 18;
    updated[idx].minimumStock = product.minimumStock || 10;
    
    updated[idx].searchQuery = product.name;
    updated[idx].showSuggestions = false;

    setItems(updated);

    // Ask to optionally autofill pricing/batch details if they exist in the product master
    if (product.batchNumber || product.purchasePrice || product.sellingPrice) {
      setAutofillModal({ itemIdx: idx, product });
    }
  };

  const confirmAutofill = (accept: boolean) => {
    if (!autofillModal) return;
    const { itemIdx, product } = autofillModal;
    const updated = [...items];

    if (accept) {
      // User accepted autofill of Batch, Prices, and Dates
      updated[itemIdx].batchNumber = product.batchNumber || '';
      updated[itemIdx].purchasePrice = product.purchasePrice || 0;
      updated[itemIdx].salePrice = product.sellingPrice || 0;
      updated[itemIdx].mrp = product.mrp || product.sellingPrice || 0;

      // Handle dates extraction
      if (product.manufacturingDate) {
        const mfg = toJsDate(product.manufacturingDate);
        updated[itemIdx].mfgMonth = String(mfg.getMonth() + 1).padStart(2, '0');
        updated[itemIdx].mfgYear = String(mfg.getFullYear());
      }
      if (product.expiryDate) {
        const exp = toJsDate(product.expiryDate);
        updated[itemIdx].expMonth = String(exp.getMonth() + 1).padStart(2, '0');
        updated[itemIdx].expYear = String(exp.getFullYear());
      }
      showToast('Autofilled batch and price details from master', 'success');
    }

    setItems(updated);
    setAutofillModal(null);
  };

  const handleItemFieldChange = (idx: number, field: keyof FormItem, val: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = val;

    // Automatically set MRP equal to Sale Price if MRP isn't entered or is lower
    if (field === 'salePrice' && (!updated[idx].mrp || updated[idx].mrp < val)) {
      updated[idx].mrp = val;
    }

    setItems(updated);
  };

  // Grand total calculation: Sum of (quantity * purchasePrice) after discount
  const grandTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const itemSub = (item.quantity || 0) * (item.purchasePrice || 0);
      const discountVal = itemSub * ((item.discount || 0) / 100);
      return sum + (itemSub - discountVal);
    }, 0);
  }, [items]);

  // Inline Supplier Addition
  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.tenantId) return;
    if (!newSupplierName.trim()) {
      showToast('Supplier Name is required', 'warning');
      return;
    }

    try {
      const newId = await purchaseService.addSupplier(user.tenantId, {
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || undefined,
        gstNumber: newSupplierGst.trim() || undefined,
        address: newSupplierAddress.trim() || undefined,
        email: newSupplierEmail.trim() || undefined
      });

      showToast('New Supplier registered successfully', 'success');
      
      // Refresh list
      const supps = await purchaseService.getSuppliers(user.tenantId);
      setSuppliers(supps);

      // Select newly added supplier
      setSelectedSupplierId(newId);

      // Clear form & close modal
      setNewSupplierName('');
      setNewSupplierPhone('');
      setNewSupplierGst('');
      setNewSupplierAddress('');
      setNewSupplierEmail('');
      setShowSupplierModal(false);
    } catch (err) {
      console.error(err);
      showToast('Failed to create new supplier', 'danger');
    }
  };

  // Final Form Save Handler
  const handleSavePurchase = async () => {
    if (!user?.tenantId) return;
    if (!selectedSupplierId) {
      showToast('Please select a Supplier', 'warning');
      return;
    }
    if (!invoiceNumber.trim()) {
      showToast('Supplier Invoice Number is mandatory', 'warning');
      return;
    }
    if (!invoiceDate) {
      showToast('Invoice Date is mandatory', 'warning');
      return;
    }

    // Validate Items
    const validatedItems: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowNum = i + 1;

      if (!item.productId) {
        showToast(`Please select a valid product for row #${rowNum}`, 'warning');
        return;
      }
      if (!item.batchNumber.trim()) {
        showToast(`Batch Number is required for row #${rowNum}`, 'warning');
        return;
      }
      if (item.quantity <= 0) {
        showToast(`Quantity must be greater than 0 for row #${rowNum}`, 'warning');
        return;
      }
      if (item.purchasePrice < 0) {
        showToast(`Purchase Price cannot be negative for row #${rowNum}`, 'warning');
        return;
      }
      if (item.salePrice < item.purchasePrice) {
        showToast(`Sale Price cannot be less than Purchase Price for row #${rowNum}`, 'warning');
        return;
      }

      // Convert month/years to timestamps
      const mfgDateObj = new Date(parseInt(item.mfgYear), parseInt(item.mfgMonth) - 1, 1);
      const expDateObj = new Date(parseInt(item.expYear), parseInt(item.expMonth) - 1, 1);

      if (expDateObj.getTime() <= mfgDateObj.getTime()) {
        showToast(`Expiry Date must be after MFG Date for row #${rowNum}`, 'warning');
        return;
      }

      const itemTotal = (item.quantity * item.purchasePrice) * (1 - (item.discount || 0) / 100);

      validatedItems.push({
        productId: item.productId,
        productName: item.productName,
        batchNumber: item.batchNumber.trim().toUpperCase(),
        mfgDate: Timestamp.fromDate(mfgDateObj),
        expiryDate: Timestamp.fromDate(expDateObj),
        purchasePrice: item.purchasePrice,
        salePrice: item.salePrice,
        mrp: item.mrp || item.salePrice,
        gstPercentage: item.gstPercentage,
        discount: item.discount,
        quantity: item.quantity,
        total: itemTotal
      });
    }

    setIsSaving(true);
    try {
      const selectedSupp = suppliers.find(s => s.id === selectedSupplierId);

      const purchaseHeader = {
        supplierId: selectedSupplierId,
        supplierName: selectedSupp ? selectedSupp.name : 'Unknown Supplier',
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: Timestamp.fromDate(new Date(invoiceDate)),
        totalAmount: grandTotal,
        itemsCount: validatedItems.length,
        notes: notes.trim() || undefined
      };

      await purchaseService.addPurchase(user.tenantId, purchaseHeader, validatedItems);
      showToast('Purchase entry processed and inventory updated successfully!', 'success');
      navigate('/purchases');
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Error processing purchase transaction', 'danger');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-8 animate-pulse">
        <div className="h-10 w-48 bg-text/5 rounded-lg" />
        <div className="h-64 bg-surface rounded-2xl border border-border" />
        <div className="h-96 bg-surface rounded-2xl border border-border" />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-8">
        
        {/* Header Navigation */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/purchases')} 
            className="rounded-xl h-10 w-10 p-0 hover:bg-text/5 flex items-center justify-center border border-border bg-surface"
          >
            <ArrowLeft className="h-5 w-5 text-text/80" />
          </Button>
          <div>
            <h1 className="text-3xl font-black text-text tracking-tight flex items-center gap-3">
              New Purchase Entry
            </h1>
            <p className="text-text/60 text-sm mt-0.5">Separate stock entry: additions will increment batch levels and update pricing tables</p>
          </div>
        </div>

        {/* Master Row: Supplier and Invoice */}
        <Card className="p-6 border border-border rounded-3xl bg-surface shadow-sm">
          <div className="flex justify-between items-center mb-4 border-b border-border pb-3">
            <h3 className="text-lg font-black text-text flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Supplier & Document Details
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSupplierModal(true)}
              className="rounded-xl flex items-center gap-1 text-primary border-primary/20 hover:bg-primary/5 font-semibold h-9"
            >
              <UserPlus className="h-4 w-4" />
              Add New Supplier
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Supplier select */}
            <div>
              <label className="block text-xs font-bold text-text/60 uppercase tracking-wider mb-2">Select Supplier *</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full h-11 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-semibold transition-all"
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} {s.phone ? `(${s.phone})` : ''}</option>
                ))}
              </select>
            </div>

            {/* Supplier invoice # */}
            <div>
              <label className="block text-xs font-bold text-text/60 uppercase tracking-wider mb-2">Supplier Invoice # *</label>
              <input
                type="text"
                placeholder="e.g. INV-1002"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full h-11 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-semibold transition-all placeholder:text-text/30"
              />
            </div>

            {/* Invoice Date */}
            <div>
              <label className="block text-xs font-bold text-text/60 uppercase tracking-wider mb-2">Invoice Date *</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full h-11 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-semibold transition-all"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-text/60 uppercase tracking-wider mb-2">Internal Notes (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Received intact, fridge stock"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-11 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-semibold transition-all placeholder:text-text/30"
              />
            </div>
          </div>
        </Card>

        {/* Purchase Items List Grid */}
        <Card className="p-6 border border-border rounded-3xl bg-surface shadow-sm overflow-visible">
          <div className="flex justify-between items-center mb-4 border-b border-border pb-3">
            <h3 className="text-lg font-black text-text flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Purchase Items Row Entries
            </h3>
            <span className="text-xs font-bold text-text/40 font-mono">Grand Total: {formatCurrency(grandTotal)}</span>
          </div>

          <div className="space-y-6">
            {items.map((item, idx) => {
              const suggestions = getProductSuggestions(item.searchQuery);
              const itemTotal = (item.quantity || 0) * (item.purchasePrice || 0) * (1 - (item.discount || 0) / 100);

              return (
                <div 
                  key={item.id} 
                  className="p-5 border border-border rounded-2xl bg-text/[0.01] grid grid-cols-1 md:grid-cols-12 gap-4 items-end relative overflow-visible"
                >
                  {/* Product Search (4 cols) */}
                  <div className="md:col-span-3 relative">
                    <label className="block text-xs font-bold text-text/50 uppercase mb-2">Product Selection *</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text/40" />
                      <input
                        type="text"
                        placeholder="Type name, brand, or SKU..."
                        value={item.searchQuery}
                        onChange={(e) => handleProductSearchChange(idx, e.target.value)}
                        onFocus={() => {
                          if (item.searchQuery) {
                            const updated = [...items];
                            updated[idx].showSuggestions = true;
                            setItems(updated);
                          }
                        }}
                        className="w-full h-10 pl-9 pr-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-xs font-semibold transition-all placeholder:text-text/30"
                      />
                    </div>

                    {/* Autocomplete Suggestions Panel */}
                    {item.showSuggestions && suggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-surface border border-border rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-border">
                        {suggestions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectProduct(idx, p)}
                            className="w-full text-left px-4 py-2.5 hover:bg-text/[0.03] transition-all text-xs"
                          >
                            <p className="font-bold text-text">{p.name}</p>
                            <p className="text-text/50 font-medium">Brand: {p.brand || 'N/A'} | SKU: {p.sku} | Stock: {p.stockQuantity}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Batch Number (1.5 cols) */}
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-text/50 uppercase mb-2">Batch # *</label>
                    <input
                      type="text"
                      placeholder="e.g. B-99"
                      value={item.batchNumber}
                      onChange={(e) => handleItemFieldChange(idx, 'batchNumber', e.target.value.toUpperCase())}
                      className="w-full h-10 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-xs font-mono font-bold transition-all placeholder:text-text/30"
                    />
                  </div>

                  {/* MFG Month/Year (2 cols) */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-text/70 uppercase mb-2">Mfg (M/Y) *</label>
                    <div className="flex gap-1">
                      <select
                        value={item.mfgMonth}
                        onChange={(e) => handleItemFieldChange(idx, 'mfgMonth', e.target.value)}
                        className={`w-1/2 h-10 px-2.5 border border-text/30 rounded-xl bg-surface focus:border-primary/50 outline-none text-xs font-bold transition-all cursor-pointer shadow-sm ${
                          !item.mfgMonth ? 'text-text/30' : 'text-text'
                        }`}
                      >
                        <option value="" disabled hidden className="text-text/30">Month</option>
                        {MONTHS.map(m => (
                          <option key={m.value} value={m.value} className="text-text font-semibold">{m.label}</option>
                        ))}
                      </select>
                      <select
                        value={item.mfgYear}
                        onChange={(e) => handleItemFieldChange(idx, 'mfgYear', e.target.value)}
                        className={`w-1/2 h-10 px-2 border border-text/30 rounded-xl bg-surface focus:border-primary/50 outline-none text-xs font-bold transition-all cursor-pointer shadow-sm ${
                          !item.mfgYear ? 'text-text/30' : 'text-text'
                        }`}
                      >
                        <option value="" disabled hidden className="text-text/30">Year</option>
                        {YEARS.map(y => (
                          <option key={y} value={String(y)} className="text-text font-semibold">{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* EXP Month/Year (2 cols) */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-text/70 uppercase mb-2">Exp (M/Y) *</label>
                    <div className="flex gap-1">
                      <select
                        value={item.expMonth}
                        onChange={(e) => handleItemFieldChange(idx, 'expMonth', e.target.value)}
                        className={`w-1/2 h-10 px-2.5 border border-text/30 rounded-xl bg-surface focus:border-primary/50 outline-none text-xs font-bold transition-all cursor-pointer shadow-sm ${
                          !item.expMonth ? 'text-text/30' : 'text-text'
                        }`}
                      >
                        <option value="" disabled hidden className="text-text/30">Month</option>
                        {MONTHS.map(m => (
                          <option key={m.value} value={m.value} className="text-text font-semibold">{m.label}</option>
                        ))}
                      </select>
                      <select
                        value={item.expYear}
                        onChange={(e) => handleItemFieldChange(idx, 'expYear', e.target.value)}
                        className={`w-1/2 h-10 px-2 border border-text/30 rounded-xl bg-surface focus:border-primary/50 outline-none text-xs font-bold transition-all cursor-pointer shadow-sm ${
                          !item.expYear ? 'text-text/30' : 'text-text'
                        }`}
                      >
                        <option value="" disabled hidden className="text-text/30">Year</option>
                        {YEARS.map(y => (
                          <option key={y} value={String(y)} className="text-text font-semibold">{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Quantity (1 col) */}
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-text/50 uppercase mb-2">Quantity *</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={item.quantity || ''}
                      onChange={(e) => handleItemFieldChange(idx, 'quantity', Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full h-10 px-2.5 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-xs font-bold transition-all"
                    />
                  </div>

                  {/* Purchase Price (1.25 cols) */}
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-text/50 uppercase mb-2">Buy Price *</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={item.purchasePrice || ''}
                      onChange={(e) => handleItemFieldChange(idx, 'purchasePrice', Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full h-10 px-2 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-xs font-bold transition-all"
                    />
                  </div>

                  {/* Sale Price (1.25 cols) */}
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-text/50 uppercase mb-2">Sale Price *</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={item.salePrice || ''}
                      onChange={(e) => handleItemFieldChange(idx, 'salePrice', Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full h-10 px-2 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-xs font-bold transition-all"
                    />
                  </div>

                  {/* Row Total & Delete row (1 col) */}
                  <div className="md:col-span-1 flex flex-col items-end justify-end mb-1">
                    <span className="block text-[10px] font-bold text-text/40 uppercase mb-1">Subtotal</span>
                    <div className="flex items-center gap-1.5 justify-end w-full">
                      <span className="text-xs font-black text-text block truncate">{formatCurrency(itemTotal)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="text-text/30 hover:text-danger p-1 hover:bg-danger/5 rounded-lg transition-all shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer of the grid: Add Row & totals */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mt-6 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={handleAddRow}
              className="rounded-xl flex items-center gap-1.5 border-border text-text hover:bg-text/5 font-semibold text-xs h-10 px-4 self-start"
            >
              <Plus className="h-4 w-4" />
              Add Another Row
            </Button>

            <div className="text-right space-y-1 mt-4 md:mt-0">
              <span className="text-sm font-semibold text-text/50">Grand Total:</span>
              <span className="text-2xl font-black text-text block">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </Card>

        {/* Action Bottom Bar */}
        <div className="flex justify-end gap-3 pb-8">
          <Button
            variant="outline"
            onClick={() => navigate('/purchases')}
            className="rounded-2xl h-12 px-6 border-border text-text hover:bg-text/5 font-bold"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSavePurchase}
            disabled={isSaving}
            className="rounded-2xl h-12 px-6 font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
          >
            <Save className="h-5 w-5" />
            {isSaving ? "Saving stock in..." : "Save Purchase Entry"}
          </Button>
        </div>

        {/* Inline Supplier Add Modal */}
        {showSupplierModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text/40 backdrop-blur-sm">
            <div className="bg-surface border border-border rounded-3xl p-6 max-w-md w-full shadow-2xl relative space-y-4">
              <button
                onClick={() => setShowSupplierModal(false)}
                className="absolute top-4 right-4 text-text/40 hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
              
              <div>
                <h3 className="text-xl font-black text-text flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  Add New Supplier
                </h3>
                <p className="text-text/60 text-xs mt-1">Register supplier details to track purchase sources</p>
              </div>

              <form onSubmit={handleAddSupplier} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-text/60 uppercase tracking-wider mb-1.5">Supplier Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Pharmaceuticals"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className="w-full h-11 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-semibold transition-all placeholder:text-text/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-text/60 uppercase tracking-wider mb-1.5">Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 98765 43210"
                    value={newSupplierPhone}
                    onChange={(e) => setNewSupplierPhone(e.target.value)}
                    className="w-full h-11 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-semibold transition-all placeholder:text-text/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-text/60 uppercase tracking-wider mb-1.5">GST Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 27AAAAA1111A1Z1"
                    value={newSupplierGst}
                    onChange={(e) => setNewSupplierGst(e.target.value.toUpperCase())}
                    className="w-full h-11 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-semibold transition-all placeholder:text-text/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-text/60 uppercase tracking-wider mb-1.5">Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Sector-4, Mumbai"
                    value={newSupplierAddress}
                    onChange={(e) => setNewSupplierAddress(e.target.value)}
                    className="w-full h-11 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-semibold transition-all placeholder:text-text/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-text/60 uppercase tracking-wider mb-1.5">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. supplier@domain.com"
                    value={newSupplierEmail}
                    onChange={(e) => setNewSupplierEmail(e.target.value)}
                    className="w-full h-11 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-semibold transition-all placeholder:text-text/30"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowSupplierModal(false)}
                    className="flex-1 rounded-xl h-11 font-bold border-border"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 rounded-xl h-11 font-bold"
                  >
                    Save Supplier
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Autofill Confirmation Dialogue Modal */}
        {autofillModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text/40 backdrop-blur-sm">
            <div className="bg-surface border border-border rounded-3xl p-6 max-w-md w-full shadow-2xl relative space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-text">Autofill batch info?</h3>
                  <p className="text-text/60 text-sm mt-1">
                    An existing product matching <strong>{autofillModal.product.name}</strong> was selected. Do you want to autofill its last active batch number, prices, manufacturing date, and expiry date?
                  </p>
                </div>
              </div>

              <div className="bg-text/[0.02] border border-border rounded-2xl p-4 text-xs space-y-1.5 font-semibold text-text/80">
                <p><span className="text-text/50">Batch Number:</span> {autofillModal.product.batchNumber || 'N/A'}</p>
                <p><span className="text-text/50">Purchase Price:</span> {formatCurrency(autofillModal.product.purchasePrice || 0)}</p>
                <p><span className="text-text/50">Sale Price:</span> {formatCurrency(autofillModal.product.sellingPrice || 0)}</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => confirmAutofill(false)}
                  className="flex-1 rounded-xl h-11 font-bold border-border text-text/80"
                >
                  No, Enter Manually
                </Button>
                <Button
                  type="button"
                  onClick={() => confirmAutofill(true)}
                  className="flex-1 rounded-xl h-11 font-bold"
                >
                  Yes, Autofill
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
