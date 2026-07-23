import { motion, AnimatePresence } from 'motion/react';
import { X, Edit2, Trash2, Package, MapPin, IndianRupee, Calendar, Info, Barcode, Factory, Tag } from 'lucide-react';
import { Product } from '../../types';
import { ProductIntelligence } from '../../services/inventoryIntelligenceService';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/currency';
import { toJsDate } from '../../utils/date';

interface ProductDetailsSidebarProps {
  product: Product | null;
  intelligence?: ProductIntelligence;
  onClose: () => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

export function ProductDetailsSidebar({ product, intelligence, onClose, onEdit, onDelete }: ProductDetailsSidebarProps) {
  if (!product) return null;

  const getStockStatus = (stock: number, min: number) => {
    if (stock === 0) return { label: 'Out of Stock', color: 'text-danger bg-danger/10', dot: 'bg-danger' };
    if (stock <= min) return { label: 'Low Stock', color: 'text-warning bg-warning/10', dot: 'bg-warning' };
    return { label: 'In Stock', color: 'text-success bg-success/10', dot: 'bg-success' };
  };

  const getExpiryStatus = (date: any) => {
    if (!date) return null;
    const expiry = toJsDate(date);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days <= 0) return { label: 'Expired', color: 'text-danger bg-danger/10' };
    if (days <= 60) return { label: 'Expiring Soon', color: 'text-warning bg-warning/10' };
    return { label: 'Safe', color: 'text-success bg-success/10' };
  };

  const stockStatus = getStockStatus(product.stockQuantity, product.minimumStock);
  const expiryStatus = getExpiryStatus(product.expiryDate);

  const InfoRow = ({ icon: Icon, label, value, subValue, colorClass = "text-primary" }: any) => (
    <div className="flex items-start gap-4 p-4 rounded-2xl bg-background border border-border group hover:border-primary/20 transition-all">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", colorClass.replace('text-', 'bg-').replace('bg-', 'bg-opacity-10 text-'))}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[10px] font-black uppercase text-text/30 tracking-widest">{label}</span>
        <span className="text-sm font-bold text-text truncate mt-0.5">{value}</span>
        {subValue && <span className="text-[11px] text-text/40 font-medium mt-0.5">{subValue}</span>}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex justify-end bg-text/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="h-full w-full max-w-lg bg-surface shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border bg-background/50">
          <div>
            <h2 className="text-xl font-bold text-text">Product Details</h2>
            <p className="text-[10px] font-black uppercase text-text/40 tracking-widest mt-1">Inventory Management System</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-full transition-colors">
            <X className="h-6 w-6 text-text/40" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
          <div className="flex flex-col gap-8">
            {/* Hero Section */}
            <div className="flex items-center gap-6">
              <div className="h-24 w-24 rounded-3xl bg-primary/5 border-2 border-primary/10 flex items-center justify-center text-4xl font-black text-primary">
                {product.name[0].toUpperCase()}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest", stockStatus.color)}>
                    {stockStatus.label}
                  </span>
                  {expiryStatus && (
                    <span className={cn("px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest", expiryStatus.color)}>
                      {expiryStatus.label}
                    </span>
                  )}
                </div>
                <h3 className="text-2xl font-black text-text leading-tight">{product.name}</h3>
                <p className="text-sm font-bold text-primary italic mt-1">{product.genericName || 'Generic medication'}</p>
              </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4 flex flex-col items-center justify-center text-center bg-primary/5 border-primary/10">
                <span className="text-[10px] font-black uppercase text-text/30 tracking-widest mb-1">Stock Level</span>
                <span className="text-2xl font-black text-text">{product.stockQuantity}</span>
                <span className="text-[11px] font-bold text-text/40 uppercase">{product.unit}s</span>
              </Card>
              <Card className="p-4 flex flex-col items-center justify-center text-center bg-secondary/5 border-secondary/10">
                <span className="text-[10px] font-black uppercase text-text/30 tracking-widest mb-1">Selling Price</span>
                <span className="text-2xl font-black text-text">{formatCurrency(product.sellingPrice)}</span>
                <span className="text-[11px] font-bold text-text/40 uppercase">Inc. GST</span>
              </Card>
            </div>

            {/* AI Intelligence Section */}
            {intelligence && (
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-text/40 tracking-widest ml-1">AI Inventory Intelligence</h4>
                  <div className="grid grid-cols-1 gap-3">
                    <Card className={cn(
                      "p-5 border-2 transition-all",
                      intelligence.status === 'Healthy' ? "bg-success/5 border-success/20" : 
                      intelligence.status === 'Watch' ? "bg-warning/5 border-warning/20" : 
                      "bg-danger/5 border-danger/20"
                    )}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Movement Pattern</span>
                          <span className="text-sm font-black text-text">{intelligence.movement}</span>
                        </div>
                        <div className={cn(
                          "px-3 py-1 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-black/5",
                          intelligence.status === 'Healthy' ? "bg-success text-white" : 
                          intelligence.status === 'Watch' ? "bg-warning text-white" : 
                          "bg-danger text-white"
                        )}>{intelligence.healthScore} Score</div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 border-t border-border/20 pt-4">
                        <div>
                          <p className="text-[9px] font-black uppercase opacity-40 mb-1">Daily Avg Sales</p>
                          <p className="text-xs font-black text-text">{intelligence.dailySalesAvg.toFixed(2)} units</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase opacity-40 mb-1">Reorder Recommendation</p>
                          <p className={cn("text-xs font-black", intelligence.reorderRequired ? "text-danger" : "text-success")}>
                            {intelligence.reorderRequired ? `Add ${intelligence.suggestedQuantity}` : 'Not Required'}
                          </p>
                        </div>
                      </div>
                    </Card>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 rounded-2xl bg-background border border-border group hover:border-info/20 transition-all">
                        <p className="text-[9px] font-black uppercase text-text/30 mb-1">Depletion Forecast</p>
                        <p className="text-xs font-black text-text">
                          {intelligence.expectedDepletionDate ? intelligence.expectedDepletionDate.toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <div className="p-4 rounded-2xl bg-background border border-border group hover:border-primary/20 transition-all">
                        <p className="text-[9px] font-black uppercase text-text/30 mb-1">Suggested Restock</p>
                        <p className="text-xs font-black text-primary">
                          {intelligence.recommendedRestockDate ? intelligence.recommendedRestockDate.toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* Information Groups */}
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-text/40 tracking-widest ml-1">Basic & Identification</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoRow icon={Barcode} label="SKU / ID" value={product.sku} colorClass="text-primary" />
                  <InfoRow icon={Tag} label="Brand" value={product.brand || 'N/A'} colorClass="text-secondary" />
                  <InfoRow icon={Package} label="Category" value={product.category} colorClass="text-accent" />
                  <InfoRow icon={Factory} label="Manufacturer" value={product.manufacturer || 'N/A'} colorClass="text-info" />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-text/40 tracking-widest ml-1">Inventory & Storage</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoRow icon={Info} label="Batch Number" value={product.batchNumber} colorClass="text-warning" />
                  <InfoRow icon={Calendar} label="Expiry Date" value={toJsDate(product.expiryDate).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })} colorClass="text-danger" />
                  {product.manufacturingDate && (
                    <InfoRow icon={Calendar} label="MFG Date" value={toJsDate(product.manufacturingDate).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })} colorClass="text-success" />
                  )}
                  <InfoRow icon={MapPin} label="Location" value={product.rackLocation || 'Not Assigned'} colorClass="text-success" />
                  <InfoRow icon={AlertTriangle} label="Min. Stock" value={`${product.minimumStock} Units`} colorClass="text-danger" />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-text/40 tracking-widest ml-1">Financial Breakdown</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoRow icon={IndianRupee} label="Purchase Price" value={formatCurrency(product.purchasePrice)} colorClass="text-info" />
                  <InfoRow icon={IndianRupee} label="MRP" value={formatCurrency(product.mrp)} colorClass="text-accent" />
                </div>
              </div>

              {product.description && (
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-text/40 tracking-widest ml-1">Notes & Description</h4>
                  <div className="p-4 rounded-2xl bg-background border border-border text-sm text-text/60 leading-relaxed font-medium italic">
                    {product.description}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border bg-background/50 flex items-center gap-4">
          <Button
            variant="outline"
            className="flex-1 h-12 font-bold"
            leftIcon={<Edit2 className="h-4 w-4" />}
            onClick={() => onEdit(product)}
          >
            Edit Product
          </Button>
          <Button
            variant="danger"
            className="flex-1 h-12 font-bold shadow-lg shadow-danger/20"
            leftIcon={<Trash2 className="h-4 w-4" />}
            onClick={() => onDelete(product)}
          >
            Archive
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

import { AlertTriangle } from 'lucide-react';
