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
import { purchaseService } from '../../services/purchaseService';
import { supplierPaymentService } from '../../services/supplierPaymentService';
import type { Purchase, SupplierPaymentRecord } from '../../types';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { toJsDate } from '../../utils/date';

const isPayablePurchase = (purchase: Purchase) =>
  purchase.status !== 'cancelled'
  && purchase.supplierLedgerTracked === true
  && (Number(purchase.payableAmount) || 0) > 0;

export default function SupplierPayments() {
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
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentRecord[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [purchaseCursor, setPurchaseCursor] = useState<any>(null);
  const [paymentCursor, setPaymentCursor] = useState<any>(null);
  const [hasMorePurchases, setHasMorePurchases] = useState(false);
  const [hasMorePayments, setHasMorePayments] = useState(false);
  const [loadingMorePurchases, setLoadingMorePurchases] = useState(false);
  const [loadingMorePayments, setLoadingMorePayments] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SupplierPaymentRecord['paymentMethod']>('bank');
  const [notes, setNotes] = useState('');

  const selected = useMemo(
    () => purchases.find(row => row.id === selectedId) || null,
    [purchases, selectedId]
  );

  const loadPurchases = async (term: string, append: boolean = false) => {
    if (!user?.tenantId) return;
    const searching = term.trim().length >= 2;
    if (append) {
      setLoadingMorePurchases(true);
    } else {
      setLoading(true);
      setLoadError('');
    }
    try {
      if (searching) {
        const rows = await purchaseService.searchPurchases(user.tenantId, term, 20);
        setPurchases(rows.filter(isPayablePurchase));
        setPurchaseCursor(null);
        setHasMorePurchases(false);
        return;
      }
      const result = await purchaseService.getPurchasesPage(
        user.tenantId,
        20,
        append ? purchaseCursor : null
      );
      const nextRows = result.purchases.filter(isPayablePurchase);
      setPurchases(current => (append ? [...current, ...nextRows] : nextRows));
      setPurchaseCursor(result.lastDoc);
      setHasMorePurchases(Boolean(result.lastDoc));
    } catch (error: any) {
      const message = error.message || 'Supplier payments could not be loaded.';
      setLoadError(message);
      showToast(message, 'danger');
    } finally {
      setLoading(false);
      setLoadingMorePurchases(false);
    }
  };

  const loadPaymentHistory = async (append: boolean = false) => {
    if (!user?.tenantId) return;
    if (append) setLoadingMorePayments(true);
    try {
      const result = await supplierPaymentService.listPaymentsPage(
        user.tenantId,
        20,
        append ? paymentCursor : null
      );
      setPayments(current => (append ? [...current, ...result.payments] : result.payments));
      setPaymentCursor(result.lastDoc);
      setHasMorePayments(Boolean(result.lastDoc));
    } catch (error: any) {
      const message = error.message || 'Supplier payment history could not be loaded.';
      setLoadError(message);
      showToast(message, 'danger');
    } finally {
      setLoadingMorePayments(false);
    }
  };

  const load = async (term: string = search) => {
    await Promise.all([
      loadPurchases(term, false),
      loadPaymentHistory(false),
    ]);
  };

  const selectPurchase = (purchase: Purchase) => {
    setSelectedId(purchase.id);
    setAmount(String(purchase.payableAmount || 0));
    requestIdRef.current = null;
    window.requestAnimationFrame(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    });
  };

  useEffect(() => {
    void load('');
  }, [user?.tenantId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!user?.tenantId) return;
    void loadPurchases(search, false);
  }, [search, user?.tenantId]);

  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === 'F2' && selected && !savingRef.current) {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [selected]);

  const recordPayment = async () => {
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
      setSearchInput('');
      setSearch('');
      await load('');
    } catch (error: any) {
      showToast(error.message || 'Supplier payment could not be recorded.', 'danger');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await recordPayment();
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
        <PageHeader
          title="Supplier Payments"
          description="Allocate payments against posted supplier bills without changing stock."
          breadcrumbs={[{ label: 'Accounting' }, { label: 'Supplier Payments' }]}
          actions={
            <Button variant="outline" onClick={() => void load(search)} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-border p-4">
              <SearchInput
                ref={searchInputRef}
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Search supplier, purchase or invoice"
                aria-label="Search payable purchase bills"
                onKeyDown={event => {
                  if (event.key === 'Enter' && purchases[0]) {
                    event.preventDefault();
                    selectPurchase(purchases[0]);
                  }
                }}
              />
              <p className="mt-3 text-xs font-semibold text-text/45">
                Ctrl+F focuses search. Results stay paged. Enter selects the first bill. F2 records the current payment.
              </p>
            </div>

            {loading ? (
              <SkeletonTable rows={7} />
            ) : loadError ? (
              <div className="p-6 text-center">
                <AlertCircle className="mx-auto h-10 w-10 text-danger" />
                <p className="mt-3 text-sm text-danger">{loadError}</p>
                <Button variant="outline" className="mt-4" onClick={() => void load(search)}>
                  Retry
                </Button>
              </div>
            ) : purchases.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-12 w-12" />}
                title={search ? 'No matching payables' : 'No linked payables'}
                description={search ? 'Try a different supplier, purchase number, or invoice number.' : 'New posted purchases with supplier ledger tracking will appear here.'}
              />
            ) : (
              <>
                <div className="divide-y divide-border md:hidden">
                  {purchases.map(row => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => selectPurchase(row)}
                      className={`w-full p-4 text-left transition ${
                        selectedId === row.id ? 'bg-primary/5' : 'hover:bg-text/[0.02]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-mono font-bold text-primary">{row.purchaseNumber}</div>
                          <div className="mt-1 font-semibold">{row.supplierName}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">{formatCurrency(row.totalAmount)}</div>
                          <div className="text-xs font-semibold text-danger">
                            Due {formatCurrency(row.payableAmount || 0)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text/55">
                        <span>{row.invoiceNumber}</span>
                        <span>{toJsDate(row.invoiceDate || row.createdAt).toLocaleDateString('en-IN')}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="sticky top-0 bg-background text-xs uppercase text-text/55">
                      <tr>
                        <th className="px-4 py-3">Purchase</th>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-right">Payable</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {purchases.map(row => (
                        <tr key={row.id} className={selectedId === row.id ? 'bg-primary/5' : 'hover:bg-text/[0.02]'}>
                          <td className="px-4 py-3">
                            <div className="font-mono font-bold text-primary">{row.purchaseNumber}</div>
                            <div className="text-xs text-text/50">{row.invoiceNumber}</div>
                          </td>
                          <td className="px-4 py-3 font-semibold">{row.supplierName}</td>
                          <td className="px-4 py-3 text-text/60">{toJsDate(row.invoiceDate || row.createdAt).toLocaleDateString('en-IN')}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(row.totalAmount)}</td>
                          <td className="px-4 py-3 text-right font-bold text-danger">{formatCurrency(row.payableAmount || 0)}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant={selectedId === row.id ? 'secondary' : 'outline'}
                              onClick={() => selectPurchase(row)}
                            >
                              Select
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!search && hasMorePurchases && (
                  <div className="border-t border-border p-4">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => void loadPurchases('', true)}
                      disabled={loadingMorePurchases}
                    >
                      {loadingMorePurchases ? 'Loading more…' : 'Load More Payable Purchases'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>

          <form ref={formRef} onSubmit={submit}>
            <Card className="sticky top-24 space-y-5 p-5">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold">
                  <Banknote className="h-5 w-5 text-primary" /> Record Payment
                </div>
                <p className="mt-1 text-xs text-text/55">
                  Payment and supplier payable update atomically.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-3 text-sm">
                {selected ? (
                  <>
                    <div className="font-bold">{selected.supplierName}</div>
                    <div className="mt-1 flex justify-between text-text/60">
                      <span>{selected.purchaseNumber}</span>
                      <span>{formatCurrency(selected.payableAmount || 0)} due</span>
                    </div>
                  </>
                ) : (
                  <span className="text-text/50">Select a payable purchase bill.</span>
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
                  onChange={event => setPaymentMethod(event.target.value as SupplierPaymentRecord['paymentMethod'])}
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3"
                >
                  <option value="bank">Bank</option>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
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
              <Button type="submit" className="w-full" disabled={!selected || saving}>
                {saving ? 'Recording…' : 'Record Supplier Payment'}
              </Button>
            </Card>
          </form>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-border p-4 font-bold">Recent Supplier Payments</div>
          {payments.length === 0 ? (
            <div className="p-8 text-center text-sm text-text/50">No supplier payments recorded yet.</div>
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {payments.map(payment => (
                  <div key={payment.id} className="p-4">
                    <div className="flex justify-between gap-3">
                      <span className="font-mono font-semibold text-primary">{payment.paymentNumber}</span>
                      <span className="font-bold">{formatCurrency(payment.amount)}</span>
                    </div>
                    <div className="mt-1 font-semibold">{payment.supplierName}</div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text/50">
                      <span>{payment.purchaseNumber}</span>
                      <span className="uppercase">{payment.paymentMethod}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-background text-xs uppercase text-text/55">
                    <tr>
                      <th className="px-4 py-3 text-left">Payment</th>
                      <th className="px-4 py-3 text-left">Supplier</th>
                      <th className="px-4 py-3 text-left">Purchase</th>
                      <th className="px-4 py-3 text-left">Mode</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments.map(payment => (
                      <tr key={payment.id}>
                        <td className="px-4 py-3 font-mono font-semibold">{payment.paymentNumber}</td>
                        <td className="px-4 py-3">{payment.supplierName}</td>
                        <td className="px-4 py-3">{payment.purchaseNumber}</td>
                        <td className="px-4 py-3 uppercase">{payment.paymentMethod}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasMorePayments && (
                <div className="border-t border-border p-4">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => void loadPaymentHistory(true)}
                    disabled={loadingMorePayments}
                  >
                    {loadingMorePayments ? 'Loading more…' : 'Load More Payment History'}
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </PageTransition>
  );
}
