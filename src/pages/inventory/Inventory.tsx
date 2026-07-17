import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Download, Trash2, Tag, FileDown, Search, Filter, CheckCircle2 } from 'lucide-react';
import { PageContainer, SectionHeader } from '../../components/common/PageContainer';
import { Button } from '../../components/common/Button';
import { ProductTable } from '../../components/inventory/ProductTable';
import { ProductForm } from '../../components/inventory/ProductForm';
import { ProductFilters } from '../../components/inventory/ProductFilters';
import { ProductDetailsSidebar } from '../../components/inventory/ProductDetailsSidebar';
import { productService } from '../../services/productService';
import { inventoryIntelligenceService, ProductIntelligence } from '../../services/inventoryIntelligenceService';
import { Product } from '../../types';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../utils/cn';
import { PageTransition } from '../../components/common/PageTransition';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { SkeletonTable } from '../../components/common/Skeleton';
import { InventoryIntelligence } from '../../components/inventory/InventoryIntelligence';
import { InventoryDashboard } from '../../components/inventory/InventoryDashboard';
import { toJsDate } from '../../utils/date';

import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';

export default function Inventory() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const viewId = searchParams.get('view');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ledger'>('dashboard');

  const [products, setProducts] = useState<Product[]>([]);
  const [intelligence, setIntelligence] = useState<Record<string, ProductIntelligence>>({});
  const [intelligenceLoading, setIntelligenceLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | undefined>();
  const [formLoading, setFormLoading] = useState(false);
  const { showToast } = useToast();

  // Handle direct edit/view links
  useEffect(() => {
    if (products.length > 0) {
      if (editId) {
        const product = products.find(p => p.id === editId);
        if (product) {
          setEditingProduct(product);
          setShowForm(true);
          // Clear params after opening
          setSearchParams({});
        }
      } else if (viewId) {
        const product = products.find(p => p.id === viewId);
        if (product) {
          setSelectedProduct(product);
          // Clear params after opening
          setSearchParams({});
        }
      }
    }
  }, [editId, viewId, products, setSearchParams]);
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedExpiryStatus, setSelectedExpiryStatus] = useState('all');
  const [priceRange, setPriceRange] = useState({ min: 0, max: 0 });

  // Debounced search effect
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    if (!user) return;

    if (!user.tenantId) {
      console.warn('Inventory: No tenantId found for user');
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = productService.subscribeToProducts(
      user.tenantId,
      (newProducts) => {
        let filtered = [...newProducts];

        // Client-side advanced filtering
        if (selectedExpiryStatus !== 'all') {
          const now = new Date();
          const soonThreshold = new Date();
          soonThreshold.setDate(soonThreshold.getDate() + 60);

          filtered = filtered.filter(p => {
            if (!p.expiryDate) return false;
            const expiry = toJsDate(p.expiryDate);
            if (selectedExpiryStatus === 'expired') return expiry < now;
            if (selectedExpiryStatus === 'soon') return expiry >= now && expiry <= soonThreshold;
            if (selectedExpiryStatus === 'safe') return expiry > soonThreshold;
            return true;
          });
        }

        if (priceRange.max > 0) {
          filtered = filtered.filter(p => p.sellingPrice >= priceRange.min && p.sellingPrice <= priceRange.max);
        } else if (priceRange.min > 0) {
          filtered = filtered.filter(p => p.sellingPrice >= priceRange.min);
        }

        setProducts(filtered);
        setLoading(false);
      },
      { 
        category: selectedCategory, 
        searchQuery: debouncedSearch, 
        stockStatus: selectedStatus 
      }
    );

    return () => unsub();
  }, [user, selectedCategory, debouncedSearch, selectedStatus, selectedExpiryStatus, priceRange]);

  // Analyze products for intelligence
  useEffect(() => {
    if (products.length > 0 && user?.tenantId) {
      const analyze = async () => {
        setIntelligenceLoading(true);
        const result = await inventoryIntelligenceService.analyzeProducts(products, user.tenantId);
        setIntelligence(result);
        setIntelligenceLoading(false);
      };
      analyze();
    }
  }, [products.length, user?.tenantId]);

  const handleBarcodeScan = (barcode: string) => {
    const found = products.find(p => p.barcode === barcode);
    if (found) {
      setSelectedProduct(found);
      setBarcodeInput('');
    } else {
      // Could show a toast here: "Product not found"
      setBarcodeInput('');
    }
  };

  const handleSaveProduct = async (data: any) => {
    if (!user?.tenantId) return;
    setFormLoading(true);
    try {
      if (editingProduct) {
        await productService.updateProduct(user.tenantId, editingProduct.id, data);
        showToast('Product updated successfully', 'success');
      } else {
        await productService.addProduct(user.tenantId, data);
        showToast('Product added successfully', 'success');
      }
      setShowForm(false);
      setEditingProduct(undefined);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!user?.tenantId) return;
    
    if (isBulkDeleting) {
      setFormLoading(true);
      try {
        await Promise.all(selectedIds.map(id => productService.deleteProduct(user.tenantId!, id)));
        showToast(`${selectedIds.length} items deleted`, 'success');
        setSelectedIds([]);
        setIsBulkDeleting(false);
      } catch (error) {
        showToast('Failed to delete items', 'danger');
      } finally {
        setFormLoading(false);
      }
    } else if (deletingProduct) {
      setFormLoading(true);
      try {
        await productService.deleteProduct(user.tenantId, deletingProduct.id);
        showToast('Product deleted successfully', 'success');
        setDeletingProduct(undefined);
        if (selectedProduct?.id === deletingProduct.id) setSelectedProduct(null);
      } catch (error) {
        showToast('Failed to delete product', 'danger');
      } finally {
        setFormLoading(false);
      }
    }
  };

  const handleExportCSV = () => {
    const dataToExport = selectedIds.length > 0 
      ? products.filter(p => selectedIds.includes(p.id)) 
      : products;
    
    const headers = [
      'Name', 'SKU', 'Category', 'Stock', 'Selling Price', 'Expiry', 
      'Movement', 'Health Status', 'Daily Sales Avg', 'Depletion Date', 'Suggested Reorder'
    ];
    const rows = dataToExport.map(p => {
      const intel = intelligence[p.id];
      return [
        p.name,
        p.sku,
        p.category,
        p.stockQuantity,
        p.sellingPrice,
        toJsDate(p.expiryDate).toLocaleDateString(),
        intel?.movement || 'N/A',
        intel?.status || 'N/A',
        intel?.dailySalesAvg.toFixed(2) || '0.00',
        intel?.expectedDepletionDate?.toLocaleDateString() || 'N/A',
        intel?.suggestedQuantity || 0
      ];
    });

    const csvContent = [headers, ...rows].map(e => e.map(String).map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "inventory_export.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <PageTransition>
      <PageContainer className="p-4 md:p-6 lg:p-8 gap-8 relative overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <SectionHeader 
          title="Stock Management" 
          description="Advanced inventory control with real-time syncing and bulk operations."
        />
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="font-bold border-border bg-surface" 
            leftIcon={<Download className="h-4 w-4" />}
            onClick={handleExportCSV}
          >
            Export {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
          </Button>
          <Button 
            onClick={() => setShowForm(true)} 
            className="font-bold shadow-xl shadow-primary/20" 
            leftIcon={<Plus className="h-5 w-5" />}
          >
            Add Product
          </Button>
        </div>
      </div>

      {/* Elegant Dual-Tab Selector */}
      <div className="flex border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-30 pt-2 pb-0 mb-2 gap-2">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            "pb-3.5 px-6 text-[10.5px] font-black uppercase tracking-widest border-b-2 transition-all duration-200 cursor-pointer relative",
            activeTab === 'dashboard' 
              ? "border-primary text-primary" 
              : "border-transparent text-text/40 hover:text-text/75"
          )}
        >
          {activeTab === 'dashboard' && (
            <motion.div layoutId="inventory-active-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
          Dashboard Overview
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={cn(
            "pb-3.5 px-6 text-[10.5px] font-black uppercase tracking-widest border-b-2 transition-all duration-200 cursor-pointer relative",
            activeTab === 'ledger' 
              ? "border-primary text-primary" 
              : "border-transparent text-text/40 hover:text-text/75"
          )}
        >
          {activeTab === 'ledger' && (
            <motion.div layoutId="inventory-active-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
          Stock Ledger ({products.length})
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <InventoryDashboard 
          products={products} 
          intelligence={intelligence} 
          onViewProduct={(p) => setSelectedProduct(p)} 
          onEditProduct={(p) => { setEditingProduct(p); setShowForm(true); }} 
        />
      ) : (
        <>
          <InventoryIntelligence 
            intelligence={intelligence} 
            loading={intelligenceLoading} 
          />

          <ProductFilters 
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            selectedStatus={selectedStatus}
            setSelectedStatus={setSelectedStatus}
            selectedExpiryStatus={selectedExpiryStatus}
            setSelectedExpiryStatus={setSelectedExpiryStatus}
            priceRange={priceRange}
            setPriceRange={setPriceRange}
            barcodeInput={barcodeInput}
            setBarcodeInput={setBarcodeInput}
            onBarcodeScan={handleBarcodeScan}
          />

          <div className="flex flex-col gap-4">
            {/* Bulk Actions Bar */}
            <AnimatePresence>
              {selectedIds.length > 0 && (
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 50, opacity: 0 }}
                  className="fixed bottom-6 left-6 right-6 lg:left-auto lg:right-8 lg:bottom-8 lg:w-auto z-40 flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-primary text-white rounded-3xl shadow-2xl shadow-primary/40 border border-white/20"
                >
                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-black uppercase tracking-widest">{selectedIds.length} Selected</span>
                      <div className="h-6 w-[1px] bg-white/20 hidden md:block" />
                    </div>
                    <button 
                      onClick={() => setSelectedIds([])}
                      className="text-xs font-bold hover:underline opacity-60 hover:opacity-100"
                    >
                      Clear Selection
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <button 
                      onClick={() => setIsBulkDeleting(true)}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-danger hover:bg-danger/80 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-danger/20"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                    <div className="flex-1 md:flex-none flex items-center gap-2">
                      <button 
                        onClick={async () => {
                          if (!user?.tenantId) return;
                          setFormLoading(true);
                          try {
                            await Promise.all(selectedIds.map(id => productService.updateProduct(user.tenantId!, id, { updatedAt: new Date() })));
                            showToast(`${selectedIds.length} items marked as reviewed`, 'success');
                            setSelectedIds([]);
                          } finally { setFormLoading(false); }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Review
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-black text-text/40 uppercase tracking-widest">Inventory Ledger</h3>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black">
                  {products.length} ITEMS FOUND
                </span>
              </div>
            </div>
            
            <ProductTable 
              products={products} 
              intelligence={intelligence}
              loading={loading}
              selectedIds={selectedIds}
              onSelect={setSelectedIds}
              onEdit={(p) => { setEditingProduct(p); setShowForm(true); }}
              onDelete={(p) => setDeletingProduct(p)}
              onView={(p) => setSelectedProduct(p)}
              emptyAction={
                <Button 
                  variant="primary" 
                  onClick={() => setShowForm(true)}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  Add Your First Product
                </Button>
              }
            />
          </div>
        </>
      )}

      {/* Modals & Sidebars */}
      <AnimatePresence mode="wait">
        {showForm && (
          <ProductForm 
            product={editingProduct}
            onSave={handleSaveProduct}
            onClose={() => { setShowForm(false); setEditingProduct(undefined); }}
            loading={formLoading}
          />
        )}

        {selectedProduct && (
          <ProductDetailsSidebar 
            product={selectedProduct}
            intelligence={intelligence[selectedProduct.id]}
            onClose={() => setSelectedProduct(null)}
            onEdit={(p) => { setSelectedProduct(null); setEditingProduct(p); setShowForm(true); }}
            onDelete={(p) => { setDeletingProduct(p); }}
          />
        )}

        {(deletingProduct || isBulkDeleting) && (
          <ConfirmModal 
            isOpen={true}
            title={isBulkDeleting ? 'Delete Multiple Items' : 'Delete Product'}
            message={isBulkDeleting 
              ? `Are you sure you want to delete ${selectedIds.length} selected items?` 
              : `Are you sure you want to delete "${deletingProduct?.name}"?`
            }
            onConfirm={handleDeleteProduct}
            onClose={() => { setDeletingProduct(undefined); setIsBulkDeleting(false); }}
            isLoading={formLoading}
          />
        )}
      </AnimatePresence>
    </PageContainer>
    </PageTransition>
  );
}
