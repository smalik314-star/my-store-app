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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ledger'>('ledger');

  const [products, setProducts] = useState<Product[]>([]);
  const [intelligence, setIntelligence] = useState<Record<string, ProductIntelligence>>({});
  const [intelligenceLoading, setIntelligenceLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | undefined>();
  const [formLoading, setFormLoading] = useState(false);
  const [productFormSession, setProductFormSession] = useState(0);
  const { showToast } = useToast();

  // Handle direct edit/view links
  useEffect(() => {
    if (!user?.tenantId) return;
    const loadLinkedProduct = async () => {
      const targetId = editId || viewId;
      if (!targetId) return;
      const fromList = products.find(product => product.id === targetId);
      const product = fromList || await productService.getProductById(user.tenantId!, targetId);
      if (!product) return;
      if (editId) {
        setEditingProduct(product);
        setShowForm(true);
      } else {
        setSelectedProduct(product);
      }
      setSearchParams({});
    };
    void loadLinkedProduct();
  }, [editId, viewId, products, setSearchParams, user?.tenantId]);
  
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

  const loadProducts = useCallback(async (reset = false) => {
    if (!user?.tenantId) return;
    setLoading(true);
    try {
      const result = debouncedSearch.trim().length >= 2
        ? await productService.searchProducts(user.tenantId, debouncedSearch.trim(), { pageSize: 40 })
        : await productService.getProductsPaginated(user.tenantId, 40, reset ? null : cursorId, selectedCategory);

      let filtered = [...(result?.products || [])];
      if (selectedExpiryStatus !== 'all') {
        const now = new Date();
        const soonThreshold = new Date();
        soonThreshold.setDate(soonThreshold.getDate() + 60);
        filtered = filtered.filter(product => {
          if (!product.expiryDate) return false;
          const expiry = toJsDate(product.expiryDate);
          if (selectedExpiryStatus === 'expired') return expiry < now;
          if (selectedExpiryStatus === 'soon') return expiry >= now && expiry <= soonThreshold;
          if (selectedExpiryStatus === 'safe') return expiry > soonThreshold;
          return true;
        });
      }
      if (selectedStatus === 'low') {
        filtered = filtered.filter(product => product.stockQuantity <= product.minimumStock && product.stockQuantity > 0);
      } else if (selectedStatus === 'out') {
        filtered = filtered.filter(product => product.stockQuantity === 0);
      } else if (selectedStatus === 'in') {
        filtered = filtered.filter(product => product.stockQuantity > product.minimumStock);
      }
      if (priceRange.max > 0) {
        filtered = filtered.filter(product => product.sellingPrice >= priceRange.min && product.sellingPrice <= priceRange.max);
      } else if (priceRange.min > 0) {
        filtered = filtered.filter(product => product.sellingPrice >= priceRange.min);
      }

      setProducts(current => reset || debouncedSearch.trim().length >= 2
        ? filtered
        : Array.from(new Map([...current, ...filtered].map(product => [product.id, product])).values())
      );
      setCursorId(result?.nextCursor || null);
      setHasMore(debouncedSearch.trim().length < 2 && Boolean(result?.hasMore));
    } finally {
      setLoading(false);
    }
  }, [cursorId, debouncedSearch, priceRange.max, priceRange.min, selectedCategory, selectedExpiryStatus, selectedStatus, user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId) {
      setLoading(false);
      return;
    }
    setCursorId(null);
    void loadProducts(true);
  }, [loadProducts, user?.tenantId]);

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
    if (!user?.tenantId) return;
    void productService.findProductByCode(user.tenantId, barcode).then(found => {
      if (found) setSelectedProduct(found);
      setBarcodeInput('');
    });
  };

  const handleSaveProduct = async (data: any, saveAndAddAnother = false) => {
    if (!user?.tenantId) return;
    setFormLoading(true);
    try {
      if (editingProduct) {
        await productService.updateProduct(user.tenantId, editingProduct.id, data);
        showToast('Product updated successfully', 'success');
      } else {
        await productService.addProduct(user.tenantId, data);
        showToast(saveAndAddAnother ? 'Product saved. Add the next product.' : 'Product added successfully', 'success');
      }

      setEditingProduct(undefined);
      if (saveAndAddAnother && !editingProduct) {
        // Remount ProductForm so every field is clean and focus starts at product name.
        setProductFormSession(session => session + 1);
        setShowForm(true);
      } else {
        setShowForm(false);
      }
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
        showToast(`${selectedIds.length} products archived`, 'success');
        setSelectedIds([]);
        setIsBulkDeleting(false);
      } catch (error) {
        showToast('Failed to archive products', 'danger');
      } finally {
        setFormLoading(false);
      }
    } else if (deletingProduct) {
      setFormLoading(true);
      try {
        await productService.deleteProduct(user.tenantId, deletingProduct.id);
        showToast('Product archived successfully', 'success');
        setDeletingProduct(undefined);
        if (selectedProduct?.id === deletingProduct.id) setSelectedProduct(null);
      } catch (error) {
        showToast('Failed to archive product', 'danger');
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
      <PageContainer className="gap-4 pb-24 sm:gap-6 lg:gap-8 lg:pb-8 relative overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
        <SectionHeader 
          title="Stock Management" 
          description="Advanced inventory control with real-time syncing and bulk operations."
        />
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-3">
          <Button 
            variant="outline" 
            className="min-h-11 w-full font-bold border-border bg-surface sm:w-auto" 
            leftIcon={<Download className="h-4 w-4" />}
            onClick={handleExportCSV}
          >
            Export {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
          </Button>
          <Button 
            onClick={() => setShowForm(true)} 
            className="min-h-11 w-full font-bold shadow-xl shadow-primary/20 sm:w-auto" 
            leftIcon={<Plus className="h-5 w-5" />}
          >
            Add Product
          </Button>
        </div>
      </div>

      {/* Elegant Dual-Tab Selector */}
      <div className="flex overflow-x-auto border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-30 pt-2 pb-0 mb-2 gap-1 sm:gap-2 scrollbar-none">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            "min-h-11 min-w-max pb-3 px-3 sm:px-6 text-[10px] sm:text-[10.5px] font-black uppercase tracking-wider sm:tracking-widest border-b-2 transition-all duration-200 cursor-pointer relative",
            activeTab === 'dashboard' 
              ? "border-primary text-primary" 
              : "border-transparent text-text/40 hover:text-text/75"
          )}
        >
          {activeTab === 'dashboard' && (
            <motion.div layoutId="inventory-active-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
          <span className="sm:hidden">Overview</span>
          <span className="hidden sm:inline">Dashboard Overview</span>
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={cn(
            "min-h-11 min-w-max pb-3 px-3 sm:px-6 text-[10px] sm:text-[10.5px] font-black uppercase tracking-wider sm:tracking-widest border-b-2 transition-all duration-200 cursor-pointer relative",
            activeTab === 'ledger' 
              ? "border-primary text-primary" 
              : "border-transparent text-text/40 hover:text-text/75"
          )}
        >
          {activeTab === 'ledger' && (
            <motion.div layoutId="inventory-active-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
          <span className="sm:hidden">Products ({products.length})</span>
          <span className="hidden sm:inline">Stock Ledger ({products.length})</span>
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
                  className="fixed bottom-3 left-3 right-3 lg:left-auto lg:right-8 lg:bottom-8 lg:w-auto z-40 flex flex-col md:flex-row items-center justify-between gap-3 p-3 sm:p-4 bg-primary text-white rounded-2xl sm:rounded-3xl shadow-2xl shadow-primary/40 border border-white/20"
                >
                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-black uppercase tracking-widest">{selectedIds.length} Selected</span>
                      <div className="h-6 w-[1px] bg-white/20 hidden md:block" />
                    </div>
                    <button 
                      onClick={() => setSelectedIds([])}
                      className="min-h-11 px-2 text-xs font-bold hover:underline opacity-80 hover:opacity-100"
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

            <div className="flex items-center justify-between px-1 sm:px-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
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
            {hasMore && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => void loadProducts(false)} disabled={loading}>
                  Load more inventory
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals & Sidebars */}
      <AnimatePresence mode="wait">
        {showForm && (
          <ProductForm
            key={productFormSession}
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
            title={isBulkDeleting ? 'Archive Multiple Products' : 'Archive Product'}
            message={isBulkDeleting 
              ? `Archive ${selectedIds.length} selected products? They will be removed from active inventory lists but preserved in audit history.` 
              : `Archive "${deletingProduct?.name}"? It will be removed from active inventory lists but preserved in audit history.`
            }
            confirmText={isBulkDeleting ? 'Archive Products' : 'Archive Product'}
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
