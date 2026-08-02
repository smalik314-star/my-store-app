import React, { useEffect, useMemo, useState } from 'react';
import {
  ReceiptText,
  Search,
  CreditCard,
  ChevronRight,
  ExternalLink,
  Download,
  FileText,
  Ban,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/currency';
import { useNavigate } from 'react-router-dom';
import { invoiceService } from '../../services/invoiceService';
import { PageTransition } from '../../components/common/PageTransition';
import { useToast } from '../../context/ToastContext';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { SkeletonTable } from '../../components/common/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { toJsDate } from '../../utils/date';
import { Invoice } from '../../types';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';

const EmptyState = ({ title, description, icon, action, className }: any) => (
  <div className={cn('flex flex-col items-center justify-center py-20 text-center', className)}>
    <div className="h-20 w-20 rounded-[2.5rem] bg-primary/5 flex items-center justify-center text-primary/20 mb-6">
      {icon}
    </div>
    <h3 className="text-2xl font-black text-text tracking-tight uppercase">{title}</h3>
    <p className="text-xs font-bold text-text/40 mt-2 max-w-xs">{description}</p>
    {action && <div className="mt-8">{action}</div>}
  </div>
);

export default function InvoiceList() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'DUE' | 'PARTIAL'>('ALL');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('ALL');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [cursor, setCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [invoiceToCancel, setInvoiceToCancel] = useState<Invoice | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const { showToast } = useToast();
  const navigate = useNavigate();

  const loadInvoices = async (term: string, append: boolean = false) => {
    if (!user?.tenantId) return;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      if (term.trim().length >= 2) {
        const rows = await invoiceService.searchInvoices(user.tenantId, term, 40);
        setInvoices(rows);
        setCursor(null);
        setHasMore(false);
        return;
      }
      const result = await invoiceService.getInvoicesPaginated(user.tenantId, 30, append ? cursor : null);
      setInvoices(current => append ? [...current, ...(result?.invoices || [])] : (result?.invoices || []));
      setCursor(result?.lastDoc || null);
      setHasMore(Boolean(result?.lastDoc));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadInvoices('');
  }, [user?.tenantId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!user?.tenantId) return;
    void loadInvoices(searchTerm, false);
  }, [searchTerm, user?.tenantId]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesStatus = statusFilter === 'ALL' || inv.paymentStatus.toUpperCase() === statusFilter;
      const matchesMethod = methodFilter === 'ALL' || inv.paymentMethod.toUpperCase() === methodFilter;

      let matchesDate = true;
      if (dateFilter !== 'ALL') {
        const date = toJsDate(inv.createdAt);
        const now = new Date();
        if (dateFilter === 'TODAY') {
          matchesDate = date.toDateString() === now.toDateString();
        } else if (dateFilter === 'WEEK') {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          matchesDate = date >= weekAgo;
        } else if (dateFilter === 'MONTH') {
          matchesDate = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        } else if (dateFilter === 'CUSTOM') {
          const from = customFromDate ? new Date(`${customFromDate}T00:00:00`) : null;
          const to = customToDate ? new Date(`${customToDate}T23:59:59`) : null;
          matchesDate = (!from || date >= from) && (!to || date <= to);
        }
      }

      return matchesStatus && matchesMethod && matchesDate;
    });
  }, [invoices, statusFilter, methodFilter, dateFilter, customFromDate, customToDate]);

  const stats = useMemo(() => {
    const postedInvoices = filteredInvoices.filter(inv => inv.status !== 'cancelled');
    const total = postedInvoices.length;
    const revenue = postedInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
    const paidCount = postedInvoices.filter(inv => inv.paymentStatus === 'paid').length;
    const dueCount = postedInvoices.filter(inv => inv.paymentStatus === 'due').length;
    const dueAmount = postedInvoices
      .filter(inv => inv.paymentStatus === 'due')
      .reduce((acc, inv) => acc + (Number(inv.outstandingAmount) || inv.grandTotal), 0);

    return { total, revenue, paidCount, dueCount, dueAmount };
  }, [filteredInvoices]);

  const handleCancel = async () => {
    if (!invoiceToCancel || !user?.tenantId) return;
    setIsCancelling(true);
    try {
      await invoiceService.cancelInvoice(user.tenantId, invoiceToCancel.id);
      showToast(`Invoice ${invoiceToCancel.invoiceNumber} cancelled and stock reversed.`, 'success');
      setInvoiceToCancel(null);
      setSearchInput('');
      setSearchTerm('');
      await loadInvoices('');
    } catch (error: any) {
      showToast(error.message || 'Failed to cancel invoice', 'danger');
    } finally {
      setIsCancelling(false);
    }
  };

  const exportFilteredInvoices = () => {
    if (filteredInvoices.length === 0) {
      showToast('No invoice records match the current filters.', 'info');
      return;
    }
    const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = filteredInvoices.map(invoice => [
      invoice.invoiceNumber,
      toJsDate(invoice.createdAt).toLocaleDateString('en-IN'),
      invoice.customerName,
      invoice.paymentStatus,
      invoice.paymentMethod,
      invoice.grandTotal
    ].map(escapeCell).join(','));
    const csv = [
      ['Invoice Number', 'Date', 'Customer', 'Status', 'Payment Method', 'Amount'].map(escapeCell).join(','),
      ...rows
    ].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pharmaflow-sale-register-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`${filteredInvoices.length} invoice records exported.`, 'success');
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
        <div className="flex justify-between items-center mb-8">
          <div className="space-y-2">
            <div className="h-10 w-64 bg-text/5 animate-pulse rounded-lg" />
            <div className="h-4 w-48 bg-text/5 animate-pulse rounded-lg" />
          </div>
          <div className="h-14 w-48 bg-text/5 animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-surface rounded-3xl border border-border animate-pulse" />
          ))}
        </div>
        <SkeletonTable rows={10} />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black text-text tracking-tight flex items-center gap-4">
              Invoice Records
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <ReceiptText className="h-6 w-6 text-primary" />
              </div>
            </h1>
            <p className="text-[10px] font-black text-text/30 uppercase tracking-[0.3em] mt-2">
              Loaded register window: {stats.total} invoice records
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={exportFilteredInvoices}
              leftIcon={<Download className="h-4 w-4" />}
              className="font-black h-12 px-5 rounded-xl"
            >
              Export Sale Register
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate('/billing')}
              leftIcon={<CreditCard className="h-5 w-5" />}
              className="font-black shadow-xl shadow-primary/20 h-12 px-6 rounded-xl"
            >
              Generate New Bill
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-6 border-border bg-surface relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
              <TrendingUp className="h-16 w-16 text-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">Loaded Revenue</span>
              <span className="text-3xl font-black text-text">{formatCurrency(stats.revenue)}</span>
            </div>
          </Card>

          <Card className="p-6 border-border bg-surface relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
              <CheckCircle className="h-16 w-16 text-success" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">Paid Invoices</span>
              <span className="text-3xl font-black text-text">{stats.paidCount}</span>
            </div>
          </Card>

          <Card className="p-6 border-border bg-surface relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
              <Clock className="h-16 w-16 text-warning" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">Due Invoices</span>
              <span className="text-3xl font-black text-text">{stats.dueCount}</span>
            </div>
          </Card>

          <Card className="p-6 border-border bg-surface relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
              <AlertTriangle className="h-16 w-16 text-danger" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">Loaded Outstanding</span>
              <span className="text-3xl font-black text-danger">{formatCurrency(stats.dueAmount)}</span>
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden border-border bg-surface shadow-xl">
          <div className="p-6 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex flex-wrap items-center gap-3 max-w-full">
                <div className="flex items-center gap-1 p-1 bg-background/50 rounded-2xl border border-border w-fit overflow-x-auto scrollbar-none">
                  {['ALL', 'PAID', 'DUE', 'PARTIAL'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setStatusFilter(tab as any)}
                      className={cn(
                        'px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap',
                        statusFilter === tab
                          ? 'bg-primary text-white shadow-lg shadow-primary/20'
                          : 'text-text/40 hover:text-text hover:bg-background'
                      )}
                    >
                      {tab === 'ALL' ? 'All Status' : tab}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 p-1 bg-background/50 rounded-2xl border border-border w-fit overflow-x-auto scrollbar-none">
                  {['ALL', 'CASH', 'UPI', 'CARD', 'CREDIT'].map((method) => (
                    <button
                      key={method}
                      onClick={() => setMethodFilter(method)}
                      className={cn(
                        'px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap',
                        methodFilter === method
                          ? 'bg-text text-white shadow-lg shadow-text/10'
                          : 'text-text/40 hover:text-text hover:bg-background'
                      )}
                    >
                      {method === 'ALL' ? 'All Methods' : method}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative w-full lg:w-96 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  placeholder="Invoice # or Customer Name..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50">
              <span className="text-[10px] font-black text-text/20 uppercase tracking-[0.2em] mr-2">Timeline:</span>
              {['ALL', 'TODAY', 'WEEK', 'MONTH', 'CUSTOM'].map((period) => (
                <button
                  key={period}
                  onClick={() => setDateFilter(period as any)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border',
                    dateFilter === period
                      ? 'bg-primary/5 border-primary text-primary'
                      : 'border-border text-text/40 hover:border-primary/30'
                  )}
                >
                  {period}
                </button>
              ))}
              {dateFilter === 'CUSTOM' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={customFromDate}
                    onChange={(event) => setCustomFromDate(event.target.value)}
                    className="h-9 rounded-xl border border-border bg-background px-3 text-[10px] font-black outline-none focus:border-primary"
                    aria-label="Sale register from date"
                  />
                  <span className="text-[10px] font-black text-text/30">TO</span>
                  <input
                    type="date"
                    value={customToDate}
                    onChange={(event) => setCustomToDate(event.target.value)}
                    className="h-9 rounded-xl border border-border bg-background px-3 text-[10px] font-black outline-none focus:border-primary"
                    aria-label="Sale register to date"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-background/20 border-b border-border">
                  <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Invoice Details</th>
                  <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Customer</th>
                  <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Date & Time</th>
                  <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-center">Amount</th>
                  <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <AnimatePresence mode="popLayout">
                  {filteredInvoices.map((invoice) => (
                    <motion.tr
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      key={invoice.id}
                      className="group hover:bg-background/30 transition-all cursor-pointer"
                      onClick={() => navigate(`/invoice/${invoice.id}`)}
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center text-text/20 group-hover:text-primary group-hover:border-primary/30 transition-all">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-text group-hover:text-primary transition-colors uppercase">{invoice.invoiceNumber}</span>
                            <span className="text-[10px] font-bold text-text/30 uppercase tracking-wider">{invoice.items.length} items</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-text">{invoice.customerName}</span>
                          <span className="text-[10px] font-bold text-text/30 uppercase tracking-widest">ID: {invoice.customerId.slice(0, 8)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-text/60">
                            {toJsDate(invoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-[10px] font-bold text-text/20 uppercase">
                            {toJsDate(invoice.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-text">{formatCurrency(invoice.grandTotal)}</span>
                          <span className="text-[8px] font-black text-text/30 uppercase">{invoice.paymentMethod}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <Badge
                          variant={invoice.status === 'cancelled' ? 'danger' : invoice.paymentStatus === 'paid' ? 'success' : 'danger'}
                          className="font-black text-[9px] min-w-[70px] justify-center"
                        >
                          {invoice.status === 'cancelled' ? 'CANCELLED' : invoice.paymentStatus.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            className="h-10 w-10 rounded-xl hover:bg-primary/10 text-text/20 hover:text-primary transition-all inline-flex items-center justify-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/invoice/${invoice.id}`);
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                          {invoice.status !== 'cancelled' && (
                            <button
                              className="h-10 w-10 rounded-xl hover:bg-danger/10 text-text/20 hover:text-danger transition-all inline-flex items-center justify-center"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInvoiceToCancel(invoice);
                              }}
                              aria-label={`Cancel invoice ${invoice.invoiceNumber}`}
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-border/50">
            {filteredInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="p-6 space-y-4 active:bg-background transition-colors"
                onClick={() => navigate(`/invoice/${invoice.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-black text-text uppercase text-sm">{invoice.invoiceNumber}</span>
                      <span className="text-[10px] font-bold text-text/30 uppercase">{invoice.items.length} items</span>
                    </div>
                  </div>
                  <Badge variant={invoice.status === 'cancelled' ? 'danger' : invoice.paymentStatus === 'paid' ? 'success' : 'danger'}>
                    {invoice.status === 'cancelled' ? 'CANCELLED' : invoice.paymentStatus.toUpperCase()}
                  </Badge>
                </div>

                <div className="flex justify-between items-end pt-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">Customer</span>
                    <span className="text-sm font-black text-text">{invoice.customerName}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">Grand Total</span>
                    <span className="text-lg font-black text-primary">{formatCurrency(invoice.grandTotal)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border/50">
                  <span className="text-[10px] font-bold text-text/40">
                    {toJsDate(invoice.createdAt).toLocaleDateString()} at {toJsDate(invoice.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex items-center gap-2">
                    {invoice.status !== 'cancelled' && <button
                      className="h-8 w-8 rounded-lg bg-background border border-border flex items-center justify-center text-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInvoiceToCancel(invoice);
                      }}
                      aria-label={`Cancel invoice ${invoice.invoiceNumber}`}
                    >
                      <Ban className="h-4 w-4" />
                    </button>}
                    <button className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredInvoices.length === 0 && (
            <EmptyState
              title="No invoices found"
              description="Loaded register results matching the current filters will appear here."
              icon={<ReceiptText className="h-20 w-20" />}
              className="py-32"
              action={
                <Button
                  variant="primary"
                  onClick={() => navigate('/billing')}
                  className="font-black uppercase text-[10px] tracking-widest px-8"
                >
                  Generate First Bill
                </Button>
              }
            />
          )}

          {!searchTerm && hasMore && filteredInvoices.length > 0 && (
            <div className="p-6 border-t border-border bg-background/20">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void loadInvoices('', true)}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading more…' : 'Load More Invoices'}
              </Button>
            </div>
          )}
        </Card>

        <ConfirmModal
          isOpen={!!invoiceToCancel}
          onClose={() => setInvoiceToCancel(null)}
          onConfirm={handleCancel}
          isLoading={isCancelling}
          title="Cancel Invoice"
          message={`Cancel invoice ${invoiceToCancel?.invoiceNumber}? Stock and customer balances will be reversed once. The invoice will remain in audit history.`}
          confirmText="Cancel & Reverse"
          variant="danger"
        />
      </div>
    </PageTransition>
  );
}
