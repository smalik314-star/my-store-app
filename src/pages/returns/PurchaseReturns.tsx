import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { PageTransition } from '../../components/common/PageTransition';
import { SkeletonTable } from '../../components/common/Skeleton';
import { PageHeader } from '../../components/erp/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { purchaseService } from '../../services/purchaseService';
import { purchaseReturnService } from '../../services/purchaseReturnService';
import type {
  Purchase,
  PurchaseItem,
  PurchaseReturnLine,
  PurchaseReturnRecord,
} from '../../types';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { toJsDate } from '../../utils/date';
import { matchesSearchQuery } from '../../utils/search';

type DraftLine = { quantity: number; reason: PurchaseReturnLine['reason'] };

const reasonOptions: Array<{ value: PurchaseReturnLine['reason']; label: string }> = [
  { value: 'expired', label: 'Expired' },
  { value: 'near_expiry', label: 'Near expiry' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'wrong_item', label: 'Wrong item' },
  { value: 'excess_stock', label: 'Excess stock' },
  { value: 'rate_difference', label: 'Rate difference' },
  { value: 'other', label: 'Other' },
];

export default function PurchaseReturns() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const requestIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [returns, setReturns] = useState<PurchaseReturnRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [returnedByItem, setReturnedByItem] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, DraftLine>>({});

  const load = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    setLoadError('');
    try {
      const [purchaseRows, returnRows] = await Promise.all([
        purchaseService.getPurchases(user.tenantId),
        purchaseReturnService.listReturns(user.tenantId),
      ]);
      setPurchases(
        purchaseRows.filter(
          row =>
            row.status !== 'cancelled'
            && row.supplierLedgerTracked === true
            && roundMoney(row.returnAmount || 0) < roundMoney(row.totalAmount)
        )
      );
      setReturns(returnRows);
    } catch (error: any) {
      const message = error.message || 'Purchase returns could not be loaded.';
      setLoadError(message);
      showToast(message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.tenantId]);

  const filtered = useMemo(() => {
    return purchases.filter(row =>
      matchesSearchQuery(search, row.purchaseNumber, row.invoiceNumber, row.supplierName)
    );
  }, [purchases, search]);

  const selectPurchase = async (purchase: Purchase) => {
    if (!user?.tenantId) return;
    setSelectedLoading(true);
    try {
      const [rows, returned] = await Promise.all([
        purchaseService.getPurchaseItems(user.tenantId, purchase.id),
        purchaseReturnService.getReturnedQuantities(user.tenantId, purchase.id),
      ]);
      setSelected(purchase);
      setItems(rows);
      setReturnedByItem(returned);
      setDraft({});
      requestIdRef.current = null;
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLInputElement>('[data-purchase-return-qty]')?.focus();
      });
    } catch (error: any) {
      showToast(error.message || 'Purchase items could not be loaded.', 'danger');
    } finally {
      setSelectedLoading(false);
    }
  };

  const returnableQuantity = (item: PurchaseItem) =>
    Math.max(0, Number(item.quantity) - (Number(returnedByItem[item.id]) || 0));

  const setLine = (itemId: string, patch: Partial<DraftLine>) => {
    setDraft(current => ({
      ...current,
      [itemId]: {
        quantity: current[itemId]?.quantity || 0,
        reason: current[itemId]?.reason || 'other',
        ...patch,
      },
    }));
    requestIdRef.current = null;
  };

  const focusNextQuantityInput = (currentItemId: string) => {
    const currentIndex = items.findIndex(item => item.id === currentItemId);
    for (let index = currentIndex + 1; index < items.length; index += 1) {
      const nextItem = items[index];
      if (returnableQuantity(nextItem) > 0) {
        window.requestAnimationFrame(() => {
          document
            .querySelector<HTMLInputElement>(`[data-purchase-return-qty="${nextItem.id}"]`)
            ?.focus();
        });
        return;
      }
    }
  };

  const previewTotal = useMemo(
    () =>
      roundMoney(
        items.reduce((sum, item) => {
          const quantity = Number(draft[item.id]?.quantity) || 0;
          if (quantity <= 0 || Number(item.quantity) <= 0) return sum;
          return sum + (roundMoney(item.total) / Number(item.quantity)) * quantity;
        }, 0)
      ),
    [draft, items]
  );

  useEffect(() => {
    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === 'F2' && selected && previewTotal > 0 && !savingRef.current) {
        event.preventDefault();
        void submit();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [selected, previewTotal]);

  const submit = async () => {
    if (!user?.tenantId || !selected || savingRef.current) return;
    const lines = items
      .filter(item => (draft[item.id]?.quantity || 0) > 0)
      .map(item => ({
        purchaseItemId: item.id,
        quantity: draft[item.id].quantity,
        reason: draft[item.id].reason,
      }));
    if (lines.length === 0) {
      showToast('Enter at least one return quantity.', 'danger');
      return;
    }
    const invalid = items.find(item => {
      const quantity = Number(draft[item.id]?.quantity) || 0;
      return quantity > 0 && (!Number.isInteger(quantity) || quantity > returnableQuantity(item));
    });
    if (invalid) {
      showToast(
        `${invalid.productName}: maximum returnable quantity is ${returnableQuantity(invalid)}.`,
        'danger'
      );
      return;
    }

    savingRef.current = true;
    requestIdRef.current ||= crypto.randomUUID();
    setSaving(true);
    try {
      const record = await purchaseReturnService.createReturn(user.tenantId, {
        requestId: requestIdRef.current,
        purchaseId: selected.id,
        lines,
      });
      showToast(`${record.returnNumber} posted successfully.`, 'success');
      requestIdRef.current = null;
      setSelected(null);
      setItems([]);
      setReturnedByItem({});
      setDraft({});
      await load();
    } catch (error: any) {
      showToast(error.message || 'Purchase return could not be posted.', 'danger');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 pb-28 sm:space-y-6 md:p-8 md:pb-8">
        <PageHeader
          title="Purchase Returns"
          description="Return stock against its original supplier bill and exact batch."
          breadcrumbs={[{ label: 'Purchases' }, { label: 'Purchase Returns' }]}
          actions={
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(350px,0.8fr)_minmax(0,1.2fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/40" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && filtered[0]) {
                      event.preventDefault();
                      void selectPurchase(filtered[0]);
                    }
                  }}
                  placeholder="Purchase, supplier or invoice"
                  aria-label="Search returnable purchases"
                  className="h-12 w-full rounded-xl border border-border bg-surface pl-10 pr-4 text-sm outline-none focus:border-primary"
                />
              </div>
              <p className="mt-3 text-xs font-semibold text-text/45">
                Ctrl+F focuses search. Enter opens the first result. F2 posts the current return.
              </p>
            </div>
            {loading ? (
              <SkeletonTable rows={6} />
            ) : loadError ? (
              <div className="p-6 text-center">
                <AlertCircle className="mx-auto h-10 w-10 text-danger" />
                <p className="mt-3 text-sm text-danger">{loadError}</p>
                <Button variant="outline" className="mt-4" onClick={load}>
                  Retry
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<RotateCcw className="h-12 w-12" />}
                title="No returnable purchases"
                description="Posted purchases with a remaining return value will appear here."
              />
            ) : (
              <div className="max-h-[640px] divide-y divide-border overflow-y-auto">
                {filtered.map(row => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectPurchase(row)}
                    disabled={selectedLoading}
                    className={`min-h-24 w-full p-4 text-left transition hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                      selected?.id === row.id ? 'bg-primary/[0.07]' : ''
                    }`}
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-mono font-bold text-primary">{row.purchaseNumber}</span>
                      <span className="font-bold">{formatCurrency(row.totalAmount)}</span>
                    </div>
                    <div className="mt-1 font-semibold">{row.supplierName}</div>
                    <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-text/50">
                      <span>Invoice {row.invoiceNumber}</span>
                      <span>Returned {formatCurrency(row.returnAmount || 0)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            {selectedLoading ? (
              <SkeletonTable rows={5} />
            ) : !selected ? (
              <EmptyState
                icon={<RotateCcw className="h-12 w-12" />}
                title="Select an original purchase"
                description="Returnable quantities and exact batches will appear here."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
                  <div>
                    <div className="font-bold">
                      {selected.purchaseNumber} - {selected.supplierName}
                    </div>
                    <div className="mt-1 text-xs text-text/55">
                      Previously returned quantities are excluded. Current batch stock is revalidated
                      when posted.
                    </div>
                  </div>
                  <div className="rounded-xl bg-primary/5 px-4 py-2 text-right">
                    <div className="text-[10px] font-bold uppercase text-text/50">Return value</div>
                    <div className="font-bold text-primary">{formatCurrency(previewTotal)}</div>
                  </div>
                </div>

                <div className="divide-y divide-border md:hidden">
                  {items.map(item => {
                    const available = returnableQuantity(item);
                    return (
                      <div key={item.id} className="space-y-4 p-4">
                        <div className="flex justify-between gap-3">
                          <div>
                            <div className="font-semibold">{item.productName}</div>
                            <div className="mt-1 font-mono text-xs text-text/55">
                              Batch {item.batchNumber}
                            </div>
                          </div>
                          <div className="text-right text-xs text-text/55">
                            <div>Purchased {item.quantity}</div>
                            <div className="font-bold text-text">Returnable {available}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label>
                            <span className="text-xs font-bold uppercase text-text/50">
                              Return qty
                            </span>
                            <input
                              data-purchase-return-qty={item.id}
                              type="number"
                              min="0"
                              max={available}
                              step="1"
                              disabled={available === 0}
                              value={draft[item.id]?.quantity || ''}
                              onChange={event =>
                                setLine(item.id, { quantity: Number(event.target.value) })
                              }
                              onKeyDown={event => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  focusNextQuantityInput(item.id);
                                }
                              }}
                              className="mt-2 h-12 w-full rounded-xl border border-border bg-surface px-3"
                            />
                          </label>
                          <label>
                            <span className="text-xs font-bold uppercase text-text/50">Reason</span>
                            <select
                              value={draft[item.id]?.reason || 'other'}
                              onChange={event =>
                                setLine(item.id, {
                                  reason: event.target.value as PurchaseReturnLine['reason'],
                                })
                              }
                              className="mt-2 h-12 w-full rounded-xl border border-border bg-surface px-3"
                            >
                              {reasonOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="text-right text-sm font-bold">
                          Original line {formatCurrency(item.total)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-background text-xs uppercase text-text/55">
                      <tr>
                        <th className="px-4 py-3 text-left">Product</th>
                        <th className="px-4 py-3 text-left">Batch / Expiry</th>
                        <th className="px-4 py-3 text-right">Purchased</th>
                        <th className="px-4 py-3 text-right">Returned</th>
                        <th className="px-4 py-3 text-right">Returnable</th>
                        <th className="px-4 py-3 text-left">Return Qty</th>
                        <th className="px-4 py-3 text-left">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map(item => {
                        const returned = Number(returnedByItem[item.id]) || 0;
                        const available = returnableQuantity(item);
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3">
                              <div className="font-semibold">{item.productName}</div>
                              <div className="text-xs text-text/50">
                                {formatCurrency(item.total)}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-mono">{item.batchNumber}</div>
                              <div className="text-xs text-text/50">
                                {toJsDate(item.expiryDate).toLocaleDateString('en-IN')}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">{item.quantity}</td>
                            <td className="px-4 py-3 text-right">{returned}</td>
                            <td className="px-4 py-3 text-right font-bold">{available}</td>
                            <td className="px-4 py-3">
                              <input
                                data-purchase-return-qty={item.id}
                                type="number"
                                min="0"
                                max={available}
                                step="1"
                                disabled={available === 0}
                                value={draft[item.id]?.quantity || ''}
                                onChange={event =>
                                  setLine(item.id, { quantity: Number(event.target.value) })
                                }
                                onKeyDown={event => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    focusNextQuantityInput(item.id);
                                  }
                                }}
                                className="h-11 w-24 rounded-lg border border-border bg-surface px-3"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={draft[item.id]?.reason || 'other'}
                                onChange={event =>
                                  setLine(item.id, {
                                    reason: event.target.value as PurchaseReturnLine['reason'],
                                  })
                                }
                                className="h-11 min-w-40 rounded-lg border border-border bg-surface px-3"
                              >
                                {reasonOptions.map(option => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="hidden justify-end border-t border-border p-4 md:flex">
                  <Button onClick={submit} disabled={saving || previewTotal <= 0}>
                    {saving ? 'Posting…' : 'Post Purchase Return'}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-border p-4 font-bold">Recent Purchase Returns</div>
          {returns.length === 0 ? (
            <div className="p-8 text-center text-sm text-text/50">
              No purchase returns posted yet.
            </div>
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {returns.slice(0, 50).map(row => (
                  <div key={row.id} className="space-y-2 p-4">
                    <div className="flex justify-between gap-3">
                      <span className="font-mono text-sm font-semibold text-primary">
                        {row.returnNumber}
                      </span>
                      <span className="font-bold">{formatCurrency(row.totalAmount)}</span>
                    </div>
                    <div className="font-semibold">{row.supplierName}</div>
                    <div className="text-xs text-text/55">
                      {row.purchaseNumber} - Payable adjusted {formatCurrency(row.payableAdjusted)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-background text-xs uppercase text-text/55">
                    <tr>
                      <th className="px-4 py-3 text-left">Return</th>
                      <th className="px-4 py-3 text-left">Supplier</th>
                      <th className="px-4 py-3 text-left">Purchase</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Payable adjusted</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {returns.slice(0, 50).map(row => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 font-mono font-semibold">
                          {row.returnNumber}
                        </td>
                        <td className="px-4 py-3">{row.supplierName}</td>
                        <td className="px-4 py-3">{row.purchaseNumber}</td>
                        <td className="px-4 py-3 text-right font-bold">
                          {formatCurrency(row.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatCurrency(row.payableAdjusted)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatCurrency(row.supplierCredit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {selected && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
            <Button
              className="h-12 w-full"
              onClick={submit}
              disabled={saving || previewTotal <= 0}
            >
              {saving ? 'Posting…' : `Post Return - ${formatCurrency(previewTotal)}`}
            </Button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
