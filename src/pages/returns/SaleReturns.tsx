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
import { invoiceService } from '../../services/invoiceService';
import { saleReturnService } from '../../services/saleReturnService';
import type { Invoice, InvoiceItem, SaleReturnRecord } from '../../types';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { toJsDate } from '../../utils/date';
import { isBatchExpired } from '../../utils/stock';
import { matchesSearchQuery } from '../../utils/search';

interface ReturnDraft {
  quantity: number;
  disposition: 'resellable' | 'damaged';
  reason: string;
}

const emptyDraft = (): ReturnDraft => ({
  quantity: 0,
  disposition: 'resellable',
  reason: 'Customer return',
});

export default function SaleReturns() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const requestIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [returns, setReturns] = useState<SaleReturnRecord[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [returnedByLine, setReturnedByLine] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<number, ReturnDraft>>({});

  const load = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    setLoadError('');
    try {
      const [invoiceResult, returnRows] = await Promise.all([
        invoiceService.getInvoicesPaginated(user.tenantId, 200),
        saleReturnService.list(user.tenantId),
      ]);
      setInvoices(
        (invoiceResult?.invoices || []).filter(invoice =>
          invoice.status !== 'cancelled'
          && !invoice.isQuickBill
          && roundMoney(invoice.returnedAmount || 0) < roundMoney(invoice.grandTotal)
        )
      );
      setReturns(returnRows);
    } catch (error: any) {
      const message = error.message || 'Sales invoices could not be loaded.';
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
    return invoices.filter(invoice =>
      matchesSearchQuery(search, invoice.invoiceNumber, invoice.customerName)
      || invoice.items.some(item => matchesSearchQuery(search, item.name))
    );
  }, [invoices, search]);

  const selectInvoice = async (invoice: Invoice) => {
    if (!user?.tenantId) return;
    setSelectedLoading(true);
    try {
      const returned = await saleReturnService.getReturnedQuantities(user.tenantId, invoice.id);
      setSelected(invoice);
      setReturnedByLine(returned);
      setDrafts({});
      requestIdRef.current = null;
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLInputElement>('[data-sale-return-qty]')?.focus();
      });
    } catch (error: any) {
      showToast(error.message || 'Returnable quantities could not be loaded.', 'danger');
    } finally {
      setSelectedLoading(false);
    }
  };

  const returnableQuantity = (lineIndex: number, item: InvoiceItem) =>
    Math.max(0, Number(item.quantity) - (Number(returnedByLine[String(lineIndex)]) || 0));

  const lineHasExpiredBatch = (item: InvoiceItem) =>
    Boolean(item.batchDeductions?.some(batch => batch.expiryDate && isBatchExpired(batch.expiryDate)));

  const setLine = (lineIndex: number, patch: Partial<ReturnDraft>) => {
    setDrafts(current => ({
      ...current,
      [lineIndex]: { ...(current[lineIndex] || emptyDraft()), ...patch },
    }));
    requestIdRef.current = null;
  };

  const focusNextReturnQuantity = (currentIndex: number) => {
    if (!selected) return;
    for (let index = currentIndex + 1; index < selected.items.length; index += 1) {
      const nextItem = selected.items[index];
      if (returnableQuantity(index, nextItem) > 0) {
        window.requestAnimationFrame(() => {
          document
            .querySelector<HTMLInputElement>(`[data-sale-return-qty="${index}"]`)
            ?.focus();
        });
        return;
      }
    }
  };

  const previewTotal = useMemo(() => {
    if (!selected) return 0;
    return roundMoney(selected.items.reduce((sum, item, index) => {
      const quantity = Number(drafts[index]?.quantity) || 0;
      if (quantity <= 0 || Number(item.quantity) <= 0) return sum;
      return sum + (roundMoney(item.total) / Number(item.quantity)) * quantity;
    }, 0));
  }, [drafts, selected]);

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
    const lines = selected.items
      .map((item, lineIndex) => ({ item, lineIndex, ...(drafts[lineIndex] || emptyDraft()) }))
      .filter(line => line.quantity > 0);
    if (lines.length === 0) {
      showToast('Enter at least one return quantity.', 'danger');
      return;
    }
    const invalid = lines.find(line =>
      !Number.isInteger(line.quantity)
      || line.quantity > returnableQuantity(line.lineIndex, line.item)
    );
    if (invalid) {
      showToast(
        `${invalid.item.name}: maximum returnable quantity is ${returnableQuantity(invalid.lineIndex, invalid.item)}.`,
        'danger'
      );
      return;
    }
    const unsafeExpired = lines.find(line =>
      line.disposition === 'resellable' && lineHasExpiredBatch(line.item)
    );
    if (unsafeExpired) {
      showToast(
        `${unsafeExpired.item.name} contains an expired sold batch. Choose damaged/non-resellable.`,
        'danger'
      );
      return;
    }

    savingRef.current = true;
    requestIdRef.current ||= crypto.randomUUID();
    setSaving(true);
    try {
      const record = await saleReturnService.create(user.tenantId, {
        requestId: requestIdRef.current,
        invoiceId: selected.id,
        lines: lines.map(({ lineIndex, quantity, disposition, reason }) => ({
          lineIndex,
          quantity,
          disposition,
          reason,
        })),
      });
      showToast(`${record.returnNumber} posted successfully.`, 'success');
      requestIdRef.current = null;
      setSelected(null);
      setReturnedByLine({});
      setDrafts({});
      await load();
    } catch (error: any) {
      showToast(error.message || 'Sale return could not be posted.', 'danger');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 pb-28 sm:space-y-6 md:p-8 md:pb-8">
        <PageHeader
          title="Sale Returns"
          description="Return against the original invoice and restore only the exact valid sold batch."
          breadcrumbs={[{ label: 'Sales' }, { label: 'Sale Returns' }]}
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
                      void selectInvoice(filtered[0]);
                    }
                  }}
                  placeholder="Invoice, customer or product"
                  aria-label="Search returnable invoices"
                  className="h-12 w-full rounded-xl border border-border bg-surface pl-10 pr-4 text-sm outline-none focus:border-primary"
                />
              </div>
              <p className="mt-3 text-xs font-semibold text-text/45">
                Ctrl+F focuses search. Enter opens the first result. F2 posts the current sale return.
              </p>
            </div>
            {loading ? (
              <SkeletonTable rows={6} />
            ) : loadError ? (
              <div className="p-6 text-center">
                <AlertCircle className="mx-auto h-10 w-10 text-danger" />
                <p className="mt-3 text-sm text-danger">{loadError}</p>
                <Button variant="outline" className="mt-4" onClick={load}>Retry</Button>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<RotateCcw className="h-12 w-12" />}
                title="No returnable invoices"
                description="Posted stock invoices with returnable items will appear here."
              />
            ) : (
              <div className="max-h-[640px] divide-y divide-border overflow-y-auto">
                {filtered.map(invoice => (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => selectInvoice(invoice)}
                    disabled={selectedLoading}
                    className={`min-h-24 w-full p-4 text-left transition hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                      selected?.id === invoice.id ? 'bg-primary/[0.07]' : ''
                    }`}
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-mono font-bold text-primary">{invoice.invoiceNumber}</span>
                      <span className="font-bold">{formatCurrency(invoice.grandTotal)}</span>
                    </div>
                    <div className="mt-1 font-semibold">{invoice.customerName}</div>
                    <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-text/50">
                      <span>{toJsDate(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN')}</span>
                      <span>Returned {formatCurrency(invoice.returnedAmount || 0)}</span>
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
                title="Select an invoice"
                description="Choose the original sale invoice to view exact remaining quantities."
              />
            ) : (
              <>
                <div className="border-b border-border p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-mono text-lg font-bold text-primary">{selected.invoiceNumber}</h2>
                      <p className="mt-1 font-semibold">{selected.customerName}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase text-text/45">Return preview</div>
                      <div className="text-xl font-bold">{formatCurrency(previewTotal)}</div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-text/55">
                    Resellable items restore stock. Damaged or expired items remain outside saleable stock.
                  </p>
                </div>

                <div className="space-y-3 p-3 md:hidden">
                  {selected.items.map((item, index) => {
                    const draft = drafts[index] || emptyDraft();
                    const returned = Number(returnedByLine[String(index)]) || 0;
                    const returnable = returnableQuantity(index, item);
                    const expired = lineHasExpiredBatch(item);
                    return (
                      <div key={`${item.productId}-${index}`} className="rounded-xl border border-border bg-background/30 p-4">
                        <div className="flex justify-between gap-3">
                          <div>
                            <div className="font-semibold">{item.name}</div>
                            <div className="mt-1 text-xs text-text/50">
                              Sold {item.quantity} - Returned {returned} - Returnable {returnable}
                            </div>
                          </div>
                          <span className="font-bold">{formatCurrency(item.total)}</span>
                        </div>
                        <div className="mt-2 text-xs text-text/55">
                          Batches: {item.batchDeductions?.map(batch => `${batch.batchNumber} (${batch.quantity})`).join(', ') || 'No provenance'}
                        </div>
                        {expired && (
                          <div className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
                            Expired batch: only damaged/non-resellable return is allowed.
                          </div>
                        )}
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <label className="text-xs font-semibold text-text/60">
                            Return quantity
                            <input
                              data-sale-return-qty={index}
                              type="number"
                              min="0"
                              max={returnable}
                              step="1"
                              value={draft.quantity}
                              onChange={event => setLine(index, { quantity: Number(event.target.value) })}
                              onKeyDown={event => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  focusNextReturnQuantity(index);
                                }
                              }}
                              className="mt-1 h-12 w-full rounded-lg border border-border bg-surface px-3 text-right text-base"
                            />
                          </label>
                          <label className="text-xs font-semibold text-text/60">
                            Disposition
                            <select
                              value={draft.disposition}
                              onChange={event => setLine(index, { disposition: event.target.value as ReturnDraft['disposition'] })}
                              className="mt-1 h-12 w-full rounded-lg border border-border bg-surface px-2"
                            >
                              <option value="resellable" disabled={expired}>Resellable</option>
                              <option value="damaged">Damaged / non-resellable</option>
                            </select>
                          </label>
                        </div>
                        <label className="mt-3 block text-xs font-semibold text-text/60">
                          Reason
                          <input
                            value={draft.reason}
                            onChange={event => setLine(index, { reason: event.target.value })}
                            className="mt-1 h-12 w-full rounded-lg border border-border bg-surface px-3"
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-background text-xs uppercase text-text/55">
                      <tr>
                        <th className="px-4 py-3 text-left">Product</th>
                        <th className="px-4 py-3 text-left">Sold batches</th>
                        <th className="px-4 py-3 text-right">Sold / returned</th>
                        <th className="px-4 py-3 text-right">Return qty</th>
                        <th className="px-4 py-3 text-left">Disposition</th>
                        <th className="px-4 py-3 text-left">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selected.items.map((item, index) => {
                        const draft = drafts[index] || emptyDraft();
                        const returned = Number(returnedByLine[String(index)]) || 0;
                        const returnable = returnableQuantity(index, item);
                        const expired = lineHasExpiredBatch(item);
                        return (
                          <tr key={`${item.productId}-${index}`}>
                            <td className="px-4 py-3">
                              <div className="font-semibold">{item.name}</div>
                              <div className="text-xs text-text/50">{formatCurrency(item.total)}</div>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {item.batchDeductions?.map(batch => `${batch.batchNumber} (${batch.quantity})`).join(', ') || 'No provenance'}
                              {expired && <div className="mt-1 font-semibold text-danger">Expired: non-resellable only</div>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="font-bold">{item.quantity} / {returned}</div>
                              <div className="text-xs text-text/45">{returnable} remaining</div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                data-sale-return-qty={index}
                                type="number"
                                min="0"
                                max={returnable}
                                step="1"
                                value={draft.quantity}
                                onChange={event => setLine(index, { quantity: Number(event.target.value) })}
                                onKeyDown={event => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    focusNextReturnQuantity(index);
                                  }
                                }}
                                className="h-10 w-24 rounded-lg border border-border bg-surface px-3 text-right"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={draft.disposition}
                                onChange={event => setLine(index, { disposition: event.target.value as ReturnDraft['disposition'] })}
                                className="h-10 rounded-lg border border-border bg-surface px-2"
                              >
                                <option value="resellable" disabled={expired}>Resellable</option>
                                <option value="damaged">Damaged / non-resellable</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                value={draft.reason}
                                onChange={event => setLine(index, { reason: event.target.value })}
                                className="h-10 w-full min-w-44 rounded-lg border border-border bg-surface px-3"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="hidden justify-end border-t border-border p-4 md:flex">
                  <Button onClick={submit} disabled={saving || previewTotal <= 0}>
                    {saving ? 'Posting return…' : `Post Return - ${formatCurrency(previewTotal)}`}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-border p-4 sm:p-5">
            <h2 className="font-bold">Recent Sale Returns</h2>
            <p className="mt-1 text-xs text-text/50">Posted returns are immutable and linked to their original invoices.</p>
          </div>
          {returns.length === 0 ? (
            <EmptyState
              icon={<RotateCcw className="h-10 w-10" />}
              title="No sale returns yet"
              description="Posted return transactions will appear here."
            />
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {returns.slice(0, 20).map(row => (
                  <div key={row.id} className="p-4">
                    <div className="flex justify-between gap-3">
                      <span className="font-mono font-bold text-primary">{row.returnNumber}</span>
                      <span className="font-bold">{formatCurrency(row.totalAmount)}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold">{row.customerName}</div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text/50">
                      <span>{row.invoiceNumber}</span>
                      <span>Outstanding adjusted {formatCurrency(row.outstandingAdjusted)}</span>
                      <span>Credit {formatCurrency(row.customerCredit)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-background text-xs uppercase text-text/55">
                    <tr>
                      <th className="px-4 py-3 text-left">Return</th>
                      <th className="px-4 py-3 text-left">Invoice</th>
                      <th className="px-4 py-3 text-left">Customer</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Outstanding adjusted</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {returns.slice(0, 50).map(row => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 font-mono font-bold text-primary">{row.returnNumber}</td>
                        <td className="px-4 py-3">{row.invoiceNumber}</td>
                        <td className="px-4 py-3 font-semibold">{row.customerName}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(row.totalAmount)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(row.outstandingAdjusted)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(row.customerCredit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {selected && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 shadow-2xl backdrop-blur md:hidden">
            <Button className="h-12 w-full" onClick={submit} disabled={saving || previewTotal <= 0}>
              {saving ? 'Posting return…' : `Post Return - ${formatCurrency(previewTotal)}`}
            </Button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
