import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, Timestamp, deleteDoc, doc, writeBatch, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Product } from '../../types';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { 
  AlertCircle, 
  Search, 
  Filter, 
  Trash2, 
  Download, 
  CheckCircle,
  Calendar,
  Clock,
  ChevronRight,
  ArrowUpDown,
  MoreVertical,
  Package,
  AlertTriangle,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { Toast } from '../../components/common/Toast';
import { toJsDate } from '../../utils/date';

import { useAuth } from '../../context/AuthContext';
import { handleFirestoreError, OperationType } from '../../utils/firestore-errors';

type ExpiryStatus = 'SAFE' | 'EXPIRING_SOON' | 'VERY_CLOSE' | 'EXPIRED';

interface ExpiryItem extends Product {
  daysLeft: number;
  status: ExpiryStatus;
}

export default function ExpiryAlerts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<ExpiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ExpiryStatus | 'ALL'>('ALL');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof ExpiryItem; direction: 'asc' | 'desc' }>({
    key: 'daysLeft',
    direction: 'asc'
  });

  // Fetch products and classify in real-time
  useEffect(() => {
    if (!user?.tenantId) return;
    
    const q = query(
      collection(db, 'products'),
      where('tenantId', '==', user.tenantId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const items: ExpiryItem[] = snapshot.docs.map(doc => {
        const data = doc.data() as Product;
        const expiryDate = toJsDate(data.expiryDate);
        
        expiryDate.setHours(0, 0, 0, 0);
        
        const diffTime = expiryDate.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let status: ExpiryStatus = 'SAFE';
        if (daysLeft < 0) status = 'EXPIRED';
        else if (daysLeft <= 30) status = 'VERY_CLOSE';
        else if (daysLeft <= 60) status = 'EXPIRING_SOON';

        return {
          ...data,
          id: doc.id,
          daysLeft,
          status
        };
      });

      const expiredCount = items.filter(i => i.status === 'EXPIRED').length;
      if (expiredCount > 0 && !showToast) {
        setToastMessage(`Safety Alert: ${expiredCount} products have already expired! Please review immediately.`);
        setShowToast(true);
      }

      setProducts(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Summary Stats
  const stats = useMemo(() => {
    return {
      total: products.length,
      safe: products.filter(p => p.status === 'SAFE').length,
      expiringSoon: products.filter(p => p.status === 'EXPIRING_SOON').length,
      veryClose: products.filter(p => p.status === 'VERY_CLOSE').length,
      expired: products.filter(p => p.status === 'EXPIRED').length,
    };
  }, [products]);

  // Filter and Sort Logic
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             p.batchNumber.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTab = activeTab === 'ALL' || p.status === activeTab;
        return matchesSearch && matchesTab;
      })
      .sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
  }, [products, searchTerm, activeTab, sortConfig]);

  const handleSort = (key: keyof ExpiryItem) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleToggleSelect = (id: string) => {
    setSelectedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedItems.length === filteredProducts.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredProducts.map(p => p.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.length} items?`)) return;
    
    const batch = writeBatch(db);
    selectedItems.forEach(id => {
      batch.delete(doc(db, 'products', id));
    });
    
    await batch.commit();
    setSelectedItems([]);
  };

  const exportToCSV = () => {
    const headers = ['Product Name', 'SKU', 'Batch', 'Expiry Date', 'Days Left', 'Status'];
    const rows = filteredProducts.map(p => [
      p.name,
      p.sku,
      p.batchNumber,
      toJsDate(p.expiryDate).toLocaleDateString(),
      p.daysLeft,
      p.status
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `expiry_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: ExpiryStatus) => {
    switch (status) {
      case 'EXPIRED': return <Badge variant="danger" className="font-black">EXPIRED</Badge>;
      case 'VERY_CLOSE': return <Badge variant="warning" className="bg-orange-500 text-white font-black border-none">VERY CLOSE</Badge>;
      case 'EXPIRING_SOON': return <Badge variant="warning" className="font-black">EXPIRING SOON</Badge>;
      case 'SAFE': return <Badge variant="success" className="font-black">SAFE</Badge>;
    }
  };

  const getStatusColor = (status: ExpiryStatus) => {
    switch (status) {
      case 'EXPIRED': return 'bg-danger/5 border-danger/20';
      case 'VERY_CLOSE': return 'bg-orange-500/5 border-orange-500/20';
      case 'EXPIRING_SOON': return 'bg-warning/5 border-warning/20';
      case 'SAFE': return 'bg-success/5 border-success/20';
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col gap-4 animate-pulse">
        <div className="h-12 w-48 bg-border rounded-xl" />
        <div className="grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-border rounded-3xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Toast Alert */}
      <AnimatePresence>
        {showToast && (
          <Toast 
            message={toastMessage} 
            type="danger" 
            onClose={() => setShowToast(false)} 
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-text tracking-tight flex items-center gap-4">
            Expiry Intelligence
            <div className="h-10 w-10 rounded-2xl bg-danger/10 flex items-center justify-center">
              <Clock className="h-6 w-6 text-danger" />
            </div>
          </h1>
          <p className="text-[10px] font-black text-text/30 uppercase tracking-[0.3em] mt-2">
            Real-time pharmaceutical shelf-life tracking
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={exportToCSV} leftIcon={<Download className="h-4 w-4" />} className="font-bold border-border bg-surface">
            Export Report
          </Button>
          {selectedItems.length > 0 && (
            <Button variant="danger" onClick={handleBulkDelete} leftIcon={<Trash2 className="h-4 w-4" />} className="font-black shadow-lg shadow-danger/20">
              Remove Selected ({selectedItems.length})
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card className="p-6 border-border/50 bg-surface/50 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-text/40 uppercase tracking-widest">Total Inventory</span>
            <Package className="h-5 w-5 text-text/20" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-text">{stats.total}</span>
            <span className="text-[10px] font-bold text-text/20 uppercase">Units</span>
          </div>
        </Card>

        <Card className="p-6 border-success/20 bg-success/5 hover:bg-success/10 transition-colors cursor-pointer" onClick={() => setActiveTab('SAFE')}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-success uppercase tracking-widest">Safe Stock</span>
            <CheckCircle className="h-5 w-5 text-success/40" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-success">{stats.safe}</span>
            <span className="text-[10px] font-bold text-success/40 uppercase">Low Risk</span>
          </div>
        </Card>

        <Card className="p-6 border-warning/20 bg-warning/5 hover:bg-warning/10 transition-colors cursor-pointer" onClick={() => setActiveTab('EXPIRING_SOON')}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-warning uppercase tracking-widest">Expiring Soon</span>
            <AlertTriangle className="h-5 w-5 text-warning/40" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-warning">{stats.expiringSoon + stats.veryClose}</span>
            <span className="text-[10px] font-bold text-warning/40 uppercase">At Risk</span>
          </div>
        </Card>

        <Card className="p-6 border-danger/20 bg-danger/5 hover:bg-danger/10 transition-colors cursor-pointer" onClick={() => setActiveTab('EXPIRED')}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-danger uppercase tracking-widest">Expired Now</span>
            <AlertCircle className="h-5 w-5 text-danger/40" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-danger">{stats.expired}</span>
            <span className="text-[10px] font-bold text-danger/40 uppercase">High Risk</span>
          </div>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card className="overflow-hidden border-border bg-surface">
        <div className="p-6 border-b border-border bg-background/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 p-1 bg-background/50 rounded-2xl border border-border w-fit overflow-x-auto scrollbar-none">
            {['ALL', 'SAFE', 'EXPIRING_SOON', 'VERY_CLOSE', 'EXPIRED'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                  activeTab === tab 
                    ? "bg-primary text-white shadow-lg shadow-primary/20" 
                    : "text-text/40 hover:text-text hover:bg-background"
                )}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-80 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search product, SKU or batch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
            />
          </div>
        </div>

        {/* Desktop Table / Mobile Cards */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-background/20 border-b border-border">
                <th className="px-6 py-5">
                  <input
                    type="checkbox"
                    checked={selectedItems.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={handleSelectAll}
                    className="h-5 w-5 rounded-lg border-border text-primary focus:ring-primary/20"
                  />
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Product / SKU</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Batch Info</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest cursor-pointer group" onClick={() => handleSort('expiryDate')}>
                  <div className="flex items-center gap-2">
                    Expiry Date
                    <ArrowUpDown className="h-3 w-3 group-hover:text-primary" />
                  </div>
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest cursor-pointer group text-center" onClick={() => handleSort('daysLeft')}>
                  <div className="flex items-center justify-center gap-2">
                    Days Left
                    <ArrowUpDown className="h-3 w-3 group-hover:text-primary" />
                  </div>
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Current Stock</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Status</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <AnimatePresence mode="popLayout">
                {filteredProducts.map((product) => (
                  <motion.tr
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={product.id}
                    className={cn(
                      "group hover:bg-background/30 transition-all",
                      getStatusColor(product.status)
                    )}
                  >
                    <td className="px-6 py-5">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(product.id)}
                        onChange={() => handleToggleSelect(product.id)}
                        className="h-5 w-5 rounded-lg border-border text-primary focus:ring-primary/20"
                      />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-text group-hover:text-primary transition-colors">{product.name}</span>
                        <span className="text-[10px] font-mono font-black text-text/30 uppercase tracking-widest">{product.sku}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-text/60">Batch: {product.batchNumber}</span>
                        <span className="text-[10px] font-bold text-text/30 uppercase">{product.category}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-text/20" />
                        <span className="font-bold text-sm">
                          {toJsDate(product.expiryDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="flex flex-col items-center">
                        <span className={cn(
                          "text-xl font-black",
                          product.daysLeft < 0 ? "text-danger" : 
                          product.daysLeft <= 30 ? "text-orange-500" : 
                          product.daysLeft <= 60 ? "text-warning" : "text-success"
                        )}>
                          {product.daysLeft < 0 ? '!' : product.daysLeft}
                        </span>
                        <span className="text-[8px] font-black text-text/30 uppercase tracking-widest">
                          {product.daysLeft < 0 ? 'EXPIRED' : 'DAYS LEFT'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <Badge variant={product.stockQuantity <= product.minimumStock ? 'danger' : 'neutral'} className="font-black">
                          {product.stockQuantity} {product.unit}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {getStatusBadge(product.status)}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button className="p-2 hover:bg-background rounded-xl text-text/20 hover:text-text transition-all">
                        <MoreVertical className="h-5 w-5" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden divide-y divide-border/50">
          {filteredProducts.map((product) => (
            <div key={product.id} className={cn("p-6 space-y-4", getStatusColor(product.status))}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(product.id)}
                    onChange={() => handleToggleSelect(product.id)}
                    className="h-5 w-5 rounded-lg border-border text-primary focus:ring-primary/20"
                  />
                  <div className="flex flex-col">
                    <span className="font-bold text-text">{product.name}</span>
                    <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">{product.sku}</span>
                  </div>
                </div>
                {getStatusBadge(product.status)}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-background/50 rounded-xl">
                  <span className="text-[8px] font-black text-text/30 uppercase tracking-widest block mb-1">Batch Number</span>
                  <span className="text-xs font-bold text-text">{product.batchNumber}</span>
                </div>
                <div className="p-3 bg-background/50 rounded-xl">
                  <span className="text-[8px] font-black text-text/30 uppercase tracking-widest block mb-1">Stock Level</span>
                  <span className="text-xs font-bold text-text">{product.stockQuantity} {product.unit}</span>
                </div>
                <div className="p-3 bg-background/50 rounded-xl">
                  <span className="text-[8px] font-black text-text/30 uppercase tracking-widest block mb-1">Expiry Date</span>
                  <span className="text-xs font-bold text-text">
                    {toJsDate(product.expiryDate).toLocaleDateString()}
                  </span>
                </div>
                <div className={cn(
                  "p-3 rounded-xl flex flex-col items-center justify-center",
                  product.daysLeft < 0 ? "bg-danger/10" : "bg-primary/10"
                )}>
                  <span className={cn(
                    "text-lg font-black",
                    product.daysLeft < 0 ? "text-danger" : "text-primary"
                  )}>
                    {product.daysLeft < 0 ? '!' : product.daysLeft}
                  </span>
                  <span className="text-[8px] font-black text-text/30 uppercase tracking-widest">Days Left</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="h-24 w-24 rounded-[2.5rem] bg-success/10 flex items-center justify-center text-success mb-6">
              <CheckCircle className="h-12 w-12" />
            </div>
            <h3 className="text-2xl font-black text-text tracking-tight">No Expiry Risks Detected</h3>
            <p className="text-[10px] font-black text-text/40 uppercase tracking-[0.2em] mt-2 max-w-xs">
              All products in this category are safe or no matching items found.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
