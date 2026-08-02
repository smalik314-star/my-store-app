import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  History,
  PackageSearch,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { EmptyState } from '../../components/common/EmptyState';
import { PageTransition } from '../../components/common/PageTransition';
import { SkeletonTable } from '../../components/common/Skeleton';
import { PageHeader } from '../../components/erp/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { productService } from '../../services/productService';
import { stockAdjustmentService } from '../../services/stockAdjustmentService';
import type {
  Product,
  ProductBatch,
  StockAdjustmentReason,
  StockAdjustmentRecord,
} from '../../types';
import { toJsDate } from '../../utils/date';
import { validateAdjustmentDirection } from '../../utils/stock-adjustment';

const reasonLabels: Record<StockAdjustmentReason, string> = {
  physical_increase: 'Physical stock increase',
  physical_decrease: 'Physical stock decrease',
  damage: 'Damage',
  breakage: 'Breakage',
  expired: 'Expired',
  lost: 'Lost',
  found: 'Found',
  correction: 'Correction',
  other: 'Other',
};

const normalizeBatch = (value: string) => value.trim().toUpperCase();

export default function StockAdjustment() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const requestIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const targetInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [historyCursor, setHistoryCursor] = useState<any>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [productId, setProductId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [targetQuantity, setTargetQuantity] = useState('');
  const [reason, setReason] = useState<StockAdjustmentReason>('correction');
  const [reasonNote, setReasonNote] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedProduct = products.find(product => product.id === productId) || null;
  const selectedBatch =
    selectedProduct?.batches?.find(
      batch => normalizeBatch(batch.batchNumber) === normalizeBatch(batchNumber)
    ) || null;
  const currentQuantity = Number(selectedBatch?.quantity) || 0;
  const nextQuantity = targetQuantity === '' ? null : Number(targetQuantity);
  const difference =
    nextQuantity !== null && Number.isFinite(nextQuantity) ? nextQuantity - currentQuantity : 0;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadHistory = async (reset: boolean = true) => {
    if (!user?.tenantId) return;
    setHistoryLoading(true);
    setLoadError('');
    try {
      const result = await stockAdjustmentService.listPage(
        user.tenantId,
        25,
        reset ? undefined : historyCursor
      );
      setAdjustments(current => (reset ? result.records : [...current, ...result.records]));
      setHistoryCursor(result.lastDoc);
      setHasMoreHistory(result.hasMore);
    } catch (error: any) {
      setLoadError(error.message || 'Stock adjustment history could not be loaded.');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.tenantId) return;
    setLoading(true);
    void loadHistory(true);
    const loadProducts = async () => {
      const trimmed = debouncedSearch.trim();
      const result = trimmed.length >= 2
        ? await productService.searchProducts(user.tenantId!, trimmed, { pageSize: 50 })
        : await productService.getProductsPaginated(user.tenantId!, 50, null);
      setProducts(result?.products || []);
      setCursorId(result?.nextCursor || null);
      setHasMoreProducts(trimmed.length < 2 && Boolean(result?.hasMore));
      setLoading(false);
    };
    void loadProducts();
  }, [debouncedSearch, user?.tenantId]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products
      .filter(product =>
        [product.name, product.brand, product.sku, product.barcode, product.manufacturer]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [products, search]);

  const loadMoreProducts = async () => {
    if (!user?.tenantId || !cursorId) return;
    setLoading(true);
    try {
      const result = await productService.getProductsPaginated(user.tenantId, 50, cursorId);
      const nextRows = result?.products || [];
      setProducts(current =>
        Array.from(new Map([...current, ...nextRows].map(product => [product.id, product])).values())
      );
      setCursorId(result?.nextCursor || null);
      setHasMoreProducts(Boolean(result?.hasMore));
    } finally {
      setLoading(false);
    }
  };

  const resetRequest = () => {
    requestIdRef.current = null;
  };

  const selectProduct = (product: Product) => {
    setProductId(product.id);
    setBatchNumber('');
    setTargetQuantity('');
    setSearch(product.name);
    resetRequest();
  };

  const selectBatch = (batch: ProductBatch) => {
    setBatchNumber(normalizeBatch(batch.batchNumber));
    setTargetQuantity(String(Number(batch.quantity) || 0));
    resetRequest();
    window.setTimeout(() => {
      targetInputRef.current?.focus();
      targetInputRef.current?.select();
    }, 0);
  };

  const validate = () => {
    if (!selectedProduct) return 'Select a product.';
    if (!selectedBatch) return 'Select the exact batch to adjust.';
    if (nextQuantity === null || !Number.isInteger(nextQuantity) || nextQuantity < 0) {
      return 'Physical batch quantity must be a whole number of zero or more.';
    }
    if (difference === 0) return 'Physical quantity is unchanged.';
    try {
      validateAdjustmentDirection(reason, difference);
    } catch (error) {
      return (error as Error).message;
    }
    if (!reasonNote.trim()) return 'Enter a clear reason for this adjustment.';
    return '';
  };

  const requestConfirmation = () => {
    const error = validate();
    if (error) {
      showToast(error, 'danger');
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    if (!user?.tenantId || !selectedProduct || !selectedBatch || savingRef.current) return;
    const error = validate();
    if (error) {
      showToast(error, 'danger');
      return;
    }

    savingRef.current = true;
    requestIdRef.current ||= crypto.randomUUID();
    setSaving(true);
    try {
      const record = await stockAdjustmentService.create(user.tenantId, {
        requestId: requestIdRef.current,
        productId: selectedProduct.id,
        batchNumber: selectedBatch.batchNumber,
        expectedBatchQuantity: currentQuantity,
        newBatchQuantity: Number(targetQuantity),
        reason,
        reasonNote,
        notes,
      });
      showToast(`${record.adjustmentNumber} posted successfully.`, 'success');
      requestIdRef.current = null;
      setProductId('');
      setBatchNumber('');
      setTargetQuantity('');
      setSearch('');
      setReason('correction');
      setReasonNote('');
      setNotes('');
      await loadHistory(true);
    } catch (error: any) {
      showToast(error.message || 'Stock adjustment could not be posted.', 'danger');
    } finally {
      savingRef.current = false;
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  if (!['owner', 'admin'].includes(user?.role || '')) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-4xl p-4 md:p-8">
          <EmptyState
            icon={<AlertTriangle className="h-12 w-12" />}
            title="Restricted stock operation"
            description="Only the store owner or an administrator can post stock adjustments."
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 pb-28 sm:space-y-6 md:p-8 md:pb-8">
        <PageHeader
          title="Stock Adjustment"
          description="Correct an existing batch through an idempotent, auditable stock movement."
          breadcrumbs={[{ label: 'Inventory' }, { label: 'Stock Adjustment' }]}
          actions={
            <Button variant="outline" onClick={() => void loadHistory(true)} disabled={historyLoading}>
              <RefreshCw className="h-4 w-4" /> Refresh history
            </Button>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.25fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-4">
              <label className="text-xs font-bold uppercase tracking-wide text-text/55">
                Find product
              </label>
              <div className="relative mt-2">
                <PackageSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text/40" />
                <input
                  value={search}
                  onChange={event => {
                    setSearch(event.target.value);
                    if (selectedProduct && event.target.value !== selectedProduct.name) {
                      setProductId('');
                      setBatchNumber('');
                      setTargetQuantity('');
                    }
                    resetRequest();
                  }}
                  placeholder="Name, brand, SKU or barcode"
                  className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            {loading ? (
              <SkeletonTable rows={6} />
            ) : filteredProducts.length === 0 ? (
              <EmptyState
                icon={<PackageSearch className="h-10 w-10" />}
                title="No products found"
                description="Try another name, brand, SKU or barcode."
              />
            ) : (
              <div className="max-h-[440px] divide-y divide-border overflow-y-auto">
                {filteredProducts.map(product => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => selectProduct(product)}
                    className={`min-h-16 w-full px-4 py-3 text-left transition hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                      product.id === productId ? 'bg-primary/[0.07]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{product.name}</div>
                        <div className="mt-1 text-xs text-text/50">
                          {product.brand || 'No brand'} | {product.sku || 'No SKU'}
                        </div>
                      </div>
                      <span className="rounded-full bg-background px-2 py-1 text-xs font-bold">
                        {product.stockQuantity || 0} units
                      </span>
                    </div>
                  </button>
                ))}
                {hasMoreProducts && search.trim().length < 2 && (
                  <div className="p-4 text-center">
                    <Button variant="outline" onClick={loadMoreProducts} disabled={loading}>
                      Load more products
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            {!selectedProduct ? (
              <EmptyState
                icon={<SlidersHorizontal className="h-12 w-12" />}
                title="Select a product"
                description="Choose a product to review its exact batch quantities."
              />
            ) : (
              <>
                <div className="border-b border-border p-4 sm:p-5">
                  <div className="text-lg font-bold">{selectedProduct.name}</div>
                  <div className="mt-1 text-sm text-text/55">
                    Total stock: <strong>{selectedProduct.stockQuantity || 0}</strong> | Select the
                    batch counted physically.
                  </div>
                </div>

                <div className="border-b border-border p-4 sm:p-5">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-text/55">
                    Existing batches
                  </div>
                  {!selectedProduct.batches?.length ? (
                    <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
                      This legacy product has no reconciled batch record. Add stock through Purchase
                      or Opening Stock before adjustment.
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedProduct.batches.map(batch => (
                        <button
                          key={batch.batchNumber}
                          type="button"
                          onClick={() => selectBatch(batch)}
                          className={`min-h-16 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            normalizeBatch(batch.batchNumber) === normalizeBatch(batchNumber)
                              ? 'border-primary bg-primary/[0.06]'
                              : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <div className="flex justify-between gap-2">
                            <span className="font-mono text-sm font-bold">{batch.batchNumber}</span>
                            <span className="font-bold">{batch.quantity} units</span>
                          </div>
                          <div className="mt-1 text-xs text-text/50">
                            Expiry {toJsDate(batch.expiryDate).toLocaleDateString('en-IN')}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedBatch && (
                  <div className="space-y-5 p-4 sm:p-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label>
                        <span className="text-xs font-bold uppercase tracking-wide text-text/55">
                          Current batch quantity
                        </span>
                        <input
                          value={currentQuantity}
                          readOnly
                          className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 font-bold"
                        />
                      </label>
                      <label>
                        <span className="text-xs font-bold uppercase tracking-wide text-text/55">
                          Physical quantity found
                        </span>
                        <input
                          ref={targetInputRef}
                          type="number"
                          min="0"
                          step="1"
                          value={targetQuantity}
                          onChange={event => {
                            setTargetQuantity(event.target.value);
                            resetRequest();
                          }}
                          className="mt-2 h-12 w-full rounded-xl border border-border bg-surface px-4 font-bold outline-none focus:border-primary"
                        />
                      </label>
                    </div>

                    {nextQuantity !== null && difference !== 0 && (
                      <div
                        className={`flex items-center gap-3 rounded-xl border p-4 ${
                          difference > 0
                            ? 'border-success/30 bg-success/5'
                            : 'border-danger/30 bg-danger/5'
                        }`}
                      >
                        {difference > 0 ? (
                          <ArrowUp className="h-5 w-5 text-success" />
                        ) : (
                          <ArrowDown className="h-5 w-5 text-danger" />
                        )}
                        <div>
                          <div className="font-bold">
                            {difference > 0 ? '+' : ''}
                            {difference} units
                          </div>
                          <div className="text-xs text-text/55">
                            Product total will become {Number(selectedProduct.stockQuantity) + difference}.
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label>
                        <span className="text-xs font-bold uppercase tracking-wide text-text/55">
                          Adjustment type
                        </span>
                        <select
                          value={reason}
                          onChange={event => {
                            setReason(event.target.value as StockAdjustmentReason);
                            resetRequest();
                          }}
                          className="mt-2 h-12 w-full rounded-xl border border-border bg-surface px-4 outline-none focus:border-primary"
                        >
                          {Object.entries(reasonLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="text-xs font-bold uppercase tracking-wide text-text/55">
                          Reason / reference
                        </span>
                        <input
                          value={reasonNote}
                          onChange={event => {
                            setReasonNote(event.target.value);
                            resetRequest();
                          }}
                          placeholder="e.g. Physical count on 24 Jul"
                          className="mt-2 h-12 w-full rounded-xl border border-border bg-surface px-4 outline-none focus:border-primary"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wide text-text/55">
                        Notes (optional)
                      </span>
                      <textarea
                        value={notes}
                        onChange={event => {
                          setNotes(event.target.value);
                          resetRequest();
                        }}
                        rows={3}
                        className="mt-2 w-full rounded-xl border border-border bg-surface p-4 outline-none focus:border-primary"
                      />
                    </label>

                    <div className="hidden justify-end md:flex">
                      <Button onClick={requestConfirmation} disabled={saving}>
                        Post Adjustment
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border p-4 font-bold">
            <History className="h-5 w-5 text-primary" /> Recent Adjustments
          </div>
          {historyLoading ? (
            <SkeletonTable rows={5} />
          ) : loadError ? (
            <div className="p-6 text-center">
              <p className="text-sm text-danger">{loadError}</p>
              <Button variant="outline" className="mt-4" onClick={() => void loadHistory(true)}>
                Retry
              </Button>
            </div>
          ) : adjustments.length === 0 ? (
            <EmptyState
              icon={<History className="h-10 w-10" />}
              title="No stock adjustments"
              description="Posted corrections will remain here as an audit trail."
            />
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {adjustments.map(row => (
                  <div key={row.id} className="space-y-2 p-4">
                    <div className="flex justify-between gap-3">
                      <span className="font-mono text-sm font-bold text-primary">
                        {row.adjustmentNumber}
                      </span>
                      <span
                        className={`font-bold ${
                          row.quantityDifference > 0 ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {row.quantityDifference > 0 ? '+' : ''}
                        {row.quantityDifference}
                      </span>
                    </div>
                    <div className="font-semibold">{row.productName}</div>
                    <div className="text-xs text-text/55">
                      Batch {row.batchNumber} | {row.previousBatchQuantity} {'->'} {row.newBatchQuantity} |{' '}
                      {reasonLabels[row.reason]}
                    </div>
                    <div className="text-xs">{row.reasonNote}</div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-background text-xs uppercase text-text/55">
                    <tr>
                      <th className="px-4 py-3 text-left">Adjustment</th>
                      <th className="px-4 py-3 text-left">Product</th>
                      <th className="px-4 py-3 text-left">Batch</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-right">Before</th>
                      <th className="px-4 py-3 text-right">After</th>
                      <th className="px-4 py-3 text-right">Difference</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {adjustments.map(row => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 font-mono font-semibold text-primary">
                          {row.adjustmentNumber}
                        </td>
                        <td className="px-4 py-3 font-semibold">{row.productName}</td>
                        <td className="px-4 py-3 font-mono">{row.batchNumber}</td>
                        <td className="px-4 py-3">{reasonLabels[row.reason]}</td>
                        <td className="px-4 py-3 text-right">{row.previousBatchQuantity}</td>
                        <td className="px-4 py-3 text-right">{row.newBatchQuantity}</td>
                        <td
                          className={`px-4 py-3 text-right font-bold ${
                            row.quantityDifference > 0 ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {row.quantityDifference > 0 ? '+' : ''}
                          {row.quantityDifference}
                        </td>
                        <td className="max-w-64 truncate px-4 py-3" title={row.reasonNote}>
                          {row.reasonNote}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasMoreHistory && (
                <div className="border-t border-border p-4 text-center">
                  <Button
                    variant="outline"
                    onClick={() => void loadHistory(false)}
                    disabled={historyLoading}
                  >
                    Load more adjustments
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>

        {selectedBatch && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
            <Button className="h-12 w-full" onClick={requestConfirmation} disabled={saving}>
              Post Adjustment
            </Button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        title="Confirm Stock Adjustment"
        message={
          selectedProduct && selectedBatch
            ? `${selectedProduct.name}, batch ${selectedBatch.batchNumber}: change ${currentQuantity} to ${targetQuantity} units (${difference > 0 ? '+' : ''}${difference}). This creates a permanent audit entry and cannot be deleted.`
            : ''
        }
        confirmText={saving ? 'Posting...' : 'Confirm & Post'}
        variant="danger"
        isLoading={saving}
      />
    </PageTransition>
  );
}
