import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import {
  ArrowLeft,
  CreditCard,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { PageTransition } from '../../components/common/PageTransition';
import CustomerForm from '../../components/customers/CustomerForm';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import type { Customer, Invoice, LedgerEntry } from '../../types';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/currency';
import { toJsDate } from '../../utils/date';
import { buildRunningLedger } from '../../utils/ledger';

const voucherLabel = (type: string) => ({
  sale: 'Sale invoice',
  sale_return: 'Sale return',
  receipt: 'Receipt',
  sale_cancel: 'Invoice cancellation',
}[type] || type.replaceAll('_', ' '));

export default function CustomerProfile() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [invoiceCursor, setInvoiceCursor] = useState<any>(null);
  const [ledgerCursor, setLedgerCursor] = useState<any>(null);
  const [hasMoreInvoices, setHasMoreInvoices] = useState(false);
  const [hasMoreLedger, setHasMoreLedger] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const loadInvoices = async (reset: boolean = true) => {
    if (!id || !user?.tenantId) return;
    const invoiceQuery = query(
      collection(db, 'invoices'),
      where('tenantId', '==', user.tenantId),
      where('customerId', '==', id),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const snapshot = await getDocs(
      reset || !invoiceCursor ? invoiceQuery : query(invoiceQuery, startAfter(invoiceCursor))
    );
    const rows = snapshot.docs.map(row => ({ id: row.id, ...row.data() } as Invoice));
    setInvoices(current => (reset ? rows : [...current, ...rows]));
    setInvoiceCursor(snapshot.docs[snapshot.docs.length - 1] ?? null);
    setHasMoreInvoices(snapshot.docs.length === 20);
  };

  const loadLedger = async (reset: boolean = true) => {
    if (!id || !user?.tenantId) return;
    const ledgerQuery = query(
      collection(db, 'ledgerEntries'),
      where('tenantId', '==', user.tenantId),
      where('partyId', '==', id),
      where('partyType', '==', 'customer'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const snapshot = await getDocs(
      reset || !ledgerCursor ? ledgerQuery : query(ledgerQuery, startAfter(ledgerCursor))
    );
    const rows = snapshot.docs.map(row => ({ id: row.id, ...row.data() } as LedgerEntry));
    setLedgerEntries(current => (reset ? rows : [...current, ...rows]));
    setLedgerCursor(snapshot.docs[snapshot.docs.length - 1] ?? null);
    setHasMoreLedger(snapshot.docs.length === 20);
  };

  useEffect(() => {
    if (!id || !user?.tenantId) return;
    setLoading(true);
    setHistoryLoading(true);
    setLoadError('');

    const fail = (error: Error) => {
      setLoadError(error.message || 'Customer records could not be loaded.');
      setLoading(false);
      setHistoryLoading(false);
    };

    const unsubCustomer = onSnapshot(
      doc(db, 'customers', id),
      snapshot => {
        if (!snapshot.exists() || snapshot.data().tenantId !== user.tenantId) {
          setCustomer(null);
        } else {
          setCustomer({ id: snapshot.id, ...snapshot.data() } as Customer);
        }
        setLoading(false);
      },
      fail
    );

    void Promise.all([loadInvoices(true), loadLedger(true)])
      .catch(fail)
      .finally(() => setHistoryLoading(false));

    return () => {
      unsubCustomer();
    };
  }, [id, user?.tenantId, reloadKey]);

  const ledger = useMemo(() => buildRunningLedger(ledgerEntries).reverse(), [ledgerEntries]);
  const stats = useMemo(() => ({
    totalPurchases: Number(customer?.totalPurchases) || 0,
    totalPaid: Number(customer?.totalPaid) || 0,
    outstanding: Number(customer?.outstandingBalance) || 0,
    credit: Number(customer?.creditBalance) || 0,
  }), [customer]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1500px] animate-pulse space-y-5 p-4 md:p-8">
        <div className="h-12 w-52 rounded-xl bg-border" />
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="h-80 rounded-2xl bg-border" />
          <div className="h-80 rounded-2xl bg-border" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-bold text-danger">Customer records could not be loaded</h2>
          <p className="mt-2 text-sm text-text/60">{loadError}</p>
          <Button className="mt-5" onClick={() => setReloadKey(value => value + 1)}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </Card>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <EmptyState
          icon={<Receipt className="h-12 w-12" />}
          title="Customer not found"
          description="The customer is missing or does not belong to your store."
          action={<Button onClick={() => navigate('/customers')}>Back to Customers</Button>}
        />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:space-y-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/customers')}
              aria-label="Back to customers"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold md:text-3xl">{customer.name}</h1>
                {stats.outstanding > 0 && <Badge variant="warning">Unpaid dues</Badge>}
                {stats.credit > 0 && <Badge variant="success">Credit available</Badge>}
              </div>
              <p className="mt-1 text-xs text-text/50">
                Customer since {customer.createdAt ? toJsDate(customer.createdAt).toLocaleDateString('en-IN') : '-'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={() => setShowForm(true)}>Edit Profile</Button>
            <Button onClick={() => navigate('/billing')}>
              <Plus className="h-4 w-4" /> New Sale
            </Button>
            {stats.outstanding > 0 && (
              <Button className="col-span-2" variant="secondary" onClick={() => navigate('/receipts')}>
                <Receipt className="h-4 w-4" /> Record Receipt
              </Button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showForm && <CustomerForm onClose={() => setShowForm(false)} editingCustomer={customer} />}
        </AnimatePresence>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-primary/5 p-5 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
                {customer.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="mt-3 font-bold">{customer.name}</h2>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <a href={`tel:${customer.phone}`} className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Phone className="h-4 w-4 text-primary" />
                <span>{customer.phone || 'No phone recorded'}</span>
              </a>
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Mail className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{customer.email}</span>
                </a>
              )}
              <div className="flex items-start gap-3">
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-primary" />
                <span>{customer.address || 'No address recorded'}</span>
              </div>
              {customer.gstNumber && (
                <div className="flex items-center gap-3">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span className="font-mono">{customer.gstNumber}</span>
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Card className="p-4">
                <ShoppingBag className="h-5 w-5 text-primary" />
                <div className="mt-3 text-xs text-text/50">Lifetime sales</div>
                <div className="mt-1 text-lg font-bold">{formatCurrency(stats.totalPurchases)}</div>
              </Card>
              <Card className="p-4">
                <TrendingUp className="h-5 w-5 text-success" />
                <div className="mt-3 text-xs text-text/50">Total received</div>
                <div className="mt-1 text-lg font-bold text-success">{formatCurrency(stats.totalPaid)}</div>
              </Card>
              <Card className={cn('p-4', stats.outstanding > 0 && 'border-warning/30 bg-warning/5')}>
                <Receipt className="h-5 w-5 text-warning" />
                <div className="mt-3 text-xs text-text/50">Receivable</div>
                <div className="mt-1 text-lg font-bold">{formatCurrency(stats.outstanding)}</div>
              </Card>
              <Card className="p-4">
                <CreditCard className="h-5 w-5 text-secondary" />
                <div className="mt-3 text-xs text-text/50">Customer credit</div>
                <div className="mt-1 text-lg font-bold">{formatCurrency(stats.credit)}</div>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <h2 className="font-bold">Invoices</h2>
                  <p className="mt-1 text-xs text-text/50">{invoices.length} loaded transaction(s)</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/invoices')}>View All</Button>
              </div>
              {historyLoading ? (
                <div className="p-8 text-center text-sm text-text/50">Loading invoice history...</div>
              ) : invoices.length === 0 ? (
                <EmptyState icon={<Receipt className="h-10 w-10" />} title="No invoices" description="This customer has no linked invoices yet." />
              ) : (
                <>
                  <div className="divide-y divide-border md:hidden">
                    {invoices.map(invoice => (
                      <button
                        key={invoice.id}
                        type="button"
                        onClick={() => navigate(`/invoice/${invoice.id}`)}
                        className="w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <div className="flex justify-between gap-3">
                          <span className="font-mono font-bold text-primary">{invoice.invoiceNumber}</span>
                          <span className="font-bold">{formatCurrency(invoice.grandTotal)}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-text/50">
                          <span>{toJsDate(invoice.createdAt).toLocaleDateString('en-IN')}</span>
                          <Badge variant={invoice.status === 'cancelled' ? 'danger' : invoice.paymentStatus === 'paid' ? 'success' : 'warning'}>
                            {invoice.status === 'cancelled' ? 'Cancelled' : invoice.paymentStatus}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead className="bg-background text-xs uppercase text-text/50">
                        <tr>
                          <th className="px-4 py-3 text-left">Invoice</th>
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-4 py-3 text-right">Outstanding</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-right">View</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {invoices.map(invoice => (
                          <tr key={invoice.id}>
                            <td className="px-4 py-3 font-mono font-bold text-primary">{invoice.invoiceNumber}</td>
                            <td className="px-4 py-3">{toJsDate(invoice.createdAt).toLocaleDateString('en-IN')}</td>
                            <td className="px-4 py-3 text-right font-bold">{formatCurrency(invoice.grandTotal)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(invoice.outstandingAmount || 0)}</td>
                            <td className="px-4 py-3">
                              <Badge variant={invoice.status === 'cancelled' ? 'danger' : invoice.paymentStatus === 'paid' ? 'success' : 'warning'}>
                                {invoice.status === 'cancelled' ? 'Cancelled' : invoice.paymentStatus}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => navigate(`/invoice/${invoice.id}`)}
                                aria-label={`View invoice ${invoice.invoiceNumber}`}
                                className="rounded-lg p-2 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {hasMoreInvoices && (
                    <div className="border-t border-border p-4 text-center">
                      <Button variant="outline" onClick={() => void loadInvoices(false)}>
                        Load more invoices
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-border p-4">
                <h2 className="font-bold">Customer Ledger</h2>
                <p className="mt-1 text-xs text-text/50">Debit increases receivable; credit reduces it or creates customer credit.</p>
              </div>
              {historyLoading ? (
                <div className="p-8 text-center text-sm text-text/50">Loading ledger history...</div>
              ) : ledger.length === 0 ? (
                <EmptyState
                  icon={<CreditCard className="h-10 w-10" />}
                  title="No linked ledger entries"
                  description="New invoices, receipts and returns will create an auditable ledger. Existing records are not rewritten automatically."
                />
              ) : (
                <>
                  <div className="divide-y divide-border md:hidden">
                    {ledger.map(row => (
                      <div key={row.id} className="p-4">
                        <div className="flex justify-between gap-3">
                          <div>
                            <div className="font-semibold capitalize">{voucherLabel(row.voucherType)}</div>
                            <div className="mt-1 font-mono text-xs text-primary">{row.voucherNumber}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{formatCurrency(row.runningBalance)}</div>
                            <div className="text-xs text-text/45">Running balance</div>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-text/55">
                          <span>{toJsDate(row.createdAt).toLocaleDateString('en-IN')}</span>
                          <span>Dr {formatCurrency(row.debit)} | Cr {formatCurrency(row.credit)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-background text-xs uppercase text-text/50">
                        <tr>
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-left">Particulars</th>
                          <th className="px-4 py-3 text-left">Voucher</th>
                          <th className="px-4 py-3 text-right">Debit</th>
                          <th className="px-4 py-3 text-right">Credit</th>
                          <th className="px-4 py-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {ledger.map(row => (
                          <tr key={row.id}>
                            <td className="px-4 py-3">{toJsDate(row.createdAt).toLocaleDateString('en-IN')}</td>
                            <td className="px-4 py-3 font-semibold capitalize">{voucherLabel(row.voucherType)}</td>
                            <td className="px-4 py-3 font-mono text-primary">{row.voucherNumber}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(row.debit)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(row.credit)}</td>
                            <td className="px-4 py-3 text-right font-bold">{formatCurrency(row.runningBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {hasMoreLedger && (
                    <div className="border-t border-border p-4 text-center">
                      <Button variant="outline" onClick={() => void loadLedger(false)}>
                        Load more ledger entries
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
