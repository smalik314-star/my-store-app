import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, AlertCircle, Package, IndianRupee, Calendar, MapPin, 
  ImageIcon, Percent, TrendingUp, Calculator, Info,
  Barcode, Factory, Tag, ChevronDown, ChevronUp, Upload, Trash2,
  CheckCircle2, FileText
} from 'lucide-react';
import { Product, ProductBatch } from '../../types';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { uploadProductImage } from '../../utils/storage';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/currency';
import { toJsDate } from '../../utils/date';
import { useAuth } from '../../context/AuthContext';
import { brandService } from '../../services/brandService';
import { db } from '../../firebase/config';
import { medicineMasterService, MasterMedicine } from '../../services/medicineMasterService';
import { MedicineAutocomplete } from '../common/MedicineAutocomplete';

interface ProductFormProps {
  product?: Product;
  onSave: (data: any, saveAndAddAnother?: boolean) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
}

const CATEGORIES = ['Tablets', 'Capsules', 'Syrups', 'Injections', 'Topicals', 'Medical Supplies', 'Others'];
const UNITS = ['Strip', 'Bottle', 'Box', 'Piece', 'Vial', 'Tube'];

export function ProductForm({ product, onSave, onClose, loading: saveLoading }: ProductFormProps) {
  const getDefaultExpiryDate = () => {
    const futureYear = new Date().getFullYear() + 2;
    const currentMonthNum = new Date().getMonth() + 1;
    const lastDay = new Date(futureYear, currentMonthNum, 0).getDate();
    const monthStr = String(currentMonthNum).padStart(2, '0');
    const lastDayStr = String(lastDay).padStart(2, '0');
    return `${futureYear}-${monthStr}-${lastDayStr}`;
  };

  const getDefaultMfgDate = () => {
    const currentYear = new Date().getFullYear();
    const currentMonthNum = new Date().getMonth() + 1;
    const monthStr = String(currentMonthNum).padStart(2, '0');
    return `${currentYear}-${monthStr}-01`;
  };

  const [formData, setFormData] = useState({
    name: product?.name || '',
    brand: product?.brand || '',
    batchNumber: product?.batchNumber || '',
    manufacturingDate: product?.manufacturingDate 
      ? toJsDate(product.manufacturingDate).toISOString().split('T')[0] 
      : getDefaultMfgDate(),
    expiryDate: product?.expiryDate 
      ? toJsDate(product.expiryDate).toISOString().split('T')[0] 
      : getDefaultExpiryDate(),
    purchasePrice: product?.purchasePrice || 0,
    sellingPrice: product?.sellingPrice || 0,
    stockQuantity: product?.stockQuantity || 0,
    
    // Optional Fields
    genericName: product?.genericName || '',
    category: product?.category || 'Others',
    manufacturer: product?.manufacturer || '',
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    mrp: product?.mrp || 0,
    gstPercentage: product?.gstPercentage !== undefined ? product.gstPercentage : 12,
    unit: product?.unit || 'Strip',
    minimumStock: product?.minimumStock !== undefined ? product.minimumStock : 10,
    rackLocation: product?.rackLocation || '',
    description: product?.description || '',
    imageUrl: product?.imageUrl || '',
  });

  // Extract month and year from form dates to sync select fields
  const [mfgMonth, setMfgMonth] = useState(() => {
    const initialDate = product?.manufacturingDate ? toJsDate(product.manufacturingDate).toISOString().split('T')[0] : '';
    if (initialDate) {
      return initialDate.split('-')[1] || '';
    }
    return String(new Date().getMonth() + 1).padStart(2, '0');
  });

  const [mfgYear, setMfgYear] = useState(() => {
    const initialDate = product?.manufacturingDate ? toJsDate(product.manufacturingDate).toISOString().split('T')[0] : '';
    if (initialDate) {
      return initialDate.split('-')[0] || '';
    }
    return String(new Date().getFullYear());
  });

  const [expMonth, setExpMonth] = useState(() => {
    const initialDate = product?.expiryDate ? toJsDate(product.expiryDate).toISOString().split('T')[0] : '';
    if (initialDate) {
      return initialDate.split('-')[1] || '';
    }
    return String(new Date().getMonth() + 1).padStart(2, '0');
  });

  const [expYear, setExpYear] = useState(() => {
    const initialDate = product?.expiryDate ? toJsDate(product.expiryDate).toISOString().split('T')[0] : '';
    if (initialDate) {
      return initialDate.split('-')[0] || '';
    }
    return String(new Date().getFullYear() + 2);
  });

  // Synchronize dropdown state with formData.manufacturingDate & expiryDate changes (e.g. from autofill)
  useEffect(() => {
    if (formData.manufacturingDate) {
      const parts = formData.manufacturingDate.split('-');
      if (parts.length >= 2) {
        setMfgYear(parts[0]);
        setMfgMonth(parts[1]);
      }
    }
  }, [formData.manufacturingDate]);

  useEffect(() => {
    if (formData.expiryDate) {
      const parts = formData.expiryDate.split('-');
      if (parts.length >= 2) {
        setExpYear(parts[0]);
        setExpMonth(parts[1]);
      }
    }
  }, [formData.expiryDate]);

  const handleMfgMonthChange = (monthValue: string) => {
    setMfgMonth(monthValue);
    const year = mfgYear || String(new Date().getFullYear());
    setFormData(prev => ({
      ...prev,
      manufacturingDate: `${year}-${monthValue}-01`
    }));
  };

  const handleMfgYearChange = (yearValue: string) => {
    setMfgYear(yearValue);
    const month = mfgMonth || '01';
    setFormData(prev => ({
      ...prev,
      manufacturingDate: `${yearValue}-${month}-01`
    }));
  };

  const handleExpMonthChange = (monthValue: string) => {
    setExpMonth(monthValue);
    const year = expYear || String(new Date().getFullYear() + 2);
    // Find last day of month
    const y = parseInt(year, 10);
    const m = parseInt(monthValue, 10);
    const lastDay = new Date(y, m, 0).getDate();
    const lastDayStr = String(lastDay).padStart(2, '0');
    setFormData(prev => ({
      ...prev,
      expiryDate: `${year}-${monthValue}-${lastDayStr}`
    }));
  };

  const handleExpYearChange = (yearValue: string) => {
    setExpYear(yearValue);
    const month = expMonth || '12';
    // Find last day of month
    const y = parseInt(yearValue, 10);
    const m = parseInt(month, 10);
    const lastDay = new Date(y, m, 0).getDate();
    const lastDayStr = String(lastDay).padStart(2, '0');
    setFormData(prev => ({
      ...prev,
      expiryDate: `${yearValue}-${month}-${lastDayStr}`
    }));
  };

  const { user } = useAuth();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allBrands, setAllBrands] = useState<string[]>([]);
  
  // Custom inputs for productName and brandName
  const [productNameInput, setProductNameInput] = useState(product?.name || '');
  const [debouncedProductName, setDebouncedProductName] = useState(product?.name || '');
  
  const [brandNameInput, setBrandNameInput] = useState(product?.brand || '');
  const [debouncedBrandName, setDebouncedBrandName] = useState(product?.brand || '');

  const [productActiveIndex, setProductActiveIndex] = useState(-1);
  const [brandActiveIndex, setBrandActiveIndex] = useState(-1);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);

  const [masterSuggestions, setMasterSuggestions] = useState<MasterMedicine[]>([]);
  const [masterBrandSuggestions, setMasterBrandSuggestions] = useState<string[]>([]);

  // Synchronize debounced values
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedProductName(productNameInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [productNameInput]);

  // Search local IndexedDB Master Medicine database when name input changes
  useEffect(() => {
    if (debouncedProductName.trim().length >= 2) {
      medicineMasterService.search(debouncedProductName).then(results => {
        setMasterSuggestions(results);
      });
    } else {
      setMasterSuggestions([]);
    }
  }, [debouncedProductName]);

  // Search local IndexedDB Master Medicine database for brands when brand input changes
  useEffect(() => {
    if (debouncedBrandName.trim().length >= 2) {
      medicineMasterService.searchBrands(debouncedBrandName).then(results => {
        setMasterBrandSuggestions(results);
      });
    } else {
      setMasterBrandSuggestions([]);
    }
  }, [debouncedBrandName]);

  const resolveSelectedBrand = (medicineName: string, selectedBrand?: string) => {
    const directBrand = selectedBrand?.trim();
    if (directBrand) return directBrand;

    const normalizedName = medicineName.trim().toLowerCase();
    const inventoryBrand = allProducts.find(
      item => item.name.trim().toLowerCase() === normalizedName && item.brand?.trim()
    )?.brand?.trim();
    if (inventoryBrand) return inventoryBrand;

    const masterBrand = masterSuggestions.find(
      item => item.name.trim().toLowerCase() === normalizedName && item.brand?.trim()
    )?.brand?.trim();
    if (masterBrand) return masterBrand;

    return medicineMasterService.resolveBuiltInBrand(medicineName);
  };

  const handleSelectMasterMedicine = (med: MasterMedicine) => {
    const resolvedBrand = resolveSelectedBrand(med.name, med.brand);
    const resolvedManufacturer = med.manufacturer?.trim() || '';
    setProductNameInput(med.name);
    setBrandNameInput(resolvedBrand);
    setFormData(prev => ({
      ...prev,
      name: med.name,
      brand: resolvedBrand,
      manufacturer: resolvedManufacturer,
    }));
    setShowProductDropdown(false);
    focusNextProductField(resolvedManufacturer);
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBrandName(brandNameInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [brandNameInput]);

  // Synchronize inputs with formData
  useEffect(() => {
    setFormData(prev => ({ ...prev, name: productNameInput }));
  }, [productNameInput]);

  useEffect(() => {
    setFormData(prev => ({ ...prev, brand: brandNameInput }));
  }, [brandNameInput]);

  // Fetch products and brands on mount / tenantId change
  useEffect(() => {
    if (!user?.tenantId) return;

    const loadData = async () => {
      try {
        const productsQuery = query(
          collection(db, 'products'),
          where('tenantId', '==', user.tenantId)
        );
        const productsSnap = await getDocs(productsQuery);
        const productsList = productsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];
        setAllProducts(productsList);

        const brandsQuery = query(
          collection(db, 'brands'),
          where('tenantId', '==', user.tenantId)
        );
        const brandsSnap = await getDocs(brandsQuery);
        const brandsList = brandsSnap.docs.map(doc => doc.data().name) as string[];

        const productBrands = productsList
          .map(p => p.brand)
          .filter((b): b is string => !!b);
        
        const uniqueBrands = Array.from(new Set([...brandsList, ...productBrands]));
        setAllBrands(uniqueBrands);
      } catch (err) {
        console.error('Error fetching autocomplete data:', err);
      }
    };

    loadData();
  }, [user?.tenantId]);

  const handleSelectProductSuggestion = (selectedProd: Product) => {
    const resolvedBrand = resolveSelectedBrand(selectedProd.name, selectedProd.brand);
    const resolvedManufacturer = selectedProd.manufacturer?.trim() || '';
    setProductNameInput(selectedProd.name);
    setBrandNameInput(resolvedBrand);
    setFormData(prev => ({
      ...prev,
      name: selectedProd.name,
      brand: resolvedBrand,
      manufacturer: resolvedManufacturer,
    }));
    setShowProductDropdown(false);
    focusNextProductField(resolvedManufacturer);
  };

  const focusNextProductField = (resolvedManufacturer: string) => {
    setTimeout(() => {
      const targetName = resolvedManufacturer ? 'batchNumber' : 'manufacturer';
      document.querySelector<HTMLInputElement>(`input[name="${targetName}"]`)?.focus();
    }, 50);
  };

  const uniqueProductsSuggestions: Product[] = [];
  const seenNames = new Set<string>();
  for (const p of allProducts) {
    const norm = p.name.trim().toLowerCase();
    if (norm.includes(debouncedProductName.trim().toLowerCase()) && norm !== productNameInput.trim().toLowerCase()) {
      if (!seenNames.has(norm)) {
        seenNames.add(norm);
        uniqueProductsSuggestions.push(p);
      }
    }
  }

  const brandSuggestions = useMemo(() => {
    if (debouncedBrandName.trim() === '') return [];
    
    const localMatch = allBrands.filter(brandName => 
      brandName.toLowerCase().includes(debouncedBrandName.toLowerCase()) &&
      brandName.toLowerCase() !== brandNameInput.toLowerCase()
    );

    // Combine local brand suggestions with master database brand suggestions and keep unique values
    const combined = Array.from(new Set([...localMatch, ...masterBrandSuggestions]));
    return combined;
  }, [allBrands, debouncedBrandName, brandNameInput, masterBrandSuggestions]);

  const combinedSuggestions = [
    ...uniqueProductsSuggestions.slice(0, 5).map(p => ({ type: 'inventory' as const, data: p })),
    ...masterSuggestions.slice(0, 10).map(med => ({ type: 'master' as const, data: med }))
  ];

  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showProductDropdown || combinedSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setProductActiveIndex(prev => (prev + 1) % combinedSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setProductActiveIndex(prev => (prev - 1 + combinedSuggestions.length) % combinedSuggestions.length);
    } else if (e.key === 'Enter') {
      // Enter selects the active suggestion, defaulting to the first one if none is highlighted.
      e.preventDefault();
      const activeIdx = productActiveIndex >= 0 ? productActiveIndex : 0;
      if (activeIdx >= 0 && activeIdx < combinedSuggestions.length) {
        const item = combinedSuggestions[activeIdx];
        if (item.type === 'inventory') {
          handleSelectProductSuggestion(item.data);
        } else {
          handleSelectMasterMedicine(item.data);
        }
        setShowProductDropdown(false);
      }
    } else if (e.key === 'Tab') {
      // Tab key selects the active suggestion, defaulting to the first one if none is highlighted.
      e.preventDefault();
      const activeIdx = productActiveIndex >= 0 ? productActiveIndex : 0;
      if (activeIdx >= 0 && activeIdx < combinedSuggestions.length) {
        const item = combinedSuggestions[activeIdx];
        if (item.type === 'inventory') {
          handleSelectProductSuggestion(item.data);
        } else {
          handleSelectMasterMedicine(item.data);
        }
        setShowProductDropdown(false);
      }
    } else if (e.key === 'Escape') {
      setShowProductDropdown(false);
    }
  };

  const handleBrandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showBrandDropdown || brandSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setBrandActiveIndex(prev => (prev + 1) % brandSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setBrandActiveIndex(prev => (prev - 1 + brandSuggestions.length) % brandSuggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const activeIdx = brandActiveIndex >= 0 ? brandActiveIndex : 0;
      if (activeIdx >= 0 && activeIdx < brandSuggestions.length) {
        setBrandNameInput(brandSuggestions[activeIdx]);
        setShowBrandDropdown(false);
        // Focus Batch Number field
        setTimeout(() => {
          const batchInput = document.querySelector('input[name="batchNumber"]') as HTMLInputElement;
          if (batchInput) batchInput.focus();
        }, 50);
      }
    } else if (e.key === 'Tab') {
      // Tab key selects the active suggestion, defaulting to the first one if none is highlighted.
      e.preventDefault();
      const activeIdx = brandActiveIndex >= 0 ? brandActiveIndex : 0;
      if (activeIdx >= 0 && activeIdx < brandSuggestions.length) {
        setBrandNameInput(brandSuggestions[activeIdx]);
        setShowBrandDropdown(false);
        // Focus Batch Number field
        setTimeout(() => {
          const batchInput = document.querySelector('input[name="batchNumber"]') as HTMLInputElement;
          if (batchInput) batchInput.focus();
        }, 50);
      }
    } else if (e.key === 'Escape') {
      setShowBrandDropdown(false);
    }
  };

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(product?.imageUrl || '');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOptionalExpanded, setIsOptionalExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto Calculations
  const profit = formData.sellingPrice - formData.purchasePrice;
  const profitPercentage = formData.purchasePrice > 0 ? (profit / formData.purchasePrice) * 100 : 0;
  const marginColor = profitPercentage > 20 ? 'text-success' : profitPercentage > 10 ? 'text-warning' : 'text-danger';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError('Image size should be less than 2MB');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent, saveAndAddAnother = false) => {
    e.preventDefault();
    setError(null);

    // Section 1 Required Fields Validation
    if (!formData.name.trim()) {
      setError('Product Name is required');
      return;
    }
    if (!formData.manufacturer.trim()) {
      setError('Manufacturer is required');
      return;
    }
    if (!formData.batchNumber.trim()) {
      setError('Batch Number is required');
      return;
    }
    if (!formData.manufacturingDate) {
      setError('Manufacturing Date is required');
      return;
    }
    if (!formData.expiryDate) {
      setError('Expiry Date is required');
      return;
    }
    if (formData.purchasePrice < 0) {
      setError('Purchase Price cannot be negative');
      return;
    }
    if (formData.sellingPrice < formData.purchasePrice) {
      setError('Sale Price cannot be lower than Purchase Price');
      return;
    }
    if (formData.stockQuantity < 0) {
      setError('Stock Quantity cannot be negative');
      return;
    }

    const mfgDate = new Date(formData.manufacturingDate);
    const expDate = new Date(formData.expiryDate);
    if (expDate <= mfgDate) {
      setError('Expiry Date must be after Manufacturing Date');
      return;
    }

    try {
      let imageUrl = formData.imageUrl;
      
      if (imageFile) {
        setIsUploading(true);
        const storageId = product?.id || `temp_${Date.now()}`;
        if (!user?.tenantId) throw new Error('Store profile is not available');
        imageUrl = await uploadProductImage(imageFile, user.tenantId, storageId, (progress) => setUploadProgress(progress));
        setIsUploading(false);
      }

      const manufacturingDate = Timestamp.fromDate(new Date(formData.manufacturingDate));
      const expiryDate = Timestamp.fromDate(new Date(formData.expiryDate));
      const stockQuantity = Number(formData.stockQuantity);
      const batchNumber = formData.batchNumber.trim();
      const existingBatches = product?.batches || [];
      let batches: ProductBatch[];

      if (existingBatches.length === 0) {
        // Products created before batch tracking have a total stock value but no
        // batch ledger. Saving the product once safely creates its opening batch.
        batches = [{
          batchNumber,
          mfgDate: manufacturingDate,
          expiryDate,
          purchasePrice: Number(formData.purchasePrice),
          salePrice: Number(formData.sellingPrice),
          quantity: stockQuantity,
          createdAt: Timestamp.now(),
        }];
      } else {
        // Preserve all existing batches. If the user changes total stock, apply
        // only the difference to the batch represented by the product summary.
        batches = existingBatches.map(batch => ({ ...batch }));
        const existingTotal = batches.reduce(
          (sum, batch) => sum + Math.max(0, Number(batch.quantity) || 0),
          0
        );
        const stockDifference = stockQuantity - existingTotal;
        const originalBatchNumber = product?.batchNumber?.trim().toUpperCase();
        let activeBatchIndex = batches.findIndex(
          batch => batch.batchNumber?.trim().toUpperCase() === originalBatchNumber
        );

        if (activeBatchIndex < 0) {
          activeBatchIndex = batches.findIndex(
            batch => batch.batchNumber?.trim().toUpperCase() === batchNumber.toUpperCase()
          );
        }

        if (activeBatchIndex < 0) {
          if (stockDifference < 0) {
            throw new Error('Existing batch stock is higher than total stock. Adjust it through Purchase/Stock entries.');
          }
          batches.push({
            batchNumber,
            mfgDate: manufacturingDate,
            expiryDate,
            purchasePrice: Number(formData.purchasePrice),
            salePrice: Number(formData.sellingPrice),
            quantity: stockDifference,
            createdAt: Timestamp.now(),
          });
        } else {
          const activeBatch = batches[activeBatchIndex];
          const reconciledQuantity = (Number(activeBatch.quantity) || 0) + stockDifference;
          if (reconciledQuantity < 0) {
            throw new Error('Total stock cannot be lower than stock held in the other batches. Adjust stock through Purchase/Stock entries.');
          }
          batches[activeBatchIndex] = {
            ...activeBatch,
            batchNumber,
            mfgDate: manufacturingDate,
            expiryDate,
            purchasePrice: Number(formData.purchasePrice),
            salePrice: Number(formData.sellingPrice),
            quantity: reconciledQuantity,
          };
        }
      }

      const dataToSave = {
        name: formData.name.trim(),
        brand: formData.brand.trim(),
        batchNumber,
        manufacturingDate,
        expiryDate,
        purchasePrice: Number(formData.purchasePrice),
        sellingPrice: Number(formData.sellingPrice),
        stockQuantity,
        batches,
        
        // Optional Fields: sanitized default values to prevent undefined
        genericName: formData.genericName.trim() || '',
        category: formData.category || 'Others',
        manufacturer: formData.manufacturer.trim() || '',
        sku: formData.sku.trim() || '',
        barcode: formData.barcode.trim() || '',
        mrp: Number(formData.mrp) || 0,
        gstPercentage: Number(formData.gstPercentage) || 0,
        unit: formData.unit || 'Strip',
        minimumStock: Number(formData.minimumStock) || 0,
        rackLocation: formData.rackLocation.trim() || '',
        description: formData.description.trim() || '',
        imageUrl: imageUrl || '',
      };

      // Auto-create brand only when saving a real product with a new brand name
      if (user?.tenantId && formData.brand.trim()) {
        await brandService.addBrandIfNotExists(user.tenantId, formData.brand.trim());
      }

      await onSave(dataToSave, saveAndAddAnother);
      if (!saveAndAddAnother) onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save product');
      setIsUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-text/40 backdrop-blur-sm overflow-hidden sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-title"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="bg-surface w-full h-[100dvh] max-w-4xl overflow-hidden border-0 flex flex-col sm:h-auto sm:max-h-[90vh] sm:my-4 sm:rounded-[2rem] sm:border sm:border-border sm:shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 sm:p-6 border-b border-border bg-background/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 id="product-form-title" className="text-lg sm:text-xl font-black text-text tracking-tight">
                {product ? 'Edit Product' : 'Add New Product'}
              </h2>
              <p className="text-[10px] font-bold text-text/30 uppercase tracking-[0.1em] mt-0.5">
                {product ? `SKU: ${product.sku || 'N/A'}` : 'Simple list-style entry'}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            aria-label="Close product form"
            className="h-11 w-11 shrink-0 flex items-center justify-center hover:bg-danger/10 hover:text-danger rounded-xl transition-all text-text/40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-6 space-y-6">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 bg-danger/10 text-danger border border-danger/20 rounded-xl"
            >
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-xs font-bold leading-tight">{error}</p>
            </motion.div>
          )}

          {/* SECTION 1: REQUIRED PRODUCT DETAILS */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <h3 className="text-sm font-black uppercase tracking-widest text-text/80">
                Required Details
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Product Name */}
              <div className="flex flex-col gap-1.5 relative">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Product Name *
                </label>
                <div className="relative">
                  <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                  <input
                    name="name"
                    value={productNameInput}
                    onChange={(e) => {
                      setProductNameInput(e.target.value);
                      setShowProductDropdown(true);
                      setProductActiveIndex(-1);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                    onKeyDown={handleProductKeyDown}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-sm"
                    placeholder="e.g. Paracetamol 500mg"
                    autoComplete="off"
                    required
                  />
                </div>

                {/* Suggestions Dropdown */}
                {showProductDropdown && (uniqueProductsSuggestions.length > 0 || masterSuggestions.length > 0) && (
                  <div className="absolute left-0 right-0 top-[100%] z-[100] mt-1 max-h-64 overflow-y-auto bg-surface border border-border rounded-xl shadow-lg divide-y divide-border/50">
                    {uniqueProductsSuggestions.length > 0 && (
                      <div>
                        <div className="bg-background px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-text/40">In Your Inventory</div>
                        <ul className="divide-y divide-border/30">
                          {uniqueProductsSuggestions.slice(0, 5).map((p, idx) => (
                            <li
                              key={p.id}
                              className={cn(
                                "px-4 py-2.5 cursor-pointer text-xs font-semibold transition-colors flex flex-col gap-0.5",
                                productActiveIndex === idx ? "bg-primary/10 text-primary" : "text-text hover:bg-background"
                              )}
                              onMouseEnter={() => setProductActiveIndex(idx)}
                              onMouseDown={() => {
                                handleSelectProductSuggestion(p);
                                setShowProductDropdown(false);
                              }}
                            >
                              <span className="font-bold text-text">{p.name}</span>
                              <span className="text-[10px] text-text/40 font-medium">Brand: {p.brand} | Category: {p.category}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {masterSuggestions.length > 0 && (
                      <div>
                        <div className="bg-background px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-primary flex justify-between items-center">
                          <span>From Medicine Catalogue</span>
                          <span className="text-[8px] font-bold bg-primary/10 px-1.5 py-0.5 rounded text-primary">Manufacturer Auto-Fill</span>
                        </div>
                        <ul className="divide-y divide-border/30">
                          {masterSuggestions.slice(0, 10).map((med, idx) => {
                            const overallIdx = uniqueProductsSuggestions.slice(0, 5).length + idx;
                            return (
                              <li
                                key={med.id}
                                className={cn(
                                  "px-4 py-2.5 cursor-pointer text-xs font-semibold transition-colors flex flex-col gap-0.5 text-left",
                                  productActiveIndex === overallIdx ? "bg-primary/10 text-primary" : "text-text hover:bg-background"
                                )}
                                onMouseEnter={() => setProductActiveIndex(overallIdx)}
                                onMouseDown={() => {
                                  handleSelectMasterMedicine(med);
                                }}
                              >
                                <span className="font-bold text-text flex items-center gap-1.5">
                                  {med.name}
                                  {med.unit && <span className="text-[9px] font-bold text-primary/70 bg-primary/5 px-1 rounded-sm">{med.unit}</span>}
                                </span>
                                <div className="text-[10px] text-text/40 font-medium flex flex-wrap gap-x-2 items-center">
                                  {med.manufacturer && (
                                    <span className="text-primary font-extrabold bg-primary/5 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">
                                      Mfg: {med.manufacturer}
                                    </span>
                                  )}
                                  {med.genericName && <span>Gen: {med.genericName}</span>}
                                  {med.brand && <span>• Brand: {med.brand}</span>}
                                  {med.mrp && <span>• MRP: ₹{med.mrp}</span>}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Manufacturer */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Manufacturer *
                </label>
                <div className="relative">
                  <Factory className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                  <input
                    name="manufacturer"
                    value={formData.manufacturer}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs"
                    placeholder="e.g. Micro Labs"
                    autoComplete="organization"
                    required
                  />
                </div>
              </div>

              {/* Batch Number */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Batch Number *
                </label>
                <div className="relative">
                  <Info className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                  <input
                    name="batchNumber"
                    value={formData.batchNumber}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-sm font-mono uppercase"
                    placeholder="e.g. BATCH-2026-04"
                    required
                  />
                </div>
              </div>

              {/* Stock Quantity */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Stock Quantity *
                </label>
                <div className="relative">
                  <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                  <input
                    type="number"
                    name="stockQuantity"
                    value={formData.stockQuantity || ''}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-sm"
                    placeholder="e.g. 150"
                    min="0"
                    required
                  />
                </div>
              </div>

              {/* Manufacturing Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Manufacturing Date *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={mfgMonth}
                    onChange={(e) => handleMfgMonthChange(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs cursor-pointer"
                    required
                  >
                    <option value="" disabled>Month</option>
                    {Array.from({ length: 12 }, (_, i) => {
                      const monthNum = String(i + 1).padStart(2, '0');
                      const monthName = new Date(2020, i, 1).toLocaleDateString('en-IN', { month: 'short' });
                      return (
                        <option key={monthNum} value={monthNum}>
                          {monthNum} - {monthName}
                        </option>
                      );
                    })}
                  </select>
                  <select
                    value={mfgYear}
                    onChange={(e) => handleMfgYearChange(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs cursor-pointer"
                    required
                  >
                    <option value="" disabled>Year</option>
                    {Array.from({ length: 12 }, (_, i) => {
                      const yr = String(new Date().getFullYear() - 10 + i);
                      return (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Expiry Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Expiry Date *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={expMonth}
                    onChange={(e) => handleExpMonthChange(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs cursor-pointer"
                    required
                  >
                    <option value="" disabled>Month</option>
                    {Array.from({ length: 12 }, (_, i) => {
                      const monthNum = String(i + 1).padStart(2, '0');
                      const monthName = new Date(2020, i, 1).toLocaleDateString('en-IN', { month: 'short' });
                      return (
                        <option key={monthNum} value={monthNum}>
                          {monthNum} - {monthName}
                        </option>
                      );
                    })}
                  </select>
                  <select
                    value={expYear}
                    onChange={(e) => handleExpYearChange(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs cursor-pointer"
                    required
                  >
                    <option value="" disabled>Year</option>
                    {Array.from({ length: 16 }, (_, i) => {
                      const yr = String(new Date().getFullYear() - 2 + i);
                      return (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Purchase Price */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Purchase Price (INR) *
                </label>
                <div className="relative">
                  <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                  <input
                    type="number"
                    name="purchasePrice"
                    value={formData.purchasePrice || ''}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-sm"
                    placeholder="e.g. 12.50"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>

              {/* Sale Price */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Sale Price (INR) *
                </label>
                <div className="relative">
                  <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                  <input
                    type="number"
                    name="sellingPrice"
                    value={formData.sellingPrice || ''}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-sm"
                    placeholder="e.g. 15.00"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Price Calculations Dashboard Helper */}
            {(formData.purchasePrice > 0 || formData.sellingPrice > 0) && (
              <Card className="p-4 bg-primary/5 border border-primary/10 mt-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                  <Calculator className="h-16 w-16" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-text/40 uppercase tracking-wider mb-1">Estimated Profit</span>
                    <span className="text-base font-black text-text">{formatCurrency(profit)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-text/40 uppercase tracking-wider mb-1">Profit Margin</span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-base font-black", marginColor)}>{profitPercentage.toFixed(1)}%</span>
                      <TrendingUp className={cn("h-4 w-4", marginColor)} />
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* SECTION 2: OPTIONAL DETAILS */}
          <div className="border border-border rounded-2xl overflow-hidden bg-background/20">
            <button
              type="button"
              onClick={() => setIsOptionalExpanded(!isOptionalExpanded)}
              className="w-full px-5 py-4 flex items-center justify-between bg-background/50 hover:bg-background transition-all"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-text/50" />
                <span className="text-xs font-black uppercase tracking-widest text-text/70">
                  Optional Details
                </span>
                <span className="text-[10px] bg-text/5 px-2 py-0.5 rounded-full font-bold text-text/40 lowercase">
                  optional
                </span>
              </div>
              {isOptionalExpanded ? (
                <ChevronUp className="h-4 w-4 text-text/50" />
              ) : (
                <ChevronDown className="h-4 w-4 text-text/50" />
              )}
            </button>

            <AnimatePresence>
              {isOptionalExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t border-border"
                >
                  <div className="p-5 space-y-4 bg-surface">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Generic Name */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">Generic Name</label>
                        <div className="relative">
                          <Info className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                          <input
                            name="genericName"
                            value={formData.genericName}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs"
                            placeholder="e.g. Paracetamol"
                          />
                        </div>
                      </div>

                      {/* Brand Name */}
                      <div className="flex flex-col gap-1.5 relative">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">Brand Name (Optional)</label>
                        <MedicineAutocomplete
                          type="brand"
                          value={brandNameInput}
                          onChange={setBrandNameInput}
                          onSelect={(brand) => {
                            setBrandNameInput(brand as string);
                          }}
                          placeholder="e.g. Dolo"
                          name="brand"
                        />
                      </div>

                      {/* Category */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">Category</label>
                        <select
                          name="category"
                          value={formData.category}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs"
                        >
                          {CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      {/* SKU */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">SKU</label>
                        <div className="relative">
                          <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                          <input
                            name="sku"
                            value={formData.sku}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs font-mono uppercase"
                            placeholder="e.g. PARA-500-BOX"
                          />
                        </div>
                      </div>

                      {/* Barcode */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">Barcode</label>
                        <div className="relative">
                          <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                          <input
                            name="barcode"
                            value={formData.barcode}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs font-mono"
                            placeholder="e.g. 890123456789"
                          />
                        </div>
                      </div>

                      {/* MRP */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">MRP (Max Retail Price)</label>
                        <div className="relative">
                          <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                          <input
                            type="number"
                            name="mrp"
                            value={formData.mrp || ''}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs"
                            placeholder="e.g. 20.00"
                            step="0.01"
                            min="0"
                          />
                        </div>
                      </div>

                      {/* GST Percentage */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">GST %</label>
                        <div className="relative">
                          <Percent className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                          <select
                            name="gstPercentage"
                            value={formData.gstPercentage}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs"
                          >
                            {[0, 5, 12, 18, 28].map(gst => (
                              <option key={gst} value={gst}>{gst}% GST</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Unit */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">Unit</label>
                        <select
                          name="unit"
                          value={formData.unit}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs"
                        >
                          {UNITS.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>

                      {/* Minimum Stock */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">Minimum Stock</label>
                        <div className="relative">
                          <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                          <input
                            type="number"
                            name="minimumStock"
                            value={formData.minimumStock || ''}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs"
                            placeholder="e.g. 10"
                            min="0"
                          />
                        </div>
                      </div>

                      {/* Rack Location */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">Rack / Storage Location</label>
                        <div className="relative">
                          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                          <input
                            name="rackLocation"
                            value={formData.rackLocation}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs"
                            placeholder="e.g. Shelf A-3, Rack 2"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">Description & Notes</label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                        className="w-full p-4 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs resize-none"
                        placeholder="Clinical instructions, precautions, or custom notes..."
                      />
                    </div>

                    {/* Image Upload Area */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">Product Image</label>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-2xl bg-background/30 hover:border-primary/50 transition-all cursor-pointer relative overflow-hidden group"
                      >
                        {imagePreview ? (
                          <div className="relative h-32 w-32 rounded-xl overflow-hidden shadow-md">
                            <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                type="button"
                                variant="danger" 
                                size="sm" 
                                onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(''); }}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                              <Upload className="h-5 w-5" />
                            </div>
                            <div className="text-center">
                              <p className="text-[10px] font-black text-text uppercase tracking-widest">Upload Photo</p>
                              <p className="text-[8px] text-text/40 font-bold uppercase tracking-widest">Max Size: 2MB • JPG, PNG, WEBP</p>
                            </div>
                          </div>
                        )}
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleImageChange} 
                          accept="image/*" 
                          className="hidden" 
                        />

                        {isUploading && (
                          <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                            <div className="w-32 h-1 bg-border rounded-full overflow-hidden">
                              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                            </div>
                            <p className="text-[8px] font-black text-primary uppercase tracking-widest">Uploading... {Math.round(uploadProgress)}%</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </form>

        {/* Footer */}
        <div className="grid grid-cols-2 gap-2 p-3 border-t border-border bg-background/95 backdrop-blur-md shrink-0 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-3 sm:p-6">
          <Button 
            type="button"
            variant="outline" 
            onClick={onClose} 
            disabled={saveLoading} 
            className="col-span-2 h-11 w-full font-bold border-border bg-surface text-xs sm:col-span-1 sm:w-auto"
          >
            Cancel
          </Button>
          {!product && (
            <Button
              type="button"
              variant="outline"
              onClick={(event) => handleSubmit(event, true)}
              isLoading={saveLoading || isUploading}
              className="w-full px-3 h-11 font-black text-[11px] uppercase tracking-wide rounded-xl border-primary text-primary sm:w-auto sm:px-6 sm:text-xs sm:tracking-widest"
              leftIcon={!(saveLoading || isUploading) && <CheckCircle2 className="h-4 w-4" />}
            >
              Save & New
            </Button>
          )}
          <Button
            type="button"
            onClick={(event) => handleSubmit(event, false)}
            isLoading={saveLoading || isUploading}
            className={cn(
              "w-full px-3 h-11 font-black text-[11px] uppercase tracking-wide shadow-lg shadow-primary/20 rounded-xl sm:w-auto sm:px-6 sm:text-xs sm:tracking-widest",
              product && "col-span-2 sm:col-span-1"
            )}
            leftIcon={!(saveLoading || isUploading) && <CheckCircle2 className="h-4 w-4" />}
          >
            {product ? 'Save Changes' : 'Save & Close'}
          </Button>
        </div>

      </motion.div>
    </motion.div>
  );
}
