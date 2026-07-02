import { SkeletonTable } from '../common/Skeleton';
import { EmptyState } from '../common/EmptyState';
import { motion } from 'motion/react';
import { Edit2, Trash2, MoreVertical, Package, AlertCircle, Calendar, CheckSquare, Square, ChevronRight } from 'lucide-react';
import { Product } from '../../types';
import { ProductIntelligence } from '../../services/inventoryIntelligenceService';
import { cn } from '../../utils/cn';
import { useState, useMemo } from 'react';
import { formatCurrency } from '../../utils/currency';

interface ProductTableProps {
  products: Product[];
  intelligence?: Record<string, ProductIntelligence>;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onView: (product: Product) => void;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  loading?: boolean;
  emptyAction?: React.ReactNode;
}

export function ProductTable({ 
  products, 
  intelligence = {},
  onEdit, 
  onDelete, 
  onView, 
  selectedIds, 
  onSelect, 
  loading,
  emptyAction
}: ProductTableProps) {
  const toggleAll = () => {
    if (selectedIds.length === products.length) {
      onSelect([]);
    } else {
      onSelect(products.map(p => p.id));
    }
  };

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelect(selectedIds.filter(i => i !== id));
    } else {
      onSelect([...selectedIds, id]);
    }
  };

  if (loading) {
    return <SkeletonTable rows={8} />;
  }

  const getStockStatus = (stock: number, min: number) => {
    if (stock === 0) return { label: 'Out of Stock', color: 'bg-danger text-white', dot: 'bg-danger' };
    if (stock <= min) return { label: 'Low Stock', color: 'bg-warning text-white', dot: 'bg-warning' };
    return { label: 'In Stock', color: 'bg-success text-white', dot: 'bg-success' };
  };

  const getExpiryStatus = (date: any) => {
    if (!date) return null;
    const expiry = date.toDate();
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days <= 0) return { label: 'Expired', color: 'bg-danger text-white' };
    if (days <= 60) return { label: 'Expiring Soon', color: 'bg-warning text-white' };
    return { label: 'Safe', color: 'bg-success/10 text-success' };
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Table Desktop View */}
      <div className="hidden lg:block w-full overflow-hidden rounded-3xl border border-border shadow-xl bg-surface">
        <div className="overflow-x-auto max-h-[60vh] scrollbar-thin">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border shadow-sm">
              <tr>
                <th className="px-6 py-5 text-left w-12">
                  <button onClick={toggleAll} className="text-text/20 hover:text-primary transition-colors">
                    {selectedIds.length === products.length && products.length > 0 ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5" />}
                  </button>
                </th>
                <th className="px-6 py-5 text-[11px] font-black uppercase text-text/40 tracking-widest text-left">Product Details</th>
                <th className="px-6 py-5 text-[11px] font-black uppercase text-text/40 tracking-widest text-left">SKU / Batch</th>
                <th className="px-6 py-5 text-[11px] font-black uppercase text-text/40 tracking-widest text-left">Category</th>
                <th className="px-6 py-5 text-[11px] font-black uppercase text-text/40 tracking-widest text-left">Stock Level</th>
                <th className="px-6 py-5 text-[11px] font-black uppercase text-text/40 tracking-widest text-left">Pricing</th>
                <th className="px-6 py-5 text-[11px] font-black uppercase text-text/40 tracking-widest text-left">Expiry</th>
                <th className="px-6 py-5 text-[11px] font-black uppercase text-text/40 tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12">
                    <EmptyState 
                      title="No items found" 
                      description="Start by adding your first product record to the inventory."
                      icon={<Package className="h-12 w-12" />}
                      action={emptyAction}
                    />
                  </td>
                </tr>
              ) : (
                products.map((product, idx) => {
                  const stockStatus = getStockStatus(product.stockQuantity, product.minimumStock);
                  const expiryStatus = getExpiryStatus(product.expiryDate);
                  const isSelected = selectedIds.includes(product.id);

                  return (
                    <motion.tr
                      key={product.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.01 }}
                      onClick={() => onView(product)}
                      className={cn(
                        "group transition-all duration-200 cursor-pointer",
                        isSelected ? "bg-primary/5 shadow-inner" : "hover:bg-primary/5",
                        idx % 2 === 1 && !isSelected ? "bg-background/30" : ""
                      )}
                    >
                      <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleOne(product.id)} className={cn("transition-colors", isSelected ? "text-primary" : "text-text/20 group-hover:text-text/40")}>
                          {isSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                        </button>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "h-12 w-12 rounded-2xl border flex items-center justify-center font-black transition-all",
                            isSelected ? "bg-primary text-white border-primary" : "bg-background border-border text-text/20 group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/20"
                          )}>
                            {product.name[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-text truncate group-hover:text-primary transition-colors">{product.name}</span>
                              {intelligence[product.id]?.movement === 'Fast Moving' && (
                                <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest">Fast</span>
                              )}
                              {intelligence[product.id]?.movement === 'Dead Stock' && (
                                <span className="px-1.5 py-0.5 rounded-md bg-danger/10 text-danger text-[8px] font-black uppercase tracking-widest">Dead</span>
                              )}
                            </div>
                            <span className="text-[11px] text-text/40 font-bold truncate">{product.brand || 'Generic'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-xs font-mono font-bold text-text/60">{product.sku}</span>
                          <span className="text-[10px] font-mono font-bold text-text/30 mt-0.5">Batch: {product.batchNumber}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="px-3 py-1 rounded-lg bg-background border border-border text-[11px] font-bold text-text/60 group-hover:border-primary/20 transition-colors">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-1.5 w-32">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-black text-text">{product.stockQuantity} <span className="text-[10px] font-bold text-text/40 uppercase">{product.unit}s</span></span>
                            <span className={cn(
                              "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest",
                              stockStatus.color
                            )}>
                              {stockStatus.label}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-background rounded-full overflow-hidden border border-border">
                            <div 
                              className={cn("h-full rounded-full transition-all duration-1000", stockStatus.dot)}
                              style={{ width: `${Math.min((product.stockQuantity / (product.minimumStock * 2)) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-text">{formatCurrency(product.sellingPrice)}</span>
                          <span className="text-[10px] font-bold text-text/30 line-through">MRP: {formatCurrency(product.mrp)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        {expiryStatus && (
                          <span className={cn(
                            "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 shadow-sm transition-transform group-hover:scale-105",
                            expiryStatus.color
                          )}>
                            <Calendar className="h-3 w-3" />
                            {product.expiryDate?.toDate().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                          <button 
                            onClick={() => onEdit(product)}
                            className="p-2.5 hover:bg-info/10 text-text/40 hover:text-info rounded-xl transition-all"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => onDelete(product)}
                            className="p-2.5 hover:bg-danger/10 text-text/40 hover:text-danger rounded-xl transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden grid grid-cols-1 gap-4">
        {products.length === 0 ? (
          <EmptyState 
            title="No items found" 
            description="Start by adding your first product record."
            className="bg-surface rounded-3xl border border-border"
            action={emptyAction}
          />
        ) : (
          products.map((product) => {
            const stockStatus = getStockStatus(product.stockQuantity, product.minimumStock);
            const isSelected = selectedIds.includes(product.id);
            
            return (
              <motion.div
                key={product.id}
                onClick={() => onView(product)}
                className={cn(
                  "p-5 bg-surface rounded-3xl border shadow-md flex flex-col gap-4 relative overflow-hidden transition-all active:scale-[0.98]",
                  isSelected ? "border-primary ring-2 ring-primary/10" : "border-border"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-xl border flex items-center justify-center font-black",
                      isSelected ? "bg-primary text-white border-primary" : "bg-background border-border text-text/20"
                    )}>
                      {product.name[0].toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-text leading-tight">{product.name}</h4>
                        {intelligence[product.id]?.movement === 'Fast Moving' && (
                          <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest">Fast</span>
                        )}
                        {intelligence[product.id]?.movement === 'Dead Stock' && (
                          <span className="px-1.5 py-0.5 rounded-md bg-danger/10 text-danger text-[8px] font-black uppercase tracking-widest">Dead</span>
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-text/40 uppercase tracking-widest">{product.sku}</p>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleOne(product.id); }}
                    className={cn("p-2 rounded-lg transition-colors", isSelected ? "bg-primary text-white" : "bg-background text-text/20")}
                  >
                    {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-background rounded-2xl border border-border">
                    <p className="text-[9px] font-black text-text/30 uppercase mb-1">Stock</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-text">{product.stockQuantity}</span>
                      <span className={cn("px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase", stockStatus.color)}>
                        {stockStatus.label}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-background rounded-2xl border border-border">
                    <p className="text-[9px] font-black text-text/30 uppercase mb-1">Price</p>
                    <span className="text-sm font-black text-text">{formatCurrency(product.sellingPrice)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-[10px] font-bold text-text/40 uppercase">
                    Exp: {product.expiryDate?.toDate().toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(product); }} className="p-2 text-text/20 hover:text-info">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-text/20" />
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
