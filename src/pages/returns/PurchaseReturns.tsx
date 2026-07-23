import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, RotateCcw, Search } from 'lucide-react';
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
import type { Purchase, PurchaseItem, PurchaseReturnLine, PurchaseReturnRecord } from '../../types';
import { formatCurrency } from '../../utils/currency';

type DraftLine = { quantity: number; reason: PurchaseReturnLine['reason'] };

export default function PurchaseReturns() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const requestIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [returns, setReturns] = useState<PurchaseReturnRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [draft, setDraft] = useState<Record<string, DraftLine>>({});

  const load = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    try {
      const [purchaseRows, returnRows] = await Promise.all([
        purchaseService.getPurchases(user.tenantId),
        purchaseReturnService.listReturns(user.tenantId),
      ]);
      setPurchases(purchaseRows.filter(row => row.status !== 'cancelled' && row.supplierLedgerTracked === true));
      setReturns(returnRows);
    } catch (error: any) {
      showToast(error.message || 'Purchase returns could not be loaded.', 'danger');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [user?.tenantId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return purchases;
    return purchases.filter(row =>
      row.purchaseNumber.toLowerCase().includes(term) ||
      row.invoiceNumber.toLowerCase().includes(term) ||
      row.supplierName.toLowerCase().includes(term)
    );
  }, [purchases, search]);

  const selectPurchase = async (purchase: Purchase) => {
    if (!user?.tenantId) return;
    const rows = await purchaseService.getPurchaseItems(user.tenantId, purchase.id);
    setSelected(purchase);
    setItems(rows);
    setDraft({});
    requestIdRef.current = null;
  };

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
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
        <PageHeader title="Purchase Returns" description="Return stock against its original supplier bill and exact batch." breadcrumbs={[{ label: 'Purchases' }, { label: 'Purchase Returns' }]} actions={<Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>} />
        <Card className="overflow-hidden">
          <div className="border-b border-border p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/40" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search original purchase, supplier or invoice" className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-4 text-sm outline-none focus:border-primary" /></div></div>
          {loading ? <SkeletonTable rows={6} /> : filtered.length === 0 ? <EmptyState icon={<RotateCcw className="h-12 w-12" />} title="No returnable purchases" description="Posted purchases linked to supplier ledgers will appear here." /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-background text-xs uppercase text-text/55"><tr><th className="px-4 py-3 text-left">Purchase</th><th className="px-4 py-3 text-left">Supplier</th><th className="px-4 py-3 text-left">Supplier Invoice</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Returned</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-border">{filtered.map(row => <tr key={row.id} className={selected?.id === row.id ? 'bg-primary/5' : ''}><td className="px-4 py-3 font-mono font-bold text-primary">{row.purchaseNumber}</td><td className="px-4 py-3 font-semibold">{row.supplierName}</td><td className="px-4 py-3">{row.invoiceNumber}</td><td className="px-4 py-3 text-right">{formatCurrency(row.totalAmount)}</td><td className="px-4 py-3 text-right">{formatCurrency(row.returnAmount || 0)}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => selectPurchase(row)}>Select</Button></td></tr>)}</tbody></table></div>
          )}
        </Card>
        {selected && (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><div className="font-bold">{selected.purchaseNumber} · {selected.supplierName}</div><div className="text-xs text-text/55">Only current stock from the original batch can be returned.</div></div><Button onClick={submit} disabled={saving}>{saving ? 'Posting…' : 'Post Purchase Return'}</Button></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-background text-xs uppercase text-text/55"><tr><th className="px-4 py-3 text-left">Product</th><th className="px-4 py-3 text-left">Batch</th><th className="px-4 py-3 text-right">Purchased</th><th className="px-4 py-3 text-right">Line Total</th><th className="px-4 py-3 text-left">Return Qty</th><th className="px-4 py-3 text-left">Reason</th></tr></thead><tbody className="divide-y divide-border">{items.map(item => <tr key={item.id}><td className="px-4 py-3 font-semibold">{item.productName}</td><td className="px-4 py-3 font-mono">{item.batchNumber}</td><td className="px-4 py-3 text-right">{item.quantity}</td><td className="px-4 py-3 text-right">{formatCurrency(item.total)}</td><td className="px-4 py-3"><input type="number" min="0" max={item.quantity} step="1" value={draft[item.id]?.quantity || ''} onChange={event => setLine(item.id, { quantity: Number(event.target.value) })} className="h-10 w-28 rounded-lg border border-border bg-surface px-3" /></td><td className="px-4 py-3"><select value={draft[item.id]?.reason || 'other'} onChange={event => setLine(item.id, { reason: event.target.value as PurchaseReturnLine['reason'] })} className="h-10 min-w-44 rounded-lg border border-border bg-surface px-3"><option value="expired">Expired</option><option value="near_expiry">Near expiry</option><option value="damaged">Damaged</option><option value="wrong_item">Wrong item</option><option value="excess_stock">Excess stock</option><option value="rate_difference">Rate difference</option><option value="other">Other</option></select></td></tr>)}</tbody></table></div>
          </Card>
        )}
        <Card className="overflow-hidden"><div className="border-b border-border p-4 font-bold">Recent Purchase Returns</div>{returns.length === 0 ? <div className="p-8 text-center text-sm text-text/50">No purchase returns posted yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="bg-background text-xs uppercase text-text/55"><tr><th className="px-4 py-3 text-left">Return</th><th className="px-4 py-3 text-left">Supplier</th><th className="px-4 py-3 text-left">Purchase</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Credit</th></tr></thead><tbody className="divide-y divide-border">{returns.slice(0, 50).map(row => <tr key={row.id}><td className="px-4 py-3 font-mono font-semibold">{row.returnNumber}</td><td className="px-4 py-3">{row.supplierName}</td><td className="px-4 py-3">{row.purchaseNumber}</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(row.totalAmount)}</td><td className="px-4 py-3 text-right">{formatCurrency(row.supplierCredit)}</td></tr>)}</tbody></table></div>}</Card>
      </div>
    </PageTransition>
  );
}
