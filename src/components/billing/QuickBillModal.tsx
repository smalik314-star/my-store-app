import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Product, Customer, InvoiceItem, Invoice } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { 
  X, 
  Plus, 
  Trash2, 
  Smartphone, 
  QrCode, 
  CreditCard, 
  Send, 
  Printer, 
  FileText,
  Search,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { invoiceService } from '../../services/invoiceService';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, roundMoney, subtractMoney } from '../../utils/currency';
import { useAuth } from '../../context/AuthContext';
import { handleFirestoreError, OperationType } from '../../utils/firestore-errors';
import { useMedicineSuggestions } from '../../hooks/useMedicineSuggestions';
import type { MasterMedicine } from '../../services/medicineMasterService';
import { calculateLossSale } from '../../utils/pricing';

interface QuickBillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface QuickCartItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  stockQuantity?: number;
  purchaseRate?: number;
}

type QuickBillSuggestion =
  | { type: 'inventory'; product: Product }
  | { type: 'catalogue'; medicine: MasterMedicine };

export function QuickBillModal({ isOpen, onClose }: QuickBillModalProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { showToast } = useToast();

  // Loading/saving state
  const [loading, setLoading] = useState(false);
  const saveInProgressRef = useRef(false);
  const invoiceRequestIdRef = useRef<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  
  // Custom metadata
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Cart Items: starts with one blank item
  const [cart, setCart] = useState<QuickCartItem[]>([
    { productId: '', name: '', quantity: 1, price: 0, total: 0 }
  ]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const medicineQueries = useMemo(
    () => Object.fromEntries(cart.map((item, index) => [String(index), item.name])),
    [cart]
  );
  const catalogueSuggestions = useMedicineSuggestions(medicineQueries, 10);

  // Payment configuration
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'due' | 'partial'>('paid');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'credit'>('cash');

  // Success Confirmation modal
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState<any>(null);

  // Load products subscription
  useEffect(() => {
    if (!isOpen || !user?.tenantId) return;

    const qProducts = query(
      collection(db, 'products'),
      where('tenantId', '==', user.tenantId)
    );
    const unsub = onSnapshot(qProducts, (snapshot) => {
      const items = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as Product))
        .filter(product => product.recordStatus !== 'inactive');
      setProducts(items);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    return () => unsub();
  }, [isOpen, user?.tenantId]);

  // Grand Total Calculation
  const grandTotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }, [cart]);

  // Handle auto-population of received amount
  useEffect(() => {
    if (paymentStatus === 'paid') {
      setAmountReceived(grandTotal.toString());
    } else if (paymentStatus === 'due') {
      setAmountReceived('0');
    }
  }, [grandTotal, paymentStatus]);

  // Filter products for autocomplete inline
  const getProductSuggestions = (nameInput: string, rowIndex: number): QuickBillSuggestion[] => {
    const term = nameInput.trim().toLowerCase();
    if (!term) return [];
    const inventory = products.filter(p =>
      p.name.toLowerCase().includes(term) || 
      (p.brand && p.brand.toLowerCase().includes(term)) ||
      (p.genericName && p.genericName.toLowerCase().includes(term)) ||
      (p.manufacturer && p.manufacturer.toLowerCase().includes(term))
    ).slice(0, 6).map(product => ({ type: 'inventory' as const, product }));
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

  const handleSelectItem = (index: number, product: Product) => {
    setCart(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          productId: product.id,
          name: product.name,
          quantity: 1,
          price: product.sellingPrice,
          total: product.sellingPrice,
          stockQuantity: product.stockQuantity,
          purchaseRate: Number(product.purchasePrice) || 0,
        };
      }
      return item;
    }));
    setFocusedIndex(null);
    setActiveSuggestionIndex(-1);
  };

  const handleSelectCatalogueItem = (index: number, medicine: MasterMedicine) => {
    setCart(previous => previous.map((item, itemIndex) => itemIndex === index
      ? { ...item, productId: '', name: medicine.name, price: 0, total: 0 }
      : item
    ));
    setFocusedIndex(null);
    setActiveSuggestionIndex(-1);
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>(`[data-quick-quantity="${index}"]`)?.focus();
    }, 0);
  };

  const focusQuickInput = (field: 'quantity' | 'price' | 'medicine', index: number) => {
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-quick-${field}="${index}"]`);
      input?.focus();
      input?.select();
    }, 0);
  };

  const handleMedicineKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    suggestions: QuickBillSuggestion[]
  ) => {
    if (event.key === 'Escape') {
      setFocusedIndex(null);
      setActiveSuggestionIndex(-1);
      return;
    }
    if (suggestions.length === 0) {
      if (event.key === 'Enter') {
        event.preventDefault();
        focusQuickInput('quantity', index);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex(current => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex(current => current <= 0 ? suggestions.length - 1 : current - 1);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const selected = suggestions[activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0];
      if (selected.type === 'inventory') handleSelectItem(index, selected.product);
      else handleSelectCatalogueItem(index, selected.medicine);
      focusQuickInput('quantity', index);
    }
  };

  const handleRowInputChange = (index: number, field: keyof QuickCartItem, value: any) => {
    setCart(prev => prev.map((item, i) => {
      if (i === index) {
        const updated = { ...item, [field]: value };

        if (field === 'name' && value !== item.name) {
          updated.productId = '';
          updated.stockQuantity = undefined;
          updated.purchaseRate = undefined;
        }
        
        // Recalculate line total instantly
        if (field === 'price' || field === 'quantity') {
          const qty = field === 'quantity' ? Math.max(1, Number(value)) : item.quantity;
          const rate = field === 'price' ? Math.max(0, Number(value)) : item.price;
          updated.quantity = qty;
          updated.price = rate;
          updated.total = qty * rate;
        }
        return updated;
      }
      return item;
    }));
  };

  const handleAddRow = () => {
    setCart(prev => [...prev, { productId: '', name: '', quantity: 1, price: 0, total: 0 }]);
  };

  const handleRemoveRow = (index: number) => {
    setCart(prev => {
      const copy = [...prev];
      copy.splice(index, 1);
      if (copy.length === 0) {
        return [{ productId: '', name: '', quantity: 1, price: 0, total: 0 }];
      }
      return copy;
    });
  };

  // Safe closing guard
  const handleCloseAttempt = () => {
    const hasData = cart.some(item => item.name.trim() || item.price > 0) || customerName || customerPhone;
    if (hasData) {
      if (window.confirm('You have unsaved items in your Quick Bill. Are you sure you want to discard?')) {
        onClose();
        resetForm();
      }
    } else {
      onClose();
      resetForm();
    }
  };

  const resetForm = () => {
    invoiceRequestIdRef.current = null;
    setCart([{ productId: '', name: '', quantity: 1, price: 0, total: 0 }]);
    setCustomerName('');
    setCustomerPhone('');
    setPaymentStatus('paid');
    setPaymentMethod('cash');
    setAmountReceived('');
    setSavedInvoice(null);
    setShowSuccess(false);
  };

  const handleSaveBill = async (actionType: 'save_only' | 'whatsapp' | 'print') => {
    if (!user?.tenantId) return;
    if (saveInProgressRef.current) return;

    const validItems = cart.filter(item => item.name.trim() !== '');
    if (validItems.length === 0) {
      showToast('Please enter at least one item name to generate a bill.', 'danger');
      return;
    }

    saveInProgressRef.current = true;
    invoiceRequestIdRef.current ||= crypto.randomUUID();
    setLoading(true);
    try {
      const prefix = settings?.invoicePrefix || 'INV';
      const parsedAmtReceived = roundMoney(Number(amountReceived) || 0);
      const parsedAmtDue = Math.max(0, subtractMoney(grandTotal, parsedAmtReceived));

      // Build invoice format compatible with main DB
      const invoiceItems: InvoiceItem[] = validItems.map(item => ({
        productId: item.productId || 'custom',
        name: item.name,
        sku: 'QKB',
        batchNumber: 'N/A',
        quantity: item.quantity,
        price: item.price,
        gst: 0, // Quick bills bypass taxes
        total: item.total
      }));

      const finalCustomerName = customerName.trim() || 'Walk-In Customer';

      const invoiceData: any = {
        requestId: invoiceRequestIdRef.current,
        customerId: 'walk-in', // Quick Bills default to Counter Walk-In
        customerName: finalCustomerName,
        items: invoiceItems,
        subtotal: grandTotal,
        gstTotal: 0,
        discount: 0,
        grandTotal: grandTotal,
        paymentStatus,
        paymentMethod,
        amountReceived: parsedAmtReceived,
        outstandingAmount: parsedAmtDue,
        isQuickBill: true,
        invoiceDate: Timestamp.now()
      };

      const saved = await invoiceService.saveInvoice(user.tenantId, invoiceData, `${prefix}-QKB`);
      
      const payload = {
        id: saved!.id,
        invoiceNumber: saved!.invoiceNumber,
        customerName: finalCustomerName,
        customerPhone: customerPhone.trim(),
        grandTotal,
        items: invoiceItems,
        paymentStatus,
        amountReceived: parsedAmtReceived,
        outstandingAmount: parsedAmtDue,
      };

      setSavedInvoice(payload);
      setShowSuccess(true);
      showToast('Quick Bill saved to records successfully!', 'success');

      if (actionType === 'whatsapp' && customerPhone.trim()) {
        triggerWhatsAppShare(payload);
      } else if (actionType === 'print') {
        // Trigger silent printing
        window.open(`/invoice/${saved!.id}/print`, '_blank');
      }
    } catch (err: any) {
      console.error('Quick Bill Save Error:', err);
      showToast(err.message || 'Failed to save Quick Bill', 'danger');
    } finally {
      saveInProgressRef.current = false;
      setLoading(false);
    }
  };

  const triggerWhatsAppShare = (bill: any) => {
    const storeName = settings?.storeName || 'Pharmacy Store';
    const cleanPhone = bill.customerPhone.replace(/\D/g, '');
    const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    
    const itemLines = bill.items.map((item: any) => 
      `• ${item.name} (${item.quantity} x ₹${item.price}) = ₹${item.total.toFixed(1)}`
    ).join('\n');

    const paymentText = bill.paymentStatus === 'paid' 
      ? `✅ FULLY PAID via ${paymentMethod.toUpperCase()}`
      : bill.paymentStatus === 'due'
        ? `⚠️ OUTSTANDING BALANCE: ₹${bill.grandTotal}`
        : `🔸 PARTIAL: Received ₹${bill.amountReceived}, Due ₹${bill.outstandingAmount}`;

    const textMessage = 
`*Estimate Bill from ${storeName}*
-----------------------------
🧾 *Receipt:* ${bill.invoiceNumber}
👤 *Customer:* ${bill.customerName}
-----------------------------
*Items:*
${itemLines}

*Total Amount:* ₹${bill.grandTotal.toFixed(1)}
*Payment:* ${paymentText}
-----------------------------
Thank you! 🙏
_Powered by PharmaFlow_`;

    const encodedText = encodeURIComponent(textMessage);
    const waUrl = `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodedText}`;
    
    // Safety click redirect
    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto no-print">
        {/* Dark blur overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleCloseAttempt}
          className="fixed inset-0 bg-text/50 backdrop-blur-md"
        />

        {/* Modal Core Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl bg-surface border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col my-8"
        >
          {/* Header Banner */}
          <div className="bg-primary/5 border-b border-border p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <h2 className="text-xl font-black text-text tracking-tight flex items-center gap-2">
                  Quick Bill Creator
                  <Badge variant="warning" className="text-[9px] uppercase tracking-wider font-extrabold py-0.5">
                    No-Taxes Mode
                  </Badge>
                </h2>
                <p className="text-xs text-text/50 font-bold uppercase tracking-wider mt-0.5">Rough Estimate & Rapid Counter Billing</p>
              </div>
            </div>
            <button
              onClick={handleCloseAttempt}
              className="p-2 hover:bg-background text-text/40 hover:text-text rounded-full transition-colors cursor-pointer"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {!showSuccess ? (
            <div className="p-6 md:p-8 space-y-6 flex-1 max-h-[80vh] overflow-y-auto custom-scrollbar">
              {/* Optional Customer Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-background/40 p-4.5 rounded-2xl border border-border">
                <div>
                  <label className="block text-[10px] font-black text-text/40 uppercase tracking-widest mb-1.5">
                    Customer Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter Walk-In Customer Name..."
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-xs font-black outline-none focus:border-primary text-text placeholder:text-text/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-text/40 uppercase tracking-widest mb-1.5">
                    WhatsApp Mobile Number (Optional)
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="10-digit mobile for easy sharing..."
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-xs font-black outline-none focus:border-primary text-text placeholder:text-text/20"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-border rounded-2xl overflow-hidden bg-surface">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-background/40 border-b border-border">
                      <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider w-12 text-text/40">#</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-text/40">Medicine / Item Name</th>
                      <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider w-24 text-text/40">Quantity</th>
                      <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider w-28 text-text/40">Price (₹)</th>
                      <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider w-28 text-text/40">Total (₹)</th>
                      <th className="px-4 py-3 text-center w-12 text-text/40"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {cart.map((item, index) => {
                      const suggestions = getProductSuggestions(item.name, index);
                      const lossSale = calculateLossSale(
                        item.price,
                        item.purchaseRate || 0,
                        item.quantity
                      );
                      return (
                        <tr key={index} className="hover:bg-background/10 transition-colors relative">
                          {/* Row ID */}
                          <td className="px-4 py-3 text-center text-xs font-black text-text/30">
                            {index + 1}
                          </td>

                          {/* Searchable input / name */}
                          <td className="px-4 py-3 relative">
                            <input
                              data-quick-medicine={index}
                              type="text"
                              placeholder="Type item name / medicine..."
                              value={item.name}
                              onChange={(e) => {
                                handleRowInputChange(index, 'name', e.target.value);
                                setFocusedIndex(index);
                                setActiveSuggestionIndex(-1);
                              }}
                              onFocus={() => {
                                setFocusedIndex(index);
                                setActiveSuggestionIndex(-1);
                              }}
                              onKeyDown={(event) => handleMedicineKeyDown(event, index, suggestions)}
                              className="w-full bg-transparent border-none text-xs font-black text-text focus:outline-none focus:ring-0 placeholder:text-text/20"
                            />

                            {/* Autocomplete suggestion drop */}
                            <AnimatePresence>
                              {focusedIndex === index && item.name.trim() && suggestions.length > 0 && (
                                <motion.div
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 5 }}
                                  className="absolute left-4 right-4 top-full mt-1.5 z-40 bg-surface border border-border rounded-2xl shadow-xl p-1 max-h-48 overflow-y-auto"
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
                                      onMouseEnter={() => setActiveSuggestionIndex(suggestionIndex)}
                                      onMouseDown={() => {
                                        if (isInventory) handleSelectItem(index, suggestion.product);
                                        else handleSelectCatalogueItem(index, suggestion.medicine);
                                      }}
                                      className={cn(
                                        "w-full p-2.5 hover:bg-background rounded-xl text-left flex items-center justify-between transition-colors",
                                        activeSuggestionIndex === suggestionIndex && "bg-primary/10"
                                      )}
                                    >
                                      <div>
                                        <p className="text-xs font-black text-text">{medicine.name}</p>
                                        <p className="text-[9px] font-bold text-text/30 mt-0.5">
                                          {isInventory
                                            ? `Inventory · ${suggestion.product.brand || suggestion.product.manufacturer || 'No brand'}`
                                            : `Medicine catalogue · Mfg: ${suggestion.medicine.manufacturer || 'Not listed'}`}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        {isInventory ? (
                                          <>
                                            <p className="text-xs font-black text-primary">₹{suggestion.product.sellingPrice}</p>
                                            <p className={cn(
                                              "text-[9px] font-bold",
                                              suggestion.product.stockQuantity <= 5 ? "text-danger" : "text-success"
                                            )}>Stock: {suggestion.product.stockQuantity}</p>
                                          </>
                                        ) : (
                                          <p className="text-[9px] font-black text-primary uppercase">Catalogue</p>
                                        )}
                                      </div>
                                    </button>
                                  )})}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </td>

                          {/* Quantity selector */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1 bg-background/50 rounded-lg p-0.5 border border-border w-20 mx-auto">
                              <button
                                type="button"
                                onClick={() => handleRowInputChange(index, 'quantity', Math.max(1, item.quantity - 1))}
                                className="h-5 w-5 rounded flex items-center justify-center text-xs text-text/60 hover:bg-background font-black"
                              >
                                -
                              </button>
                              <input
                                data-quick-quantity={index}
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) => handleRowInputChange(index, 'quantity', e.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    focusQuickInput('price', index);
                                  }
                                }}
                                className="w-6 bg-transparent text-center text-xs font-black focus:outline-none focus:ring-0 border-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleRowInputChange(index, 'quantity', item.quantity + 1)}
                                className="h-5 w-5 rounded flex items-center justify-center text-xs text-text/60 hover:bg-background font-black"
                              >
                                +
                              </button>
                            </div>
                          </td>

                          {/* Price */}
                          <td className="px-4 py-3">
                            <input
                              data-quick-price={index}
                              type="number"
                              min={0}
                              placeholder="0"
                              value={item.price || ''}
                              onChange={(e) => handleRowInputChange(index, 'price', e.target.value)}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter') return;
                                event.preventDefault();
                                if (index < cart.length - 1) {
                                  focusQuickInput('medicine', index + 1);
                                } else {
                                  handleAddRow();
                                  focusQuickInput('medicine', index + 1);
                                }
                              }}
                              aria-invalid={lossSale.isLoss}
                              className={cn(
                                "w-full bg-transparent text-right text-xs font-black focus:outline-none border-none p-0 outline-none",
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

                          {/* Total Line Amount */}
                          <td className="px-4 py-3 text-right font-black text-xs text-text">
                            ₹{item.total ? item.total.toFixed(2) : '0.00'}
                          </td>

                          {/* Remove Row */}
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(index)}
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-text/20 hover:text-danger hover:bg-danger/10 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add item rows button & total banner */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-5 py-3 rounded-xl bg-primary text-white font-black text-xs flex items-center gap-1.5 hover:bg-primary/95 transition-all shadow-md shadow-primary/10 w-full sm:w-auto justify-center"
                >
                  <Plus className="h-4 w-4" />
                  Add Quick Entry Row
                </button>
                <div className="flex items-center gap-3 bg-primary/5 border border-primary/10 px-5 py-3 rounded-2xl w-full sm:w-auto justify-between">
                  <span className="text-[10px] font-black text-text/40 uppercase tracking-widest">Bill Total:</span>
                  <span className="text-xl font-black text-primary tracking-tight">{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {/* Payment Details Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-background/20 p-5 rounded-2xl border border-border">
                {/* Status Toggles */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-text/40 uppercase tracking-widest">Payment Status</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['paid', 'due', 'partial'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          setPaymentStatus(status);
                          if (status === 'paid') setPaymentMethod('cash');
                          else if (status === 'due') setPaymentMethod('credit');
                        }}
                        className={cn(
                          "py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all",
                          paymentStatus === status 
                            ? "bg-primary border-primary text-white shadow-md shadow-primary/10" 
                            : "bg-background border-border text-text/50 hover:border-text/20"
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>

                  {paymentStatus === 'partial' && (
                    <div className="space-y-1.5 pt-1">
                      <label className="block text-[9px] font-black text-text/40 uppercase tracking-widest">Amount Paid (₹)</label>
                      <input
                        type="number"
                        min={0}
                        max={grandTotal}
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-xs font-black outline-none focus:border-primary text-text"
                      />
                      <div className="flex justify-between text-[10px] font-bold text-danger bg-danger/5 p-2 rounded-lg border border-danger/10">
                        <span>Balance Due (Udhaar)</span>
                        <span>₹{Math.max(0, grandTotal - (Number(amountReceived) || 0)).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Method Toggles */}
                {paymentStatus !== 'due' && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black text-text/40 uppercase tracking-widest">Payment Method</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['cash', 'upi', 'card'] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={cn(
                            "py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all flex flex-col items-center justify-center gap-1",
                            paymentMethod === method 
                              ? "bg-text border-text text-white" 
                              : "bg-background border-border text-text/50 hover:border-text/20"
                          )}
                        >
                          {method === 'upi' ? <QrCode className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                          <span className="text-[10px]">{method}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Success confirmation screen inside the Modal */
            <div className="p-8 text-center space-y-6 flex-1 max-h-[80vh] overflow-y-auto">
              <div className="mx-auto h-16 w-16 bg-success/10 text-success rounded-full flex items-center justify-center animate-bounce">
                <CheckCircle className="h-10 w-10" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-2xl font-black text-text tracking-tight">Bill Generated successfully!</h3>
                <p className="text-xs text-text/40 font-bold uppercase tracking-wider">Quick Invoice: {savedInvoice?.invoiceNumber}</p>
              </div>

              {/* Quick Summary card */}
              <div className="max-w-md mx-auto bg-background/50 border border-border rounded-2xl p-5 text-left space-y-3">
                <div className="flex justify-between items-center text-xs font-bold text-text/50">
                  <span>Customer Name:</span>
                  <span className="text-text font-black">{savedInvoice?.customerName}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold text-text/50">
                  <span>Grand Total:</span>
                  <span className="text-primary font-black text-base">₹{savedInvoice?.grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold text-text/50">
                  <span>Payment Status:</span>
                  <Badge variant={savedInvoice?.paymentStatus === 'paid' ? 'success' : 'danger'} className="text-[9px] uppercase">
                    {savedInvoice?.paymentStatus}
                  </Badge>
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                {customerPhone.trim() ? (
                  <Button
                    variant="primary"
                    onClick={() => triggerWhatsAppShare(savedInvoice)}
                    className="flex-1 py-3.5 rounded-xl font-black text-xs uppercase bg-success text-white border-transparent hover:bg-success/90 flex items-center justify-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    Share on WhatsApp
                  </Button>
                ) : (
                  <div className="w-full flex flex-col gap-2">
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/5 border border-danger/10 text-danger text-[11px] font-bold max-w-md mx-auto">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>WhatsApp sharing is locked because no phone number was entered.</span>
                    </div>
                  </div>
                )}
                
                <Button
                  variant="outline"
                  onClick={() => window.open(`/invoice/${savedInvoice?.id}/print`, '_blank')}
                  className="flex-1 py-3.5 rounded-xl font-black text-xs uppercase border-border hover:bg-background flex items-center justify-center gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print Receipt
                </Button>
              </div>

              <div className="pt-6 border-t border-border max-w-md mx-auto">
                <Button
                  variant="secondary"
                  onClick={resetForm}
                  className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider"
                >
                  Create Another Quick Bill
                </Button>
              </div>
            </div>
          )}

          {/* Footer controls */}
          {!showSuccess && (
            <div className="border-t border-border p-6 bg-background/50 flex flex-col sm:flex-row gap-3">
              <Button
                variant="secondary"
                onClick={handleCloseAttempt}
                className="py-3.5 rounded-xl font-black text-xs uppercase tracking-wider w-full sm:w-auto"
              >
                Cancel / Discard
              </Button>
              <div className="flex-1" />
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {customerPhone.trim() && (
                  <Button
                    variant="primary"
                    onClick={() => handleSaveBill('whatsapp')}
                    isLoading={loading}
                    className="py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-success text-white border-transparent hover:bg-success/90 flex items-center justify-center gap-1.5"
                  >
                    <Send className="h-4 w-4" />
                    Save & WhatsApp Share
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => handleSaveBill('print')}
                  isLoading={loading}
                  className="py-3.5 rounded-xl font-black text-xs uppercase tracking-wider border-border hover:bg-background flex items-center justify-center gap-1.5"
                >
                  <Printer className="h-4 w-4" />
                  Save & Print
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleSaveBill('save_only')}
                  isLoading={loading}
                  className="py-3.5 rounded-xl font-black text-xs uppercase tracking-wider w-full sm:w-auto"
                >
                  Save Bill Only
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
