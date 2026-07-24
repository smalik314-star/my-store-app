import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseService } from '../../services/purchaseService';
import { Purchase } from '../../types';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/PageTransition';
import { SkeletonTable } from '../../components/common/Skeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { 
  Truck, 
  Search, 
  Plus, 
  Calendar, 
  Receipt, 
  Ban, 
  Eye, 
  User, 
  TrendingUp, 
  PackageCheck
} from 'lucide-react';

export default function Purchases() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState<Purchase | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (!user?.tenantId) return;
    loadPurchases();
  }, [user]);

  const loadPurchases = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    setLoadError('');
    try {
      const data = await purchaseService.getPurchases(user.tenantId);
      setPurchases(data);
    } catch (error) {
      console.error('Error loading purchases:', error);
      setLoadError('Purchase history could not be loaded. Check your connection and try again.');
      showToast('Failed to load purchases history', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      const s = searchTerm.toLowerCase();
      return (
        p.purchaseNumber.toLowerCase().includes(s) ||
        p.supplierName.toLowerCase().includes(s) ||
        p.invoiceNumber.toLowerCase().includes(s)
      );
    });
  }, [purchases, searchTerm]);

  const stats = useMemo(() => {
    const postedPurchases = purchases.filter(purchase => purchase.status !== 'cancelled');
    const totalCount = postedPurchases.length;
    const totalValue = postedPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const uniqueSuppliers = new Set(postedPurchases.map(p => p.supplierId)).size;
    return {
      totalCount,
      totalValue,
      uniqueSuppliers
    };
  }, [purchases]);

  const handleCancel = async () => {
    if (!cancelConfirm || !user?.tenantId) return;
    setIsCancelling(true);
    try {
      await purchaseService.cancelPurchase(user.tenantId, cancelConfirm.id);
      showToast('Purchase cancelled and stock levels reversed successfully', 'success');
      setCancelConfirm(null);
      loadPurchases();
    } catch (error: any) {
      console.error(error);
      const msg = error?.message || 'Failed to cancel purchase entry';
      showToast(msg, 'danger');
    } finally {
      setIsCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-4 md:p-8 max-w-[1600px] mx-auto space-y-5 md:space-y-8">
        <div className="flex justify-between items-center">
          <div className="h-10 w-48 bg-text/5 animate-pulse rounded-lg" />
          <div className="h-12 w-32 bg-text/5 animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-surface rounded-3xl border border-border animate-pulse" />
          ))}
        </div>
        <SkeletonTable rows={10} />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-text tracking-tight flex items-center gap-3 md:gap-4">
              Stock In / Purchases
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Truck className="h-6 w-6 text-primary" />
              </div>
            </h1>
            <p className="text-text/60 mt-1">Manage purchase transactions, stock entries, and supplier records</p>
          </div>
          <Button 
            onClick={() => navigate('/purchases/new')} 
            className="rounded-2xl min-h-12 px-6 font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all w-full md:w-auto"
          >
            <Plus className="h-5 w-5" />
            New Purchase Entry
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
          <Card className="p-4 md:p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text/60">Total Purchase Entries</p>
              <h3 className="text-3xl font-black mt-1 text-text">{stats.totalCount}</h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Receipt className="h-6 w-6" />
            </div>
          </Card>

          <Card className="p-4 md:p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text/60">Total Purchase Value</p>
              <h3 className="text-3xl font-black mt-1 text-text">{formatCurrency(stats.totalValue)}</h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <TrendingUp className="h-6 w-6" />
            </div>
          </Card>

          <Card className="p-4 md:p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text/60">Active Suppliers</p>
              <h3 className="text-3xl font-black mt-1 text-text">{stats.uniqueSuppliers}</h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500">
              <User className="h-6 w-6" />
            </div>
          </Card>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text/40" />
            <input
              type="text"
              placeholder="Search by Purchase #, Supplier, or Invoice #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 h-12 bg-surface border border-border rounded-2xl focus:border-primary/50 outline-none text-text transition-all font-medium placeholder:text-text/40"
            />
          </div>
        </div>

        {/* Table View */}
        {loadError ? (
          <Card className="p-6 md:p-10 text-center border border-danger/20 rounded-2xl">
            <p className="font-bold text-danger">{loadError}</p>
            <Button className="mt-4 min-h-11" onClick={() => void loadPurchases()}>Retry</Button>
          </Card>
        ) : filteredPurchases.length === 0 ? (
          <EmptyState 
            title={searchTerm ? "No purchases found" : "No purchase transactions yet"} 
            description={searchTerm ? "Try searching with different terms" : "Log your first purchase entry to add inventory items"}
            icon={<Truck className="h-20 w-20" />}
            action={!searchTerm ? (
              <Button onClick={() => navigate('/purchases/new')}>Add Purchase Entry</Button>
            ) : undefined}
          />
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {filteredPurchases.map((purchase) => (
                <Card key={purchase.id} className="p-4 border border-border rounded-2xl bg-surface">
                  <button
                    type="button"
                    onClick={() => navigate(`/purchases/${purchase.id}`)}
                    className="w-full text-left"
                    aria-label={`View purchase ${purchase.purchaseNumber}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-primary">{purchase.purchaseNumber}</span>
                          {purchase.status === 'cancelled' && <Badge variant="danger">Cancelled</Badge>}
                        </div>
                        <p className="font-bold text-text mt-1">{purchase.supplierName}</p>
                        <p className="text-xs text-text/55 mt-0.5">Invoice {purchase.invoiceNumber} · {formatDate(purchase.invoiceDate)}</p>
                      </div>
                      <p className="font-black text-text whitespace-nowrap">{formatCurrency(purchase.totalAmount)}</p>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs font-semibold text-text/60">
                      <span>{purchase.itemsCount} item lines</span>
                      <span className="text-primary">View details</span>
                    </div>
                  </button>
                  {purchase.status !== 'cancelled' && (
                    <Button
                      variant="ghost"
                      onClick={() => setCancelConfirm(purchase)}
                      className="mt-2 w-full min-h-11 text-danger hover:bg-danger/5 rounded-xl gap-2"
                    >
                      <Ban className="h-4 w-4" /> Cancel purchase
                    </Button>
                  )}
                </Card>
              ))}
            </div>
            <Card className="hidden md:block overflow-hidden border border-border rounded-3xl bg-surface">
              <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-text/[0.02]">
                    <th className="px-6 py-4 text-xs font-bold text-text/60 uppercase tracking-wider">Purchase No</th>
                    <th className="px-6 py-4 text-xs font-bold text-text/60 uppercase tracking-wider">Supplier</th>
                    <th className="px-6 py-4 text-xs font-bold text-text/60 uppercase tracking-wider">Invoice Info</th>
                    <th className="px-6 py-4 text-xs font-bold text-text/60 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-bold text-text/60 uppercase tracking-wider text-center">Items Count</th>
                    <th className="px-6 py-4 text-xs font-bold text-text/60 uppercase tracking-wider text-right">Total Amount</th>
                    <th className="px-6 py-4 text-xs font-bold text-text/60 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPurchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-text/[0.01] transition-all">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary">{purchase.purchaseNumber}</span>
                          {purchase.status === 'cancelled' && <Badge variant="danger">Cancelled</Badge>}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="font-semibold text-text">{purchase.supplierName}</div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="font-semibold text-text">{purchase.invoiceNumber}</div>
                      </td>
                      <td className="px-6 py-5 text-text/70 text-sm">
                        {formatDate(purchase.invoiceDate)}
                      </td>
                      <td className="px-6 py-5 text-center font-bold text-text/80">
                        {purchase.itemsCount}
                      </td>
                      <td className="px-6 py-5 text-right font-black text-text">
                        {formatCurrency(purchase.totalAmount)}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/purchases/${purchase.id}`)}
                            className="text-primary hover:bg-primary/5 rounded-xl h-9 px-3 gap-1.5 flex items-center font-semibold"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                          {purchase.status !== 'cancelled' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCancelConfirm(purchase)}
                              className="text-danger hover:bg-danger/5 rounded-xl h-9 px-3 gap-1.5 flex items-center font-semibold"
                            >
                              <Ban className="h-4 w-4" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
          </>
        )}

        {/* Cancellation Confirmation Modal */}
        {cancelConfirm && (
          <ConfirmModal
            isOpen={!!cancelConfirm}
            title={`Cancel Purchase ${cancelConfirm.purchaseNumber}`}
            message="Cancel this purchase? Stock will be reversed exactly once. The purchase and its item lines will remain in audit history. Cancellation is rejected if it would make any batch negative."
            confirmText={isCancelling ? "Cancelling & Reversing..." : "Confirm Cancellation"}
            cancelText="Cancel"
            onConfirm={handleCancel}
            onClose={() => setCancelConfirm(null)}
            variant="danger"
            isLoading={isCancelling}
          />
        )}
      </div>
    </PageTransition>
  );
}
