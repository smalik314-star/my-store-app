import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
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
import type { Invoice } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { toJsDate } from '../../utils/date';

interface ReturnDraft {
  quantity: number;
  disposition: 'resellable' | 'damaged';
  reason: string;
}

export default function SaleReturns() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const requestIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<number, ReturnDraft>>({});

  const load = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    try {
      const result = await invoiceService.getInvoicesPaginated(user.tenantId, 200);
      setInvoices((result?.invoices || []).filter(invoice => invoice.status !== 'cancelled' && !invoice.isQuickBill));
    } catch (error: any) {
      showToast(error.message || 'Sales invoices could not be loaded.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.tenantId]);

  const selected = invoices.find(invoice => invoice.id === selectedId);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter(invoice =>
      invoice.invoiceNumber.toLowerCase().includes(term) ||
      invoice.customerName.toLowerCase().includes(term)
    );
  }, [invoices, search]);

  const selectInvoice = (invoice: Invoice) => {
    setSelectedId(invoice.id);
    setDrafts({});
    requestIdRef.current = null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.tenantId || !selected || savingRef.current) return;
    const lines = Object.entries(drafts)
      .map(([lineIndex, draft]) => ({ lineIndex: Number(lineIndex), ...draft }))
      .filter(line => line.quantity > 0);
    if (!lines.length) {
      showToast('Enter at least one return quantity.', 'danger');
      return;
    }
    savingRef.current = true;
    requestIdRef.current ||= crypto.randomUUID();
    setSaving(true);
    try {
      const record = await saleReturnService.create(user.tenantId, {
        requestId: requestIdRef.current,
        invoiceId: selected.id,
        lines,
      });
      showToast(`${record.returnNumber} posted successfully.`, 'success');
      requestIdRef.current = null;
      setSelectedId('');
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
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
        <PageHeader
          title="Sale Returns"
          description="Return against the original invoice. Resellable stock restores exact sold batches; damaged items remain outside saleable stock."
          breadcrumbs={[{ label: 'Sales' }, { label: 'Sale Returns' }]}
        />
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/40" />
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Invoice or customer" className="h-11 w-full rounded-xl border border-border pl-10 pr-3 outline-none focus:border-primary" />
              </div>
            </div>
            {loading ? <SkeletonTable rows={7} /> : filtered.length === 0 ? (
              <EmptyState icon={<RotateCcw className="h-12 w-12" />} title="No invoices found" description="Posted stock invoices will appear here." />
            ) : (
              <div className="max-h-[650px] divide-y divide-border overflow-y-auto">
                {filtered.map(invoice => (
                  <button key={invoice.id} onClick={() => selectInvoice(invoice)} className={`w-full p-4 text-left hover:bg-text/[0.02] ${selectedId === invoice.id ? 'bg-primary/5' : ''}`}>
                    <div className="flex justify-between gap-3"><span className="font-mono font-bold text-primary">{invoice.invoiceNumber}</span><span className="font-bold">{formatCurrency(invoice.grandTotal)}</span></div>
                    <div className="mt-1 text-sm font-semibold">{invoice.customerName}</div>
                    <div className="mt-1 text-xs text-text/50">{toJsDate(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN')} · Returned {formatCurrency(invoice.returnedAmount || 0)}</div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <form onSubmit={submit}>
            <Card className="overflow-hidden">
              {!selected ? (
                <EmptyState icon={<RotateCcw className="h-12 w-12" />} title="Select an invoice" description="Choose the original sale invoice to view returnable lines." />
              ) : (
                <>
                  <div className="border-b border-border p-5">
                    <div className="text-lg font-bold">{selected.invoiceNumber} · {selected.customerName}</div>
                    <p className="mt-1 text-xs text-text/55">Only quantities not previously returned can be posted. The transaction revalidates this on save.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-sm">
                      <thead className="bg-background text-xs uppercase text-text/55">
                        <tr><th className="px-4 py-3 text-left">Product</th><th className="px-4 py-3 text-left">Sold batches</th><th className="px-4 py-3 text-right">Sold</th><th className="px-4 py-3 text-right">Return qty</th><th className="px-4 py-3 text-left">Disposition</th><th className="px-4 py-3 text-left">Reason</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selected.items.map((item, index) => {
                          const draft = drafts[index] || { quantity: 0, disposition: 'resellable', reason: 'Customer return' };
                          return (
                            <tr key={`${item.productId}-${index}`}>
                              <td className="px-4 py-3"><div className="font-semibold">{item.name}</div><div className="text-xs text-text/50">{formatCurrency(item.total)}</div></td>
                              <td className="px-4 py-3 text-xs">{item.batchDeductions?.map(batch => `${batch.batchNumber} (${batch.quantity})`).join(', ') || 'No provenance'}</td>
                              <td className="px-4 py-3 text-right font-bold">{item.quantity}</td>
                              <td className="px-4 py-3 text-right"><input type="number" min="0" max={item.quantity} step="1" value={draft.quantity} onChange={event => setDrafts(current => ({ ...current, [index]: { ...draft, quantity: Number(event.target.value) } }))} className="h-10 w-24 rounded-lg border border-border px-3 text-right" /></td>
                              <td className="px-4 py-3"><select value={draft.disposition} onChange={event => setDrafts(current => ({ ...current, [index]: { ...draft, disposition: event.target.value as ReturnDraft['disposition'] } }))} className="h-10 rounded-lg border border-border px-2"><option value="resellable">Resellable</option><option value="damaged">Damaged</option></select></td>
                              <td className="px-4 py-3"><input value={draft.reason} onChange={event => setDrafts(current => ({ ...current, [index]: { ...draft, reason: event.target.value } }))} className="h-10 w-full min-w-40 rounded-lg border border-border px-3" /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end border-t border-border p-4"><Button type="submit" disabled={saving}>{saving ? 'Posting return…' : 'Post Sale Return'}</Button></div>
                </>
              )}
            </Card>
          </form>
        </div>
      </div>
    </PageTransition>
  );
}
