import { motion } from 'motion/react';
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
    <Card className="p-0 overflow-hidden flex flex-col border-white/20 shadow-xl">
      <div className="flex items-center justify-between p-6 border-b border-border bg-background/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ReceiptText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text">Recent Transactions</h3>
            <p className="text-[11px] text-text/40 font-bold uppercase tracking-wider">Latest sales activity</p>
          </div>
        </div>
        <button className="text-xs font-bold text-primary hover:bg-primary/5 px-4 py-2 rounded-xl transition-all border border-primary/20">
          VIEW JOURNAL
        </button>
      </div>

      <div className="overflow-x-auto">
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
                  className="group hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-primary">#{inv.invoiceNumber}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-text">{inv.customerName}</span>
                      <span className="text-[11px] text-text/40 font-medium tracking-tight">ID: {inv.customerId.slice(0, 8)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-text/60 font-medium">
                      {toJsDate(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
