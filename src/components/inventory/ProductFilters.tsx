import { Search, Filter, SlidersHorizontal, Package, AlertTriangle, XCircle, CheckCircle, Calendar, IndianRupee, ChevronDown } from 'lucide-react';
import { Card } from '../common/Card';
import { cn } from '../../utils/cn';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ProductFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  selectedStatus: string;
  setSelectedStatus: (status: string) => void;
  selectedExpiryStatus: string;
  setSelectedExpiryStatus: (status: string) => void;
  priceRange: { min: number, max: number };
  setPriceRange: (range: { min: number, max: number }) => void;
  barcodeInput: string;
  setBarcodeInput: (input: string) => void;
  onBarcodeScan: (barcode: string) => void;
}

const CATEGORIES = ['All', 'Tablets', 'Capsules', 'Syrups', 'Injections', 'Topicals', 'Medical Supplies', 'Others'];
const STATUSES = [
  { id: 'all', label: 'All Stock', icon: Package, color: 'text-primary' },
  { id: 'in', label: 'In Stock', icon: CheckCircle, color: 'text-success' },
  { id: 'low', label: 'Low Stock', icon: AlertTriangle, color: 'text-warning' },
  { id: 'out', label: 'Out of Stock', icon: XCircle, color: 'text-danger' },
];

const EXPIRY_STATUSES = [
  { id: 'all', label: 'All Expiry' },
  { id: 'safe', label: 'Safe (>60 days)' },
  { id: 'soon', label: 'Expiring Soon' },
  { id: 'expired', label: 'Expired' },
];

export function ProductFilters({ 
  searchQuery, 
  setSearchQuery, 
  selectedCategory, 
  setSelectedCategory,
  selectedStatus,
  setSelectedStatus,
  selectedExpiryStatus,
  setSelectedExpiryStatus,
  priceRange,
  setPriceRange,
  barcodeInput,
  setBarcodeInput,
  onBarcodeScan
}: ProductFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full">
      <div className="flex flex-col lg:flex-row items-center gap-4 w-full">
        {/* Search Bar */}
        <div className="relative flex-1 w-full group order-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text/30 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Search Products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-surface border border-border rounded-2xl shadow-sm focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none font-medium text-sm"
          />
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto order-2">
          {/* Barcode Scanner Input */}
          <div className="relative flex-1 lg:w-64 group">
            <Package className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text/30 group-focus-within:text-secondary transition-colors" />
            <input
              type="text"
              placeholder="Scan Barcode..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onBarcodeScan(barcodeInput)}
              className="w-full pl-12 pr-6 py-4 bg-surface border border-border rounded-2xl shadow-sm focus:ring-4 focus:ring-secondary/10 focus:border-secondary transition-all outline-none font-medium text-sm font-mono"
            />
          </div>

          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={cn(
              "flex items-center justify-center gap-2 px-6 py-4 rounded-2xl border transition-all font-bold text-sm h-[54px]",
              showAdvanced ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-surface border-border text-text/60 hover:bg-background"
            )}
          >
            <SlidersHorizontal className="h-5 w-5" />
            <span className="hidden sm:inline">Filters</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <Card className="p-4 sm:p-6 border-primary/10 bg-primary/5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {/* Category Filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase text-text/40 tracking-widest ml-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full p-3 rounded-xl border border-border bg-surface text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              {/* Expiry Filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase text-text/40 tracking-widest ml-1">Expiry Status</label>
                <div className="flex flex-wrap gap-2">
                  {EXPIRY_STATUSES.map(status => (
                    <button
                      key={status.id}
                      onClick={() => setSelectedExpiryStatus(status.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                        selectedExpiryStatus === status.id 
                          ? "bg-primary text-white" 
                          : "bg-surface border border-border text-text/40 hover:text-text"
                      )}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range Filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase text-text/40 tracking-widest ml-1">Price Range</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text/20" />
                    <input
                      type="number"
                      placeholder="Min"
                      value={priceRange.min || ''}
                      onChange={(e) => setPriceRange({ ...priceRange, min: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-7 p-2 rounded-lg border border-border bg-surface text-xs font-bold outline-none"
                    />
                  </div>
                  <span className="text-text/20">-</span>
                  <div className="relative flex-1">
                    <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text/20" />
                    <input
                      type="number"
                      placeholder="Max"
                      value={priceRange.max || ''}
                      onChange={(e) => setPriceRange({ ...priceRange, max: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-7 p-2 rounded-lg border border-border bg-surface text-xs font-bold outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-end">
                <button 
                  onClick={() => {
                    setSelectedCategory('All');
                    setSelectedStatus('all');
                    setSelectedExpiryStatus('all');
                    setPriceRange({ min: 0, max: 0 });
                    setSearchQuery('');
                    setBarcodeInput('');
                  }}
                  className="w-full p-3 rounded-xl border border-danger/20 text-danger text-xs font-black uppercase tracking-widest hover:bg-danger/5 transition-all"
                >
                  Reset All Filters
                </button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Filter Cards */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {STATUSES.map((status) => (
          <button
            key={status.id}
            onClick={() => setSelectedStatus(status.id)}
            className={cn(
              "min-h-14 p-3 sm:p-4 rounded-2xl border transition-all flex items-center gap-3 group text-left",
              selectedStatus === status.id 
                ? "bg-surface border-primary shadow-xl ring-2 ring-primary/10 scale-[1.02]" 
                : "bg-surface border-border hover:border-primary/40"
            )}
          >
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
              selectedStatus === status.id ? "bg-primary text-white" : "bg-background text-text/20 group-hover:bg-primary/10 group-hover:text-primary"
            )}>
              <status.icon className="h-5 w-5" />
            </div>
            <div>
              <p className={cn(
                "text-[10px] font-black uppercase tracking-widest",
                selectedStatus === status.id ? "text-primary" : "text-text/30"
              )}>Stock Status</p>
              <p className="text-sm font-bold text-text">{status.label}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
