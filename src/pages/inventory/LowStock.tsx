import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, writeBatch, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Product } from '../../types';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { 
  AlertCircle, 
  Search, 
  Trash2, 
  Download, 
  CheckCircle,
  Package,
  AlertTriangle,
  ShoppingCart,
  ArrowUpDown,
  MoreVertical,
  ExternalLink,
  Edit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { Toast } from '../../components/common/Toast';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { handleFirestoreError, OperationType } from '../../utils/firestore-errors';

type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'CRITICAL' | 'OUT_OF_STOCK';

interface LowStockItem extends Product {
  status: StockStatus;
  suggestedReorder: number;
}

export default function LowStock() {
  const { user } = useAuth();
  const [products, setProducts] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<StockStatus | 'ALL'>('ALL');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof LowStockItem; direction: 'asc' | 'desc' }>({
    key: 'stockQuantity',
    direction: 'asc'
  });

  const navigate = useNavigate();

  // Fetch products and classify in real-time
  useEffect(() => {
    if (!user?.tenantId) return;
    
    const q = query(
      collection(db, 'products'),
      where('tenantId', '==', user.tenantId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: LowStockItem[] = snapshot.docs.map(doc => {
        const data = doc.data() as Product;
        
        let status: StockStatus = 'IN_STOCK';
        if (data.stockQuantity === 0) status = 'OUT_OF_STOCK';
        else if (data.stockQuantity <= 2) status = 'CRITICAL';
        else if (data.stockQuantity <= data.minimumStock) status = 'LOW_STOCK';

        return {
          ...data,
          id: doc.id,
          status,
          suggestedReorder: data.minimumStock * 2
        };
      });

      const outOfStockCount = items.filter(i => i.status === 'OUT_OF_STOCK').length;
      const criticalCount = items.filter(i => i.status === 'CRITICAL').length;

      if ((outOfStockCount > 0 || criticalCount > 0) && !showToast) {
        setToastMessage(`Inventory Alert: ${outOfStockCount} items out of stock and ${criticalCount} in critical level!`);
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
      lowStock: products.filter(p => p.status === 'LOW_STOCK').length,
      critical: products.filter(p => p.status === 'CRITICAL').length,
      outOfStock: products.filter(p => p.status === 'OUT_OF_STOCK').length,
    };
  }, [products]);

  // Filter and Sort Logic
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        // By default, this page only shows items that are NOT 'IN_STOCK' 
        // unless 'ALL' is selected (but even 'ALL' usually implies 'ALL AT RISK' in this context)
        const isAtRisk = p.status !== 'IN_STOCK';
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             p.sku.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTab = activeTab === 'ALL' ? isAtRisk : p.status === activeTab;
        
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

  const handleSort = (key: keyof LowStockItem) => {
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
    setToastMessage(`Successfully deleted ${selectedItems.length} items.`);
    setShowToast(true);
  };

  const exportToCSV = () => {
    const headers = ['Product Name', 'SKU', 'Stock', 'Min Stock', 'Suggested Reorder', 'Status'];
    const rows = filteredProducts.map(p => [
      p.name,
      p.sku,
      p.stockQuantity,
      p.minimumStock,
      p.suggestedReorder,
      p.status
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `low_stock_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: StockStatus) => {
    switch (status) {
      case 'OUT_OF_STOCK': return <Badge variant="danger" className="font-black">OUT OF STOCK</Badge>;
      case 'CRITICAL': return <Badge variant="warning" className="bg-orange-500 text-white font-black border-none">CRITICAL</Badge>;
      case 'LOW_STOCK': return <Badge variant="warning" className="font-black">LOW STOCK</Badge>;
      case 'IN_STOCK': return <Badge variant="success" className="font-black">IN STOCK</Badge>;
    }
  };

  const getStatusColor = (status: StockStatus) => {
    switch (status) {
      case 'OUT_OF_STOCK': return 'bg-danger/5 border-danger/20';
      case 'CRITICAL': return 'bg-orange-500/5 border-orange-500/20';
      case 'LOW_STOCK': return 'bg-warning/5 border-warning/20';
      case 'IN_STOCK': return 'bg-success/5 border-success/20';
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col gap-4 animate-pulse">
        <div className="h-12 w-48 bg-border rounded-xl" />
        <div className="grid grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-border rounded-3xl" />)}
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
            type="info" 
            onClose={() => setShowToast(false)} 
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-text tracking-tight flex items-center gap-4">
            Stock Intelligence
            <div className="h-10 w-10 rounded-2xl bg-warning/10 flex items-center justify-center">
              <ShoppingCart className="h-6 w-6 text-warning" />
            </div>
          </h1>
          <p className="text-[10px] font-black text-text/30 uppercase tracking-[0.3em] mt-2">
            Real-time replenishment & inventory health
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <Card className="p-6 border-warning/20 bg-warning/5 hover:bg-warning/10 transition-colors cursor-pointer" onClick={() => setActiveTab('LOW_STOCK')}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-warning uppercase tracking-widest">Low Stock Items</span>
            <AlertTriangle className="h-5 w-5 text-warning/40" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-warning">{stats.lowStock}</span>
            <span className="text-[10px] font-bold text-warning/40 uppercase">Needs Attention</span>
          </div>
        </Card>

        <Card className="p-6 border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 transition-colors cursor-pointer" onClick={() => setActiveTab('CRITICAL')}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Critical Stock</span>
            <AlertCircle className="h-5 w-5 text-orange-500/40" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-orange-500">{stats.critical}</span>
            <span className="text-[10px] font-bold text-orange-500/40 uppercase">Action Required</span>
          </div>
        </Card>

        <Card className="p-6 border-danger/20 bg-danger/5 hover:bg-danger/10 transition-colors cursor-pointer" onClick={() => setActiveTab('OUT_OF_STOCK')}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-danger uppercase tracking-widest">Out of Stock</span>
            <Package className="h-5 w-5 text-danger/40" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-danger">{stats.outOfStock}</span>
            <span className="text-[10px] font-bold text-danger/40 uppercase">Immediate Restock</span>
          </div>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card className="overflow-hidden border-border bg-surface">
        <div className="p-6 border-b border-border bg-background/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 p-1 bg-background/50 rounded-2xl border border-border w-fit overflow-x-auto scrollbar-none">
            {['ALL', 'LOW_STOCK', 'CRITICAL', 'OUT_OF_STOCK'].map((tab) => (
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
                {tab === 'ALL' ? 'ALL AT RISK' : tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-80 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search product or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
            />
          </div>
        </div>

        {/* Desktop Table */}
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
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Product Info</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest cursor-pointer group" onClick={() => handleSort('stockQuantity')}>
                  <div className="flex items-center gap-2">
                    Current Stock
                    <ArrowUpDown className="h-3 w-3 group-hover:text-primary" />
                  </div>
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-center">Threshold</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-center">Suggested Order</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Status</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-right">Actions</th>
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
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-black text-text/30 uppercase tracking-widest">{product.sku}</span>
                          <span className="h-1 w-1 rounded-full bg-text/10" />
                          <span className="text-[10px] font-bold text-text/30 uppercase">{product.category}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className={cn(
                          "text-xl font-black",
                          product.status === 'OUT_OF_STOCK' ? "text-danger" : 
                          product.status === 'CRITICAL' ? "text-orange-500" : "text-warning"
                        )}>
                          {product.stockQuantity}
                        </span>
                        <span className="text-[8px] font-black text-text/30 uppercase tracking-widest">
                          {product.unit}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="inline-flex flex-col p-2 bg-background/50 rounded-xl min-w-[80px]">
                        <span className="text-sm font-black text-text/60">{product.minimumStock}</span>
                        <span className="text-[8px] font-black text-text/20 uppercase tracking-widest">MIN LIMIT</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="inline-flex flex-col p-2 bg-primary/5 rounded-xl min-w-[100px] border border-primary/10">
                        <span className="text-sm font-black text-primary">+{product.suggestedReorder}</span>
                        <span className="text-[8px] font-black text-primary/40 uppercase tracking-widest">SUGGESTED</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {getStatusBadge(product.status)}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <Button 
                          variant="primary" 
                          size="sm" 
                          className="font-black text-[10px] uppercase py-1 h-8 shadow-md shadow-primary/20"
                          onClick={() => navigate(`/inventory?edit=${product.id}`)}
                        >
                          Restock
                        </Button>
                        <button className="p-2 hover:bg-background rounded-xl text-text/20 hover:text-text transition-all">
                          <MoreVertical className="h-5 w-5" />
                        </button>
                      </div>
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
                  <span className="text-[8px] font-black text-text/30 uppercase tracking-widest block mb-1">Current Stock</span>
                  <span className={cn(
                    "text-lg font-black",
                    product.status === 'OUT_OF_STOCK' ? "text-danger" : "text-warning"
                  )}>
                    {product.stockQuantity} {product.unit}
                  </span>
                </div>
                <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
                  <span className="text-[8px] font-black text-primary/40 uppercase tracking-widest block mb-1">Reorder Qty</span>
                  <span className="text-lg font-black text-primary">+{product.suggestedReorder}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="primary" 
                  className="flex-1 font-black uppercase text-[10px]"
                  onClick={() => navigate(`/inventory?edit=${product.id}`)}
                  leftIcon={<Edit className="h-3 w-3" />}
                >
                  Restock
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 font-black uppercase text-[10px]"
                  onClick={() => navigate(`/inventory?view=${product.id}`)}
                  leftIcon={<ExternalLink className="h-3 w-3" />}
                >
                  View
                </Button>
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
            <h3 className="text-2xl font-black text-text tracking-tight">Inventory Levels Healthy</h3>
            <p className="text-[10px] font-black text-text/40 uppercase tracking-[0.2em] mt-2 max-w-xs">
              All products are above minimum stock levels. No restocking required.
            </p>
          </div>
        )}
      </Card>

      {/* Sticky Bulk Actions for Mobile */}
      {selectedItems.length > 0 && (
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="lg:hidden fixed bottom-6 left-6 right-6 z-50 p-4 bg-surface rounded-2xl shadow-2xl border border-border flex items-center justify-between gap-4"
        >
          <span className="text-[10px] font-black uppercase">{selectedItems.length} items selected</span>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" onClick={handleBulkDelete} className="font-black px-4">
              Delete
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
