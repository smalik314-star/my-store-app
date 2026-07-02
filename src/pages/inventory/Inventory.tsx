import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Download, Trash2, Tag, FileDown, Search, Filter } from 'lucide-react';
import { PageContainer, SectionHeader } from '../../components/common/PageContainer';
import { Button } from '../../components/common/Button';
import { ProductTable } from '../../components/inventory/ProductTable';
import { ProductForm } from '../../components/inventory/ProductForm';
import { ProductFilters } from '../../components/inventory/ProductFilters';
import { ProductDetailsSidebar } from '../../components/inventory/ProductDetailsSidebar';
import { productService } from '../../services/productService';
import { Product } from '../../types';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../utils/cn';
import { PageTransition } from '../../components/common/PageTransition';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { SkeletonTable } from '../../components/common/Skeleton';

import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';

export default function Inventory() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const viewId = searchParams.get('view');

  const [products, setProducts] = useState<Product[]>([]);
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
    setLoading(true);
    const unsub = productService.subscribeToProducts(
      user.uid,
      (newProducts) => {
        let filtered = [...newProducts];

        // Client-side advanced filtering
        if (selectedExpiryStatus !== 'all') {
          const now = new Date();
          const soonThreshold = new Date();
          soonThreshold.setDate(soonThreshold.getDate() + 60);

          filtered = filtered.filter(p => {
            if (!p.expiryDate) return false;
            const expiry = p.expiryDate.toDate();
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
    setFormLoading(true);
    try {
      if (editingProduct) {
        await productService.updateProduct(editingProduct.id, data);
        showToast('Product updated successfully', 'success');
      } else {
        await productService.addProduct(data);
        showToast('Product added successfully', 'success');
      }
      setShowForm(false);
      setEditingProduct(undefined);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (isBulkDeleting) {
      setFormLoading(true);
      try {
        await Promise.all(selectedIds.map(id => productService.deleteProduct(id)));
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
        await productService.deleteProduct(deletingProduct.id);
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
    
    const headers = ['Name', 'SKU', 'Category', 'Stock', 'Selling Price', 'Expiry'];
    const rows = dataToExport.map(p => [
      p.name,
      p.sku,
      p.category,
      p.stockQuantity,
      p.sellingPrice,
      p.expiryDate?.toDate().toLocaleDateString()
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
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
              <div className="flex items-center gap-3 w-full md:w-auto">
                <button 
                  onClick={handleExportCSV}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 rounded-2xl text-xs font-bold transition-all"
                >
                  <FileDown className="h-4 w-4" /> Export
                </button>
                <button 
                  onClick={() => setIsBulkDeleting(true)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-danger hover:bg-danger/80 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-danger/20"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
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
