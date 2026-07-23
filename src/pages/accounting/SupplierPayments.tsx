import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { PageTransition } from '../../components/common/PageTransition';
import { SkeletonTable } from '../../components/common/Skeleton';
import { PageHeader } from '../../components/erp/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { purchaseService } from '../../services/purchaseService';
import { supplierPaymentService } from '../../services/supplierPaymentService';
import type { Purchase, SupplierPaymentRecord } from '../../types';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { toJsDate } from '../../utils/date';

export default function SupplierPayments() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const requestIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SupplierPaymentRecord['paymentMethod']>('bank');
  const [notes, setNotes] = useState('');

  const load = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    try {
      const [purchaseRows, paymentRows] = await Promise.all([
        purchaseService.getPurchases(user.tenantId),
        supplierPaymentService.listPayments(user.tenantId),
      ]);
      setPurchases(purchaseRows.filter(row =>
        row.status !== 'cancelled' &&
        row.supplierLedgerTracked === true &&
        (Number(row.payableAmount) || 0) > 0
      ));
      setPayments(paymentRows);
    } catch (error: any) {
      showToast(error.message || 'Supplier payments could not be loaded.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.tenantId]);

  const selected = purchases.find(row => row.id === selectedId);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return purchases;
    return purchases.filter(row =>
      row.purchaseNumber.toLowerCase().includes(term) ||
      row.invoiceNumber.toLowerCase().includes(term) ||
      row.supplierName.toLowerCase().includes(term)
    );
  }, [purchases, search]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.tenantId || !selected || savingRef.current) return;
    const value = roundMoney(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
      showToast('Enter a payment amount greater than zero.', 'danger');
      return;
    }
    savingRef.current = true;
    requestIdRef.current ||= crypto.randomUUID();
    setSaving(true);
    try {
      const payment = await supplierPaymentService.recordPayment(user.tenantId, {
        requestId: requestIdRef.current,
        purchaseId: selected.id,
        amount: value,
        paymentMethod,
        notes,
      });
      showToast(`${payment.paymentNumber} recorded successfully.`, 'success');
      requestIdRef.current = null;
      setSelectedId('');
      setAmount('');
      setNotes('');
      await load();
    } catch (error: any) {
      showToast(error.message || 'Supplier payment could not be recorded.', 'danger');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
        <PageHeader
          title="Supplier Payments"
          description="Allocate payments against posted supplier bills without changing stock."
          breadcrumbs={[{ label: 'Accounting' }, { label: 'Supplier Payments' }]}
          actions={<Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>}
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/40" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search supplier, purchase or invoice" className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-4 text-sm outline-none focus:border-primary" /></div>
            </div>
            {loading ? <SkeletonTable rows={7} /> : filtered.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-12 w-12" />} title="No linked payables" description={search ? 'No payable bill matches this search.' : 'New posted purchases with supplier ledger tracking will appear here.'} />
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 bg-background text-xs uppercase text-text/55"><tr><th className="px-4 py-3">Purchase</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Payable</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
                <tbody className="divide-y divide-border">{filtered.map(row => (
                  <tr key={row.id} className={selectedId === row.id ? 'bg-primary/5' : 'hover:bg-text/[0.02]'}>
                    <td className="px-4 py-3"><div className="font-mono font-bold text-primary">{row.purchaseNumber}</div><div className="text-xs text-text/50">{row.invoiceNumber}</div></td>
                    <td className="px-4 py-3 font-semibold">{row.supplierName}</td>
                    <td className="px-4 py-3 text-text/60">{toJsDate(row.invoiceDate || row.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(row.totalAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold text-danger">{formatCurrency(row.payableAmount || 0)}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant={selectedId === row.id ? 'secondary' : 'outline'} onClick={() => { setSelectedId(row.id); setAmount(String(row.payableAmount || 0)); requestIdRef.current = null; }}>Select</Button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
          <form onSubmit={submit}>
            <Card className="sticky top-24 space-y-5 p-5">
              <div><div className="flex items-center gap-2 text-lg font-bold"><Banknote className="h-5 w-5 text-primary" /> Record Payment</div><p className="mt-1 text-xs text-text/55">Payment and supplier payable update atomically.</p></div>
              <div className="rounded-xl border border-border bg-background p-3 text-sm">{selected ? <><div className="font-bold">{selected.supplierName}</div><div className="mt-1 flex justify-between text-text/60"><span>{selected.purchaseNumber}</span><span>{formatCurrency(selected.payableAmount || 0)} due</span></div></> : <span className="text-text/50">Select a payable purchase bill.</span>}</div>
              <label className="block text-sm font-semibold">Amount (₹)<input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-primary" required /></label>
              <label className="block text-sm font-semibold">Payment mode<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as SupplierPaymentRecord['paymentMethod'])} className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3"><option value="bank">Bank</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option></select></label>
              <label className="block text-sm font-semibold">Notes<textarea value={notes} onChange={event => setNotes(event.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-border bg-surface p-3" /></label>
              <Button type="submit" className="w-full" disabled={!selected || saving}>{saving ? 'Recording…' : 'Record Supplier Payment'}</Button>
            </Card>
          </form>
        </div>
        <Card className="overflow-hidden">
          <div className="border-b border-border p-4 font-bold">Recent Supplier Payments</div>
          {payments.length === 0 ? <div className="p-8 text-center text-sm text-text/50">No supplier payments recorded yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-background text-xs uppercase text-text/55"><tr><th className="px-4 py-3 text-left">Payment</th><th className="px-4 py-3 text-left">Supplier</th><th className="px-4 py-3 text-left">Purchase</th><th className="px-4 py-3 text-left">Mode</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-border">{payments.slice(0, 50).map(payment => <tr key={payment.id}><td className="px-4 py-3 font-mono font-semibold">{payment.paymentNumber}</td><td className="px-4 py-3">{payment.supplierName}</td><td className="px-4 py-3">{payment.purchaseNumber}</td><td className="px-4 py-3 uppercase">{payment.paymentMethod}</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(payment.amount)}</td></tr>)}</tbody></table></div>}
        </Card>
      </div>
    </PageTransition>
  );
}
