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
import { invoiceService } from '../../services/invoiceService';
import { receiptService } from '../../services/receiptService';
import type { Invoice, ReceiptRecord } from '../../types';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { toJsDate } from '../../utils/date';

export default function Receipts() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const requestIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ReceiptRecord['paymentMethod']>('cash');
  const [notes, setNotes] = useState('');

  const load = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    try {
      const [invoiceResult, receiptRows] = await Promise.all([
        invoiceService.getInvoicesPaginated(user.tenantId, 200),
        receiptService.listReceipts(user.tenantId),
      ]);
      setInvoices((invoiceResult?.invoices || []).filter(invoice =>
        invoice.status !== 'cancelled' &&
        invoice.customerId !== 'walk-in' &&
        (Number(invoice.outstandingAmount) || 0) > 0
      ));
      setReceipts(receiptRows);
    } catch (error: any) {
      showToast(error.message || 'Receipts could not be loaded.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.tenantId]);

  const selectedInvoice = invoices.find(invoice => invoice.id === selectedInvoiceId);
  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter(invoice =>
      invoice.invoiceNumber.toLowerCase().includes(term) ||
      invoice.customerName.toLowerCase().includes(term)
    );
  }, [invoices, search]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.tenantId || !selectedInvoice || savingRef.current) return;
    const receiptAmount = roundMoney(Number(amount));
    if (!Number.isFinite(receiptAmount) || receiptAmount <= 0) {
      showToast('Enter a receipt amount greater than zero.', 'danger');
      return;
    }
    savingRef.current = true;
    requestIdRef.current ||= crypto.randomUUID();
    setSaving(true);
    try {
      const receipt = await receiptService.recordReceipt(user.tenantId, {
        requestId: requestIdRef.current,
        invoiceId: selectedInvoice.id,
        amount: receiptAmount,
        paymentMethod,
        notes,
      });
      showToast(`${receipt.receiptNumber} recorded successfully.`, 'success');
      requestIdRef.current = null;
      setSelectedInvoiceId('');
      setAmount('');
      setNotes('');
      await load();
    } catch (error: any) {
      showToast(error.message || 'Receipt could not be recorded.', 'danger');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
        <PageHeader
          title="Customer Receipts"
          description="Allocate customer payments against outstanding sales invoices with an auditable ledger entry."
          breadcrumbs={[{ label: 'Accounting' }, { label: 'Receipts' }]}
          actions={
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/40" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search customer or invoice number"
                  className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-4 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            {loading ? <SkeletonTable rows={7} /> : filteredInvoices.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-12 w-12" />}
                title="No outstanding invoices"
                description={search ? 'No outstanding invoice matches this search.' : 'All registered-customer invoices are fully paid.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="sticky top-0 bg-background text-xs uppercase text-text/55">
                    <tr>
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Outstanding</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredInvoices.map(invoice => (
                      <tr key={invoice.id} className={selectedInvoiceId === invoice.id ? 'bg-primary/5' : 'hover:bg-text/[0.02]'}>
                        <td className="px-4 py-3 font-mono font-bold text-primary">{invoice.invoiceNumber}</td>
                        <td className="px-4 py-3 font-semibold">{invoice.customerName}</td>
                        <td className="px-4 py-3 text-text/60">{toJsDate(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN')}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(invoice.grandTotal)}</td>
                        <td className="px-4 py-3 text-right font-bold text-danger">{formatCurrency(invoice.outstandingAmount || 0)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant={selectedInvoiceId === invoice.id ? 'secondary' : 'outline'} onClick={() => {
                            setSelectedInvoiceId(invoice.id);
                            setAmount(String(invoice.outstandingAmount || 0));
                            requestIdRef.current = null;
                          }}>
                            Select
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <form onSubmit={submit}>
            <Card className="sticky top-24 space-y-5 p-5">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold"><Banknote className="h-5 w-5 text-primary" /> Record Receipt</div>
                <p className="mt-1 text-xs text-text/55">Payment posts only after the Firestore transaction succeeds.</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3 text-sm">
                {selectedInvoice ? (
                  <>
                    <div className="font-bold">{selectedInvoice.customerName}</div>
                    <div className="mt-1 flex justify-between text-text/60"><span>{selectedInvoice.invoiceNumber}</span><span>{formatCurrency(selectedInvoice.outstandingAmount || 0)} due</span></div>
                  </>
                ) : <span className="text-text/50">Select an outstanding invoice.</span>}
              </div>
              <label className="block text-sm font-semibold">
                Amount (₹)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-primary"
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                Payment mode
                <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as ReceiptRecord['paymentMethod'])} className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3">
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="credit">Other / Adjustment</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Notes
                <textarea value={notes} onChange={event => setNotes(event.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-border bg-surface p-3" />
              </label>
              <Button type="submit" className="w-full" disabled={!selectedInvoice || saving}>
                {saving ? 'Recording…' : 'Record Receipt'}
              </Button>
            </Card>
          </form>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-border p-4 font-bold">Recent Receipts</div>
          {receipts.length === 0 ? <div className="p-8 text-center text-sm text-text/50">No receipts recorded yet.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-background text-xs uppercase text-text/55">
                  <tr><th className="px-4 py-3 text-left">Receipt</th><th className="px-4 py-3 text-left">Customer</th><th className="px-4 py-3 text-left">Invoice</th><th className="px-4 py-3 text-left">Mode</th><th className="px-4 py-3 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receipts.slice(0, 50).map(receipt => (
                    <tr key={receipt.id}><td className="px-4 py-3 font-mono font-semibold">{receipt.receiptNumber}</td><td className="px-4 py-3">{receipt.customerName}</td><td className="px-4 py-3">{receipt.invoiceNumber}</td><td className="px-4 py-3 uppercase">{receipt.paymentMethod}</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(receipt.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </PageTransition>
  );
}
