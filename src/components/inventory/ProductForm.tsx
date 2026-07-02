import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Save, AlertCircle, Package, DollarSign, Calendar, MapPin, 
  Image as ImageIcon, Percent, TrendingUp, Calculator, Info, 
  Barcode, Factory, Tag, ChevronRight, ChevronLeft, Upload, Trash2,
  CheckCircle2
} from 'lucide-react';
import { Product } from '../../types';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Timestamp } from 'firebase/firestore';
import { uploadProductImage } from '../../utils/storage';
import { cn } from '../../utils/cn';

interface ProductFormProps {
  product?: Product;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
}

const CATEGORIES = ['Tablets', 'Capsules', 'Syrups', 'Injections', 'Topicals', 'Medical Supplies', 'Others'];
const UNITS = ['Strip', 'Bottle', 'Box', 'Piece', 'Vial', 'Tube'];

const TABS = [
  { id: 'basic', label: 'Basic Info', icon: Info },
  { id: 'tracking', label: 'Tracking', icon: Barcode },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'inventory', label: 'Stock', icon: Package },
  { id: 'storage', label: 'Storage', icon: MapPin },
  { id: 'media', label: 'Media', icon: ImageIcon },
];

export function ProductForm({ product, onSave, onClose, loading: saveLoading }: ProductFormProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const [formData, setFormData] = useState({
    name: product?.name || '',
    genericName: product?.genericName || '',
    brand: product?.brand || '',
    category: product?.category || CATEGORIES[0],
    manufacturer: product?.manufacturer || '',
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    purchasePrice: product?.purchasePrice || 0,
    sellingPrice: product?.sellingPrice || 0,
    mrp: product?.mrp || 0,
    gstPercentage: product?.gstPercentage || 12,
    stockQuantity: product?.stockQuantity || 0,
    unit: product?.unit || UNITS[0],
    minimumStock: product?.minimumStock || 10,
    batchNumber: product?.batchNumber || '',
    expiryDate: product?.expiryDate ? new Date(product.expiryDate.toDate()).toISOString().split('T')[0] : '',
    rackLocation: product?.rackLocation || '',
    description: product?.description || '',
    imageUrl: product?.imageUrl || '',
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(product?.imageUrl || '');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    // Strict Validation
    if (!formData.name || !formData.sku || !formData.barcode || !formData.batchNumber || !formData.expiryDate) {
      setError('Required fields missing: Name, SKU, Barcode, Batch, and Expiry are mandatory');
      setActiveTab('basic');
      return;
    }

    if (formData.sellingPrice < formData.purchasePrice) {
      setError('Selling price cannot be lower than purchase price');
      setActiveTab('pricing');
      return;
    }

    if (formData.gstPercentage < 0 || formData.gstPercentage > 28) {
      setError('GST must be between 0% and 28%');
      setActiveTab('pricing');
      return;
    }

    const selectedExpiry = new Date(formData.expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (!product && selectedExpiry < today) {
      setError('Expiry date must be in the future for new products');
      setActiveTab('storage');
      return;
    }

    try {
      let imageUrl = formData.imageUrl;
      
      if (imageFile) {
        setIsUploading(true);
        // Using a temporary random ID if it's a new product for storage path
        const storageId = product?.id || `temp_${Date.now()}`;
        imageUrl = await uploadProductImage(imageFile, storageId, (progress) => setUploadProgress(progress));
        setIsUploading(false);
      }

      const dataToSave = {
        ...formData,
        imageUrl,
        expiryDate: Timestamp.fromDate(new Date(formData.expiryDate)),
      };

      await onSave(dataToSave);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save product');
      setIsUploading(false);
    }
  };

  const TabButton = ({ tab, active, ...props }: { tab: typeof TABS[0], active: boolean, [key: string]: any }) => {
    const Icon = tab.icon;
    const isActive = active;
    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab.id)}
        className={cn(
          "flex items-center gap-3 px-6 py-4 border-b-2 transition-all font-bold text-xs uppercase tracking-widest whitespace-nowrap",
          isActive 
            ? "border-primary text-primary bg-primary/5" 
            : "border-transparent text-text/40 hover:text-text hover:bg-background"
        )}
      >
        <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-text/20")} />
        {tab.label}
      </button>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text/40 backdrop-blur-sm overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-surface w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden my-auto border border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-border bg-background/50">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-text tracking-tight">{product ? 'Update Product' : 'Add New Record'}</h2>
              <p className="text-[10px] font-black text-text/30 uppercase tracking-[0.2em] mt-1">
                {product ? `Editing: ${product.sku}` : 'Enterprise Inventory System'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 hover:bg-danger/10 hover:text-danger rounded-2xl transition-all text-text/20"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs Navigation */}
        <div className="flex overflow-x-auto scrollbar-none border-b border-border bg-background/20 px-4">
          {TABS.map(tab => <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} />)}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col h-[65vh]">
          <div className="flex-1 overflow-y-auto p-10 scrollbar-thin">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 flex items-center gap-4 p-5 bg-danger/10 text-danger border border-danger/20 rounded-[2rem]"
              >
                <AlertCircle className="h-6 w-6 shrink-0" />
                <p className="text-sm font-bold leading-tight">{error}</p>
              </motion.div>
            )}

            <div className="max-w-4xl mx-auto">
              {/* Basic Info Tab */}
              {activeTab === 'basic' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Product Name *</label>
                      <div className="relative">
                        <Package className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-bold text-sm"
                          placeholder="e.g. Amoxicillin 500mg"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Brand Name</label>
                      <div className="relative">
                        <Tag className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          name="brand"
                          value={formData.brand}
                          onChange={handleChange}
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-bold text-sm"
                          placeholder="e.g. Augmentin"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Generic Formula</label>
                      <div className="relative">
                        <Info className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          name="genericName"
                          value={formData.genericName}
                          onChange={handleChange}
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-bold text-sm"
                          placeholder="e.g. Amoxicillin + Clavulanate"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Category *</label>
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleChange}
                        className="w-full px-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-bold text-sm"
                      >
                        {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Manufacturer / Vendor</label>
                      <div className="relative">
                        <Factory className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          name="manufacturer"
                          value={formData.manufacturer}
                          onChange={handleChange}
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-bold text-sm"
                          placeholder="e.g. Pfizer Inc."
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Tracking Tab */}
              {activeTab === 'tracking' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">SKU Identification *</label>
                      <div className="relative">
                        <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          name="sku"
                          value={formData.sku}
                          onChange={handleChange}
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-black text-sm font-mono uppercase tracking-wider"
                          placeholder="PCM-500-STR"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Barcode (EAN/UPC) *</label>
                      <div className="relative">
                        <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          name="barcode"
                          value={formData.barcode}
                          onChange={handleChange}
                          autoFocus
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-black text-sm font-mono tracking-widest"
                          placeholder="8901234567890"
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Active Batch Number *</label>
                      <input
                        name="batchNumber"
                        value={formData.batchNumber}
                        onChange={handleChange}
                        className="w-full px-6 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-black text-sm font-mono uppercase tracking-widest"
                        placeholder="BN-2024-X10"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Pricing Tab */}
              {activeTab === 'pricing' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Purchase Price</label>
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          type="number"
                          name="purchasePrice"
                          value={formData.purchasePrice || ''}
                          onChange={handleChange}
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-black text-sm"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Selling Price</label>
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          type="number"
                          name="sellingPrice"
                          value={formData.sellingPrice || ''}
                          onChange={handleChange}
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-black text-sm"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">MRP (Max Price)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          type="number"
                          name="mrp"
                          value={formData.mrp || ''}
                          onChange={handleChange}
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-black text-sm"
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Calculations Overlay */}
                  <Card className="p-8 bg-primary/5 border-primary/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <Calculator className="h-32 w-32" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-text/30 uppercase tracking-[0.2em] mb-2">Estimated Profit</span>
                        <span className="text-3xl font-black text-text">${profit.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-text/30 uppercase tracking-[0.2em] mb-2">Profit Margin</span>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-3xl font-black", marginColor)}>{profitPercentage.toFixed(1)}%</span>
                          <TrendingUp className={cn("h-6 w-6", marginColor)} />
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-text/40 uppercase tracking-widest mb-2">GST Applied</span>
                        <select
                          name="gstPercentage"
                          value={formData.gstPercentage}
                          onChange={handleChange}
                          className="bg-surface border border-border rounded-xl px-4 py-2 font-bold text-sm outline-none focus:border-primary"
                        >
                          {[0, 5, 12, 18, 28].map(gst => <option key={gst} value={gst}>{gst}% GST</option>)}
                        </select>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}

              {/* Inventory Tab */}
              {activeTab === 'inventory' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Current Stock Level *</label>
                      <input
                        type="number"
                        name="stockQuantity"
                        value={formData.stockQuantity}
                        onChange={handleChange}
                        className="w-full px-6 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-black text-sm"
                        min="0"
                      />
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Minimum Stock Alert *</label>
                      <input
                        type="number"
                        name="minimumStock"
                        value={formData.minimumStock}
                        onChange={handleChange}
                        className="w-full px-6 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-black text-sm"
                        min="1"
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Inventory Unit Type</label>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                        {UNITS.map(unit => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => setFormData({ ...formData, unit })}
                            className={cn(
                              "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                              formData.unit === unit 
                                ? "bg-primary text-white shadow-lg shadow-primary/20" 
                                : "bg-background border border-border text-text/40 hover:text-text"
                            )}
                          >
                            {unit}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Storage Tab */}
              {activeTab === 'storage' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Expiry Date *</label>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          type="date"
                          name="expiryDate"
                          value={formData.expiryDate}
                          onChange={handleChange}
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-black text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Rack / Storage Location</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20" />
                        <input
                          name="rackLocation"
                          value={formData.rackLocation}
                          onChange={handleChange}
                          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-black text-sm"
                          placeholder="e.g. Shelf A-1, Row 3"
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-2.5">
                      <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Product Description & Notes</label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={4}
                        className="w-full p-6 rounded-3xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-medium text-sm resize-none"
                        placeholder="Enter clinical notes, usage instructions, or storage precautions..."
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Media Tab */}
              {activeTab === 'media' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                  <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-[3rem] bg-background/30 group hover:border-primary/50 transition-all cursor-pointer relative overflow-hidden"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {imagePreview ? (
                      <div className="relative h-64 w-64 rounded-[2rem] overflow-hidden shadow-2xl">
                        <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(''); }}>
                            <Trash2 className="h-4 w-4" /> Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4">
                        <div className="h-20 w-20 rounded-3xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                          <Upload className="h-10 w-10" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-black text-text uppercase tracking-widest">Upload Product Photo</p>
                          <p className="text-[10px] text-text/40 font-bold uppercase tracking-widest mt-2">Max Size: 2MB • JPG, PNG, WEBP</p>
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
                      <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                        <div className="w-48 h-2 bg-border rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Uploading... {Math.round(uploadProgress)}%</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="p-8 border-t border-border bg-background/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                onClick={() => {
                  const currentIndex = TABS.findIndex(t => t.id === activeTab);
                  if (currentIndex > 0) setActiveTab(TABS[currentIndex - 1].id);
                }}
                disabled={activeTab === TABS[0].id}
                className="px-4"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => {
                  const currentIndex = TABS.findIndex(t => t.id === activeTab);
                  if (currentIndex < TABS.length - 1) setActiveTab(TABS[currentIndex + 1].id);
                }}
                disabled={activeTab === TABS[TABS.length - 1].id}
                className="px-4"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={onClose} disabled={saveLoading} className="font-bold border-border bg-surface">
                Discard Changes
              </Button>
              <Button
                onClick={handleSubmit}
                isLoading={saveLoading || isUploading}
                className="px-10 h-14 font-black text-sm uppercase tracking-widest shadow-2xl shadow-primary/30 rounded-2xl"
                leftIcon={!(saveLoading || isUploading) && <CheckCircle2 className="h-5 w-5" />}
              >
                {product ? 'Finalize Update' : 'Publish Product'}
              </Button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

