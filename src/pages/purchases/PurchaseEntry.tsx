import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseService } from '../../services/purchaseService';
import { productService } from '../../services/productService';
import { Supplier, Product } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/PageTransition';
import { addMoney, calculateLineTax, formatCurrency, roundMoney } from '../../utils/currency';
import { Timestamp } from 'firebase/firestore';
import { medicineMasterService, MasterMedicine } from '../../services/medicineMasterService';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  UserPlus, 
  X, 
  Search, 
  FileText, 
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
  isNewProduct: boolean;
  
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

const calculatePurchaseItem = (item: FormItem) => {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    return { gross: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 };
  }
  const gross = roundMoney(item.quantity * item.purchasePrice);
  const discountAmount = roundMoney(gross * item.discount / 100);
  return calculateLineTax({
    quantity: item.quantity,
    rate: item.purchasePrice,
    discount: discountAmount,
    gstRate: item.gstPercentage,
  });
};

export default function PurchaseEntry() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Master Data State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const saveInProgressRef = useRef(false);
  const productInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const batchInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Form Header State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Form Items State
  const [items, setItems] = useState<FormItem[]>([createEmptyItem()]);
  const [catalogSuggestions, setCatalogSuggestions] = useState<Record<string, MasterMedicine[]>>({});
  const [activeSuggestionByRow, setActiveSuggestionByRow] = useState<Record<string, number>>({});
  const searchRequestRef = useRef<Record<string, number>>({});

  // Inline Supplier Add Modal State
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierGst, setNewSupplierGst] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');
  const [newSupplierEmail, setNewSupplierEmail] = useState('');
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);

  // Price defaults are optional. Batch and dates always belong to this purchase.
  const [autofillModal, setAutofillModal] = useState<{
    itemIdx: number;
    product: Product;
  } | null>(null);

  useEffect(() => {
    if (!user?.tenantId) return;
    let active = true;
    setLoading(true);
    void purchaseService.getSuppliers(user.tenantId)
      .then(supps => {
        if (active) setSuppliers(supps);
      })
      .catch(error => {
        console.error('Error loading suppliers:', error);
        if (active) showToast('Unable to load suppliers. Please retry.', 'danger');
      });
    const unsubscribe = productService.subscribeToProducts(user.tenantId, loadedProducts => {
      if (!active) return;
      setProducts(loadedProducts);
      setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [user]);

  function createEmptyItem(): FormItem {
    return {
      id: Math.random().toString(36).substring(2, 9),
      productId: '',
      productName: '',
      brand: '',
      category: '',
      manufacturer: '',
      unit: 'Units',
      gstPercentage: 0,
      minimumStock: 10,
      isNewProduct: false,
      
      batchNumber: '',
      mfgMonth: '',
      mfgYear: '',
      expMonth: '',
      expYear: '',
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
    const newItem = createEmptyItem();
    setItems(current => [...current, newItem]);
    window.requestAnimationFrame(() => productInputRefs.current[newItem.id]?.focus());
  };

  const handleRemoveRow = (idx: number) => {
    if (items.length === 1) {
      setItems([createEmptyItem()]);
    } else {
      setItems(items.filter((_, i) => i !== idx));
    }
  };

  // Existing inventory remains first; shared catalogue results are added per row.
  const getProductSuggestions = (item: FormItem) => {
    const query = item.searchQuery;
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const inventory = products.filter(p =>
      p.name.toLowerCase().includes(q) || 
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      p.sku.toLowerCase().includes(q)
    ).slice(0, 8).map(product => ({ type: 'inventory' as const, product }));
    const existingNames = new Set(inventory.map(({ product }) =>
      `${product.name.trim().toLowerCase()}|${(product.manufacturer || '').trim().toLowerCase()}`
    ));
    const catalogue = (catalogSuggestions[item.id] || [])
      .filter(medicine => !existingNames.has(
        `${medicine.name.trim().toLowerCase()}|${(medicine.manufacturer || '').trim().toLowerCase()}`
      ))
      .slice(0, 10)
      .map(medicine => ({ type: 'catalogue' as const, medicine }));
    return [...inventory, ...catalogue];
  };

  const handleProductSearchChange = (idx: number, queryStr: string) => {
    const updated = [...items];
    updated[idx].searchQuery = queryStr;
    updated[idx].showSuggestions = queryStr.length > 0;
    
    // Reset product identification if they are typing afresh
    if (updated[idx].productId) {
      updated[idx].productId = '';
      updated[idx].productName = '';
      updated[idx].isNewProduct = false;
    }
    setItems(updated);
    setActiveSuggestionByRow(current => ({ ...current, [updated[idx].id]: -1 }));

    const rowId = updated[idx].id;
    const requestId = (searchRequestRef.current[rowId] || 0) + 1;
    searchRequestRef.current[rowId] = requestId;
    if (queryStr.trim().length < 2) {
      setCatalogSuggestions(current => ({ ...current, [rowId]: [] }));
      return;
    }
    void medicineMasterService.search(queryStr, 20).then(results => {
      if (searchRequestRef.current[rowId] !== requestId) return;
      setCatalogSuggestions(current => ({ ...current, [rowId]: results }));
    }).catch(() => {
      if (searchRequestRef.current[rowId] !== requestId) return;
      setCatalogSuggestions(current => ({ ...current, [rowId]: [] }));
    });
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
    updated[idx].gstPercentage = product.gstPercentage ?? 0;
    updated[idx].minimumStock = product.minimumStock ?? 10;
    updated[idx].isNewProduct = false;
    
    updated[idx].searchQuery = product.name;
    updated[idx].showSuggestions = false;

    setItems(updated);

    // Pricing defaults can speed up entry, but purchase-specific batch/dates are never copied.
    if (product.purchasePrice || product.sellingPrice) {
      setAutofillModal({ itemIdx: idx, product });
    } else {
      window.requestAnimationFrame(() => batchInputRefs.current[updated[idx].id]?.focus());
    }
  };

  const handleSelectCatalogueMedicine = (idx: number, medicine: MasterMedicine) => {
    const updated = [...items];
    updated[idx].productId = `catalog_${crypto.randomUUID()}`;
    updated[idx].productName = medicine.name;
    updated[idx].searchQuery = medicine.name;
    updated[idx].brand = medicine.brand || '';
    updated[idx].manufacturer = medicine.manufacturer || '';
    updated[idx].category = medicine.category || 'Others';
    updated[idx].unit = medicine.unit || 'Units';
    updated[idx].isNewProduct = true;
    updated[idx].showSuggestions = false;
    setItems(updated);
    window.requestAnimationFrame(() => batchInputRefs.current[updated[idx].id]?.focus());
  };

  const confirmAutofill = (accept: boolean) => {
    if (!autofillModal) return;
    const { itemIdx, product } = autofillModal;
    const updated = [...items];

    if (accept) {
      // Never populate batch, dates, quantity, or stock from master data.
      updated[itemIdx].purchasePrice = product.purchasePrice || 0;
      updated[itemIdx].salePrice = product.sellingPrice || 0;
      showToast('Saved price defaults applied. Enter the new batch details.', 'success');
    }

    setItems(updated);
    setAutofillModal(null);
    window.requestAnimationFrame(() => batchInputRefs.current[updated[itemIdx].id]?.focus());
  };

  const handleItemFieldChange = (idx: number, field: keyof FormItem, val: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = val;

    setItems(updated);
  };

  const purchaseTotals = useMemo(() => {
    const lines = items.map(calculatePurchaseItem);
    return {
      gross: addMoney(...lines.map(line => line.gross)),
      discount: addMoney(...lines.map(line => line.discount)),
      taxable: addMoney(...lines.map(line => line.taxable)),
      cgst: addMoney(...lines.map(line => line.cgst)),
      sgst: addMoney(...lines.map(line => line.sgst)),
      igst: addMoney(...lines.map(line => line.igst)),
      gst: addMoney(...lines.map(line => line.tax)),
      total: addMoney(...lines.map(line => line.total)),
    };
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
      setIsCreatingSupplier(true);
      const supplierName = newSupplierName.trim();
      const newId = await purchaseService.addSupplier(user.tenantId, {
        name: supplierName,
        phone: newSupplierPhone.trim() || undefined,
        gstNumber: newSupplierGst.trim() || undefined,
        address: newSupplierAddress.trim() || undefined,
        email: newSupplierEmail.trim() || undefined
      });

      showToast('New Supplier registered successfully', 'success');
      // Make the new supplier selectable immediately; refresh in the background.
      setSuppliers(current => [...current, {
        id: newId,
        tenantId: user.tenantId,
        name: supplierName,
        phone: newSupplierPhone.trim() || undefined,
        gstNumber: newSupplierGst.trim() || undefined,
        address: newSupplierAddress.trim() || undefined,
        email: newSupplierEmail.trim() || undefined,
        createdAt: new Date(),
      }].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSupplierId(newId);

      // Clear form & close modal
      setNewSupplierName('');
      setNewSupplierPhone('');
      setNewSupplierGst('');
      setNewSupplierAddress('');
      setNewSupplierEmail('');
      setShowSupplierModal(false);
      void purchaseService.getSuppliers(user.tenantId).then(refreshed => {
        if (refreshed.some(supplier => supplier.id === newId)) setSuppliers(refreshed);
      });
    } catch (err) {
      console.error(err);
      showToast('Failed to create new supplier', 'danger');
    } finally {
      setIsCreatingSupplier(false);
    }
  };

  // Final Form Save Handler
  const handleSavePurchase = async (saveAndAddAnother = false) => {
    if (!user?.tenantId) return;
    if (saveInProgressRef.current) return;
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
      if (!item.productName.trim()) {
        showToast(`Product Name is required for row #${rowNum}`, 'warning');
        return;
      }
      if (!item.brand.trim()) {
        showToast(`Brand Name is required for row #${rowNum}`, 'warning');
        return;
      }
      if (!item.batchNumber.trim()) {
        showToast(`Batch Number is required for row #${rowNum}`, 'warning');
        return;
      }
      if (!item.mfgMonth || !item.mfgYear) {
        showToast(`Manufacturing Date is required for row #${rowNum}`, 'warning');
        return;
      }
      if (!item.expMonth || !item.expYear) {
        showToast(`Expiry Date is required for row #${rowNum}`, 'warning');
        return;
      }
      if (item.quantity <= 0) {
        showToast(`Quantity must be greater than 0 for row #${rowNum}`, 'warning');
        return;
      }
      if (!Number.isFinite(item.purchasePrice) || item.purchasePrice <= 0) {
        showToast(`Purchase Price must be greater than ₹0 for row #${rowNum}`, 'warning');
        return;
      }
      if (!Number.isFinite(item.salePrice) || item.salePrice <= 0) {
        showToast(`Sale Price must be greater than ₹0 for row #${rowNum}`, 'warning');
        return;
      }
      if (item.salePrice < item.purchasePrice) {
        showToast(`Sale Price cannot be less than Purchase Price for row #${rowNum}`, 'warning');
        return;
      }
      if (![0, 5, 12, 18, 28].includes(item.gstPercentage)) {
        showToast(`Select a supported GST rate for row #${rowNum}`, 'warning');
        return;
      }
      if (item.discount < 0 || item.discount > 100) {
        showToast(`Discount must be between 0% and 100% for row #${rowNum}`, 'warning');
        return;
      }

      // Convert month/years to timestamps
      const mfgDateObj = new Date(parseInt(item.mfgYear), parseInt(item.mfgMonth) - 1, 1);
      const expDateObj = new Date(parseInt(item.expYear), parseInt(item.expMonth), 0, 23, 59, 59, 999);

      if (expDateObj.getTime() <= mfgDateObj.getTime()) {
        showToast(`Expiry Date must be after MFG Date for row #${rowNum}`, 'warning');
        return;
      }

      const amounts = calculatePurchaseItem(item);

      validatedItems.push({
        productId: item.productId,
        productName: item.productName,
        isNewProduct: item.isNewProduct,
        productBrand: item.brand.trim(),
        productManufacturer: item.manufacturer.trim(),
        productCategory: item.category || 'Others',
        productUnit: item.unit || 'Units',
        productMinimumStock: item.minimumStock,
        batchNumber: item.batchNumber.trim().toUpperCase(),
        mfgDate: Timestamp.fromDate(mfgDateObj),
        expiryDate: Timestamp.fromDate(expDateObj),
        purchasePrice: item.purchasePrice,
        salePrice: item.salePrice,
        mrp: item.mrp || 0,
        gstPercentage: item.gstPercentage,
        discount: item.discount,
        quantity: item.quantity,
        grossAmount: amounts.gross,
        discountAmount: amounts.discount,
        taxableAmount: amounts.taxable,
        gstAmount: amounts.tax,
        cgst: amounts.cgst,
        sgst: amounts.sgst,
        igst: amounts.igst,
        total: amounts.total
      });
    }

    saveInProgressRef.current = true;
    setIsSaving(true);
    try {
      const selectedSupp = suppliers.find(s => s.id === selectedSupplierId);

      const purchaseHeader = {
        supplierId: selectedSupplierId,
        supplierName: selectedSupp ? selectedSupp.name : 'Unknown Supplier',
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: Timestamp.fromDate(new Date(`${invoiceDate}T12:00:00`)),
        grossAmount: purchaseTotals.gross,
        discountAmount: purchaseTotals.discount,
        taxableAmount: purchaseTotals.taxable,
        gstAmount: purchaseTotals.gst,
        cgst: purchaseTotals.cgst,
        sgst: purchaseTotals.sgst,
        igst: purchaseTotals.igst,
        totalAmount: purchaseTotals.total,
        itemsCount: validatedItems.length,
        notes: notes.trim() || undefined
      };

      await purchaseService.addPurchase(user.tenantId, purchaseHeader, validatedItems);
      showToast('Purchase entry processed and inventory updated successfully!', 'success');
      if (saveAndAddAnother) {
        setSelectedSupplierId('');
        setInvoiceNumber('');
        setInvoiceDate(new Date().toISOString().split('T')[0]);
        setNotes('');
        setItems([createEmptyItem()]);
        setAutofillModal(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>('[data-purchase-product-input="true"]')?.focus();
        });
      } else {
        navigate('/purchases');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Error processing purchase transaction', 'danger');
    } finally {
      saveInProgressRef.current = false;
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
      <div className="p-3 sm:p-4 md:p-8 max-w-[1400px] mx-auto space-y-5 md:space-y-8 pb-28 md:pb-8">
        
        {/* Header Navigation */}
        <div className="flex items-start gap-3 md:gap-4">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/purchases')} 
            className="rounded-xl h-10 w-10 p-0 hover:bg-text/5 flex items-center justify-center border border-border bg-surface"
          >
            <ArrowLeft className="h-5 w-5 text-text/80" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-text tracking-tight flex items-center gap-3">
              New Purchase Entry
            </h1>
            <p className="text-text/60 text-sm mt-0.5">Separate stock entry: additions will increment batch levels and update pricing tables</p>
          </div>
        </div>

        {/* Master Row: Supplier and Invoice */}
        <Card className="p-4 md:p-6 border border-border rounded-2xl md:rounded-3xl bg-surface shadow-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 border-b border-border pb-3">
            <h3 className="text-lg font-black text-text flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Supplier & Document Details
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSupplierModal(true)}
              className="rounded-xl flex items-center justify-center gap-1 text-primary border-primary/20 hover:bg-primary/5 font-semibold min-h-11 sm:h-9 sm:min-h-0 w-full sm:w-auto"
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
        <Card className="p-3 sm:p-4 md:p-6 border border-border rounded-2xl md:rounded-3xl bg-surface shadow-sm overflow-visible">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4 border-b border-border pb-3">
            <h3 className="text-lg font-black text-text flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Purchase Items Row Entries
            </h3>
            <span className="text-xs font-bold text-text/40 font-mono">Grand Total: {formatCurrency(purchaseTotals.total)}</span>
          </div>

          <div className="space-y-6">
            {items.map((item, idx) => {
              const suggestions = getProductSuggestions(item);
              const itemAmounts = calculatePurchaseItem(item);

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
                        ref={(element) => { productInputRefs.current[item.id] = element; }}
                        data-purchase-product-input="true"
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
                        onKeyDown={(event) => {
                          const activeIndex = activeSuggestionByRow[item.id] ?? -1;
                          if (event.key === 'ArrowDown' && suggestions.length > 0) {
                            event.preventDefault();
                            setActiveSuggestionByRow(current => ({
                              ...current,
                              [item.id]: (activeIndex + 1) % suggestions.length,
                            }));
                          } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
                            event.preventDefault();
                            setActiveSuggestionByRow(current => ({
                              ...current,
                              [item.id]: activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1,
                            }));
                          } else if ((event.key === 'Enter' || event.key === 'Tab') && suggestions.length > 0) {
                            event.preventDefault();
                            const selected = suggestions[activeIndex >= 0 ? activeIndex : 0];
                            if (selected.type === 'inventory') handleSelectProduct(idx, selected.product);
                            else handleSelectCatalogueMedicine(idx, selected.medicine);
                          } else if (event.key === 'Escape') {
                            const updated = [...items];
                            updated[idx].showSuggestions = false;
                            setItems(updated);
                          }
                        }}
                        aria-label={`Search product for purchase row ${idx + 1}`}
                        aria-expanded={item.showSuggestions && suggestions.length > 0}
                        className="w-full min-h-11 pl-9 pr-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-semibold transition-all placeholder:text-text/30"
                      />
                    </div>

                    {/* Autocomplete Suggestions Panel */}
                    {item.showSuggestions && suggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-surface border border-border rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-border">
                        {suggestions.map((suggestion, suggestionIndex) => {
                          const isInventory = suggestion.type === 'inventory';
                          const medicine = isInventory ? suggestion.product : suggestion.medicine;
                          return (
                          <button
                            key={isInventory ? suggestion.product.id : `catalog-${medicine.name}-${medicine.manufacturer || ''}`}
                            type="button"
                            onClick={() => {
                              if (isInventory) handleSelectProduct(idx, suggestion.product);
                              else handleSelectCatalogueMedicine(idx, suggestion.medicine);
                            }}
                            onMouseEnter={() => setActiveSuggestionByRow(current => ({
                              ...current,
                              [item.id]: suggestionIndex,
                            }))}
                            className={`w-full text-left px-4 py-2.5 hover:bg-text/[0.03] transition-all text-xs ${
                              (activeSuggestionByRow[item.id] ?? -1) === suggestionIndex ? 'bg-primary/10' : ''
                            }`}
                          >
                            <p className="font-bold text-text">{medicine.name}</p>
                            <p className="text-text/50 font-medium">
                              {isInventory
                                ? `Your inventory · Brand: ${suggestion.product.brand || 'N/A'} · Stock: ${suggestion.product.stockQuantity}`
                                : `Medicine catalogue · Mfg: ${suggestion.medicine.manufacturer || 'Not listed'}`}
                            </p>
                          </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Batch Number (1.5 cols) */}
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-text/50 uppercase mb-2">Batch # *</label>
                    <input
                      ref={(element) => { batchInputRefs.current[item.id] = element; }}
                      type="text"
                      placeholder="e.g. B-99"
                      value={item.batchNumber}
                      onChange={(e) => handleItemFieldChange(idx, 'batchNumber', e.target.value.toUpperCase())}
                      required
                      className="w-full min-h-11 px-3 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-sm font-mono font-bold transition-all placeholder:text-text/30"
                    />
                  </div>

                  {/* MFG Month/Year (2 cols) */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-text/70 uppercase mb-2">Mfg (M/Y) *</label>
                    <div className="flex gap-1">
                      <select
                        value={item.mfgMonth}
                        onChange={(e) => handleItemFieldChange(idx, 'mfgMonth', e.target.value)}
                        required
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
                        required
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
                        required
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
                        required
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
                      min="0.01"
                      step="0.01"
                      required
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
                      min="0.01"
                      step="0.01"
                      required
                      className="w-full h-10 px-2 border border-border rounded-xl bg-surface focus:border-primary/50 outline-none text-text text-xs font-bold transition-all"
                    />
                  </div>

                  {/* Row Total & Delete row (1 col) */}
                  <div className="md:col-span-1 flex flex-col items-end justify-end mb-1">
                    <span className="block text-[10px] font-bold text-text/40 uppercase mb-1">Subtotal</span>
                    <div className="flex items-center gap-1.5 justify-end w-full">
                      <span className="text-xs font-black text-text block truncate">{formatCurrency(itemAmounts.total)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="text-text/30 hover:text-danger p-1 hover:bg-danger/5 rounded-lg transition-all shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-12 grid grid-cols-2 md:grid-cols-7 gap-3 pt-3 border-t border-border/70">
                    <div>
                      <label className="block text-[10px] font-bold text-text/50 uppercase mb-1">Brand *</label>
                      <input value={item.brand} onChange={(e) => handleItemFieldChange(idx, 'brand', e.target.value)} placeholder="Enter brand" required className="w-full h-9 px-3 border border-border rounded-lg bg-surface text-xs font-semibold" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-text/50 uppercase mb-1">Manufacturer</label>
                      <input value={item.manufacturer} onChange={(e) => handleItemFieldChange(idx, 'manufacturer', e.target.value)} placeholder="Enter manufacturer" className="w-full h-9 px-3 border border-border rounded-lg bg-surface text-xs font-semibold" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-text/50 uppercase mb-1">MRP (Optional)</label>
                      <input type="number" min="0" step="0.01" value={item.mrp || ''} onChange={(e) => handleItemFieldChange(idx, 'mrp', Math.max(0, Number(e.target.value) || 0))} className="w-full h-9 px-3 border border-border rounded-lg bg-surface text-xs font-semibold" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-text/50 uppercase mb-1">Discount %</label>
                      <input type="number" min="0" max="100" step="0.01" value={item.discount || ''} onChange={(e) => handleItemFieldChange(idx, 'discount', Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className="w-full h-9 px-3 border border-border rounded-lg bg-surface text-xs font-semibold" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-text/50 uppercase mb-1">GST %</label>
                      <select value={item.gstPercentage} onChange={(e) => handleItemFieldChange(idx, 'gstPercentage', Number(e.target.value))} className="w-full h-9 px-3 border border-border rounded-lg bg-surface text-xs font-semibold">
                        {[0, 5, 12, 18, 28].map(rate => <option key={rate} value={rate}>{rate}%</option>)}
                      </select>
                    </div>
                    <div className="rounded-lg bg-text/[0.02] px-3 py-2">
                      <p className="text-[10px] font-bold text-text/50 uppercase">Taxable</p>
                      <p className="text-xs font-black">{formatCurrency(itemAmounts.taxable)}</p>
                    </div>
                    <div className="rounded-lg bg-primary/5 px-3 py-2">
                      <p className="text-[10px] font-bold text-text/50 uppercase">GST / Line Total</p>
                      <p className="text-xs font-black">{formatCurrency(itemAmounts.tax)} / {formatCurrency(itemAmounts.total)}</p>
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
              <p className="text-xs font-semibold text-text/50">Gross {formatCurrency(purchaseTotals.gross)} · Discount {formatCurrency(purchaseTotals.discount)}</p>
              <p className="text-xs font-semibold text-text/50">Taxable {formatCurrency(purchaseTotals.taxable)} · GST {formatCurrency(purchaseTotals.gst)}</p>
              <span className="text-sm font-semibold text-text/50">Grand Total:</span>
              <span className="text-2xl font-black text-text block">{formatCurrency(purchaseTotals.total)}</span>
            </div>
          </div>
        </Card>

        {/* Action Bottom Bar */}
        <div className="fixed md:static bottom-0 inset-x-0 z-40 flex gap-2 md:gap-3 p-3 md:p-0 md:pb-8 bg-surface/95 md:bg-transparent backdrop-blur border-t md:border-t-0 border-border shadow-2xl md:shadow-none">
          <Button
            variant="outline"
            onClick={() => navigate('/purchases')}
            className="rounded-xl md:rounded-2xl min-h-12 px-3 md:px-6 border-border text-text hover:bg-text/5 font-bold flex-1 md:flex-none"
          >
            Cancel
          </Button>
          <Button variant="outline" onClick={() => void handleSavePurchase(true)} disabled={isSaving} className="rounded-xl md:rounded-2xl min-h-12 px-3 md:px-6 border-primary text-primary font-bold flex items-center justify-center gap-2 flex-1 md:flex-none">
            <Save className="h-5 w-5" />
            {isSaving ? 'Saving...' : 'Save & New'}
          </Button>
          <Button
            onClick={() => void handleSavePurchase(false)}
            disabled={isSaving}
            className="rounded-xl md:rounded-2xl min-h-12 px-3 md:px-6 font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all flex-1 md:flex-none"
          >
            <Save className="h-5 w-5" />
            {isSaving ? "Saving stock in..." : "Save & Close"}
          </Button>
        </div>

        {/* Inline Supplier Add Modal */}
        {showSupplierModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text/40 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" aria-labelledby="add-supplier-title" className="bg-surface border border-border rounded-3xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl relative space-y-4">
              <button
                onClick={() => setShowSupplierModal(false)}
                className="absolute top-4 right-4 text-text/40 hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
              
              <div>
                <h3 id="add-supplier-title" className="text-xl font-black text-text flex items-center gap-2">
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
                    disabled={isCreatingSupplier}
                    className="flex-1 rounded-xl h-11 font-bold"
                  >
                    {isCreatingSupplier ? 'Saving...' : 'Save Supplier'}
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
                  <h3 className="text-lg font-black text-text">Use saved price defaults?</h3>
                  <p className="text-text/60 text-sm mt-1">
                    Apply the saved rates for <strong>{autofillModal.product.name}</strong>? Batch number, manufacturing date, expiry date and quantity will remain manual for this purchase.
                  </p>
                </div>
              </div>

              <div className="bg-text/[0.02] border border-border rounded-2xl p-4 text-xs space-y-1.5 font-semibold text-text/80">
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
                  Enter Rates Manually
                </Button>
                <Button
                  type="button"
                  onClick={() => confirmAutofill(true)}
                  className="flex-1 rounded-xl h-11 font-bold"
                >
                  Apply Saved Rates
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
