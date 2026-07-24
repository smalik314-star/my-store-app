import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ReceiptText, ExternalLink } from 'lucide-react';
import { Card } from '../common/Card';
import { Invoice } from '../../types';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/currency';
import { toJsDate } from '../../utils/date';

interface RecentInvoicesProps {
  invoices: Invoice[];
  loading?: boolean;
}

export function RecentInvoices({ invoices, loading }: RecentInvoicesProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card className="p-0 overflow-hidden flex flex-col">
        <div className="h-16 border-b border-border animate-pulse" />
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-14 bg-border/20 rounded-xl animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden flex flex-col border-border">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-border bg-background/50">
        <div className="flex items-center gap-3">
          <div className="hidden min-[360px]:flex h-9 w-9 rounded-lg bg-primary/10 items-center justify-center">
            <ReceiptText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text">Recent Transactions</h3>
            <p className="text-[11px] text-text/40 font-bold uppercase tracking-wider">Latest sales activity</p>
          </div>
        </div>
        <button 
          onClick={() => navigate('/invoices')}
          className="shrink-0 text-[10px] sm:text-xs font-bold text-primary hover:bg-primary/5 px-3 py-2 rounded-lg transition-all border border-primary/20"
        >
          VIEW ALL
        </button>
      </div>

      <div className="divide-y divide-border/60 md:hidden">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-text/40">
            <ReceiptText className="h-8 w-8" />
            <p className="text-sm font-medium">No transactions found</p>
          </div>
        ) : (
          invoices.map((inv, idx) => (
            <motion.button
              type="button"
              key={inv.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
              onClick={() => navigate(`/invoice/${inv.id}`)}
              className="flex min-h-[84px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-black text-primary">#{inv.invoiceNumber}</span>
                  <span className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase",
                    inv.paymentStatus === 'paid' ? "bg-success/10 text-success" :
                    inv.paymentStatus === 'due' ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"
                  )}>
                    {inv.paymentStatus}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs font-bold text-text">{inv.customerName || 'Walk-in Customer'}</p>
                <p className="mt-0.5 text-[10px] font-medium text-text/45">
                  {toJsDate(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-text">{formatCurrency(inv.grandTotal)}</p>
                <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-primary">
                  Open <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </motion.button>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-background/30">
              <th className="text-[11px] font-black uppercase text-text/40 tracking-widest px-6 py-4">Invoice ID</th>
              <th className="text-[11px] font-black uppercase text-text/40 tracking-widest px-6 py-4">Customer</th>
              <th className="text-[11px] font-black uppercase text-text/40 tracking-widest px-6 py-4">Date</th>
              <th className="text-[11px] font-black uppercase text-text/40 tracking-widest px-6 py-4">Amount</th>
              <th className="text-[11px] font-black uppercase text-text/40 tracking-widest px-6 py-4">Status</th>
              <th className="text-[11px] font-black uppercase text-text/40 tracking-widest px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 opacity-40">
                    <ReceiptText className="h-8 w-8" />
                    <p className="text-sm font-medium">No transactions found</p>
                  </div>
                </td>
              </tr>
            ) : (
              invoices.map((inv, idx) => (
                <motion.tr
                  key={inv.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => navigate(`/invoice/${inv.id}`)}
                  className="group hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-primary">#{inv.invoiceNumber}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-text">{inv.customerName || 'Walk-in Customer'}</span>
                      <span className="text-[11px] text-text/40 font-medium tracking-tight">ID: {inv.customerId?.slice(0, 8) || 'walk-in'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-text/60 font-medium">
                      {toJsDate(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-black text-text">{formatCurrency(inv.grandTotal)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      inv.paymentStatus === 'paid' ? "bg-success/10 text-success" : 
                      inv.paymentStatus === 'due' ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"
                    )}>
                      {inv.paymentStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ExternalLink className="h-4 w-4 text-text/20 group-hover:text-primary transition-colors ml-auto" />
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
