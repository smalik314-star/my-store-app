import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Banknote, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { PageTransition } from '../../components/common/PageTransition';
import { SkeletonTable } from '../../components/common/Skeleton';
import { PageHeader } from '../../components/erp/PageHeader';
import { SearchInput } from '../../components/erp/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { invoiceService } from '../../services/invoiceService';
import { receiptService } from '../../services/receiptService';
import type { Invoice, ReceiptRecord } from '../../types';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { toJsDate } from '../../utils/date';
import { matchesSearchQuery } from '../../utils/search';

export default function Receipts() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const requestIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
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
    setLoadError('');
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
      const message = error.message || 'Receipts could not be loaded.';
      setLoadError(message);
      showToast(message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const selectedInvoice = invoices.find(invoice => invoice.id === selectedInvoiceId);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice =>
      matchesSearchQuery(search, invoice.invoiceNumber, invoice.customerName)
    );
  }, [invoices, search]);

  const selectInvoice = (invoice: Invoice) => {
    setSelectedInvoiceId(invoice.id);
    setAmount(String(invoice.outstandingAmount || 0));
    requestIdRef.current = null;
    window.requestAnimationFrame(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    });
  };

  useEffect(() => {
    void load();
  }, [user?.tenantId]);

  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === 'F2' && selectedInvoice && !savingRef.current) {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [selectedInvoice]);

  const recordReceipt = async () => {
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await recordReceipt();
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
        <PageHeader
          title="Customer Receipts"
          description="Allocate customer payments against outstanding sales invoices with an auditable ledger entry."
          breadcrumbs={[{ label: 'Accounting' }, { label: 'Receipts' }]}
          actions={
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-4">
              <SearchInput
                ref={searchInputRef}
                value={search}
                onChange={setSearch}
                placeholder="Search customer or invoice number"
                aria-label="Search outstanding invoices"
                onKeyDown={event => {
                  if (event.key === 'Enter' && filteredInvoices[0]) {
                    event.preventDefault();
                    selectInvoice(filteredInvoices[0]);
                  }
                }}
              />
              <p className="mt-3 text-xs font-semibold text-text/45">
                Ctrl+F focuses search. Enter selects the first invoice. F2 records the current receipt.
              </p>
            </div>

            {loading ? (
              <SkeletonTable rows={7} />
            ) : loadError ? (
              <div className="p-6 text-center">
                <AlertCircle className="mx-auto h-10 w-10 text-danger" />
                <p className="mt-3 text-sm text-danger">{loadError}</p>
                <Button variant="outline" className="mt-4" onClick={() => void load()}>
                  Retry
                </Button>
              </div>
            ) : filteredInvoices.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-12 w-12" />}
                title="No outstanding invoices"
                description={search ? 'No outstanding invoice matches this search.' : 'All registered-customer invoices are fully paid.'}
              />
            ) : (
              <>
                <div className="divide-y divide-border md:hidden">
                  {filteredInvoices.map(invoice => (
                    <button
                      key={invoice.id}
                      type="button"
                      onClick={() => selectInvoice(invoice)}
                      className={`w-full p-4 text-left transition ${
                        selectedInvoiceId === invoice.id ? 'bg-primary/5' : 'hover:bg-text/[0.02]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-mono font-bold text-primary">{invoice.invoiceNumber}</div>
                          <div className="mt-1 font-semibold">{invoice.customerName}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">{formatCurrency(invoice.grandTotal)}</div>
                          <div className="text-xs font-semibold text-danger">
                            Due {formatCurrency(invoice.outstandingAmount || 0)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-text/55">
                        {toJsDate(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN')}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
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
                            <Button
                              size="sm"
                              variant={selectedInvoiceId === invoice.id ? 'secondary' : 'outline'}
                              onClick={() => selectInvoice(invoice)}
                            >
                              Select
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <form ref={formRef} onSubmit={submit}>
            <Card className="sticky top-24 space-y-5 p-5">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold">
                  <Banknote className="h-5 w-5 text-primary" /> Record Receipt
                </div>
                <p className="mt-1 text-xs text-text/55">
                  Payment posts only after the Firestore transaction succeeds.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3 text-sm">
                {selectedInvoice ? (
                  <>
                    <div className="font-bold">{selectedInvoice.customerName}</div>
                    <div className="mt-1 flex justify-between text-text/60">
                      <span>{selectedInvoice.invoiceNumber}</span>
                      <span>{formatCurrency(selectedInvoice.outstandingAmount || 0)} due</span>
                    </div>
                  </>
                ) : (
                  <span className="text-text/50">Select an outstanding invoice.</span>
                )}
              </div>
              <label className="block text-sm font-semibold">
                Amount (₹)
                <input
                  ref={amountInputRef}
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
                <select
                  value={paymentMethod}
                  onChange={event => setPaymentMethod(event.target.value as ReceiptRecord['paymentMethod'])}
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="credit">Other / Adjustment</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Notes
                <textarea
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                  className="mt-2 min-h-20 w-full rounded-xl border border-border bg-surface p-3"
                />
              </label>
              <Button type="submit" className="w-full" disabled={!selectedInvoice || saving}>
                {saving ? 'Recording…' : 'Record Receipt'}
              </Button>
            </Card>
          </form>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-border p-4 font-bold">Recent Receipts</div>
          {receipts.length === 0 ? (
            <div className="p-8 text-center text-sm text-text/50">No receipts recorded yet.</div>
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {receipts.slice(0, 20).map(receipt => (
                  <div key={receipt.id} className="p-4">
                    <div className="flex justify-between gap-3">
                      <span className="font-mono font-semibold text-primary">{receipt.receiptNumber}</span>
                      <span className="font-bold">{formatCurrency(receipt.amount)}</span>
                    </div>
                    <div className="mt-1 font-semibold">{receipt.customerName}</div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text/50">
                      <span>{receipt.invoiceNumber}</span>
                      <span className="uppercase">{receipt.paymentMethod}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-background text-xs uppercase text-text/55">
                    <tr>
                      <th className="px-4 py-3 text-left">Receipt</th>
                      <th className="px-4 py-3 text-left">Customer</th>
                      <th className="px-4 py-3 text-left">Invoice</th>
                      <th className="px-4 py-3 text-left">Mode</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {receipts.slice(0, 50).map(receipt => (
                      <tr key={receipt.id}>
                        <td className="px-4 py-3 font-mono font-semibold">{receipt.receiptNumber}</td>
                        <td className="px-4 py-3">{receipt.customerName}</td>
                        <td className="px-4 py-3">{receipt.invoiceNumber}</td>
                        <td className="px-4 py-3 uppercase">{receipt.paymentMethod}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(receipt.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </PageTransition>
  );
}
