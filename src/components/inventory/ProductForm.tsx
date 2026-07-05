import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, AlertCircle, Package, IndianRupee, Calendar, MapPin, 
  ImageIcon, Percent, TrendingUp, Calculator, Info, 
  Barcode, Factory, Tag, ChevronDown, ChevronUp, Upload, Trash2,
  CheckCircle2, FileText
} from 'lucide-react';
import { Product } from '../../types';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Timestamp } from 'firebase/firestore';
import { uploadProductImage } from '../../utils/storage';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/currency';
import { toJsDate } from '../../utils/date';

interface ProductFormProps {
  product?: Product;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
}

const CATEGORIES = ['Tablets', 'Capsules', 'Syrups', 'Injections', 'Topicals', 'Medical Supplies', 'Others'];
const UNITS = ['Strip', 'Bottle', 'Box', 'Piece', 'Vial', 'Tube'];

export function ProductForm({ product, onSave, onClose, loading: saveLoading }: ProductFormProps) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    brand: product?.brand || '',
    batchNumber: product?.batchNumber || '',
    manufacturingDate: product?.manufacturingDate ? toJsDate(product.manufacturingDate).toISOString().split('T')[0] : '',
    expiryDate: product?.expiryDate ? toJsDate(product.expiryDate).toISOString().split('T')[0] : '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Section 1 Required Fields Validation
    if (!formData.name.trim()) {
      setError('Product Name is required');
      return;
    }
    if (!formData.brand.trim()) {
      setError('Brand Name is required');
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
        imageUrl = await uploadProductImage(imageFile, storageId, (progress) => setUploadProgress(progress));
        setIsUploading(false);
      }

      const dataToSave = {
        name: formData.name.trim(),
        brand: formData.brand.trim(),
        batchNumber: formData.batchNumber.trim(),
        manufacturingDate: Timestamp.fromDate(new Date(formData.manufacturingDate)),
        expiryDate: Timestamp.fromDate(new Date(formData.expiryDate)),
        purchasePrice: Number(formData.purchasePrice),
        sellingPrice: Number(formData.sellingPrice),
        stockQuantity: Number(formData.stockQuantity),
        
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

      await onSave(dataToSave);
      onClose();
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text/40 backdrop-blur-sm overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="bg-surface w-full max-w-4xl rounded-[2rem] shadow-2xl overflow-hidden my-4 border border-border flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-background/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black text-text tracking-tight">
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
            className="p-2 hover:bg-danger/10 hover:text-danger rounded-xl transition-all text-text/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
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
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Product Name *
                </label>
                <div className="relative">
                  <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-sm"
                    placeholder="e.g. Paracetamol 500mg"
                    required
                  />
                </div>
              </div>

              {/* Brand Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Brand Name *
                </label>
                <div className="relative">
                  <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                  <input
                    name="brand"
                    value={formData.brand}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-sm"
                    placeholder="e.g. Calpol"
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
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                  <input
                    type="date"
                    name="manufacturingDate"
                    value={formData.manufacturingDate}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-sm"
                    required
                  />
                </div>
              </div>

              {/* Expiry Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">
                  Expiry Date *
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                  <input
                    type="date"
                    name="expiryDate"
                    value={formData.expiryDate}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-sm"
                    required
                  />
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

                      {/* Manufacturer */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-text/50 uppercase tracking-widest ml-1">Manufacturer</label>
                        <div className="relative">
                          <Factory className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                          <input
                            name="manufacturer"
                            value={formData.manufacturer}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none font-semibold text-xs"
                            placeholder="e.g. GlaxoSmithKline"
                          />
                        </div>
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
        <div className="p-6 border-t border-border bg-background/50 flex items-center justify-end gap-3 shrink-0">
          <Button 
            type="button"
            variant="outline" 
            onClick={onClose} 
            disabled={saveLoading} 
            className="font-bold border-border bg-surface text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            isLoading={saveLoading || isUploading}
            className="px-6 h-11 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 rounded-xl"
            leftIcon={!(saveLoading || isUploading) && <CheckCircle2 className="h-4 w-4" />}
          >
            {product ? 'Save Changes' : 'Save Product'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
