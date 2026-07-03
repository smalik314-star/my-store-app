import React, { forwardRef } from 'react';
import { Invoice, Customer } from '../../types';
import { Badge } from '../common/Badge';
import { 
  Building2, 
  Phone, 
  Mail, 
  CreditCard, 
  MapPin, 
  AlertCircle 
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency } from '../../utils/currency';
import { toJsDate } from '../../utils/date';

interface InvoiceTemplateProps {
  invoice: Invoice;
  customer?: Customer | null;
  className?: string;
  variant?: 'a4' | 'thermal';
}

export const InvoiceTemplate = forwardRef<HTMLDivElement, InvoiceTemplateProps>(({ invoice, customer, className, variant = 'a4' }, ref) => {
  const { settings } = useSettings();

  if (variant === 'thermal') {
    return (
      <div 
        ref={ref} 
        className={cn(
          "bg-white text-black p-4 w-[80mm] mx-auto font-mono text-[10px]",
          className
        )}
      >
        <div className="text-center border-b border-dashed border-black pb-4 mb-4">
          {settings?.logoURL ? (
            <img src={settings.logoURL} alt="Logo" className="h-12 mx-auto mb-2" />
          ) : (
            <h2 className="text-lg font-bold">{settings?.storeName || 'PHARMAFLOW'}</h2>
          )}
          <p>{settings?.address || '123 Healthcare Avenue, Mumbai'}</p>
          <p>Tel: {settings?.phone || '+91 98765 43210'}</p>
          {settings?.gstNumber && <p>GSTIN: {settings.gstNumber}</p>}
        </div>

        <div className="flex justify-between mb-1">
          <span>Date:</span>
          <span>{toJsDate(invoice.createdAt).toLocaleDateString(settings?.dateFormat === 'DD/MM/YYYY' ? 'en-IN' : 'en-US')}</span>
        </div>
        <div className="flex justify-between mb-4">
          <span>Bill No:</span>
          <span>{invoice.invoiceNumber}</span>
        </div>

        <div className="border-b border-dashed border-black mb-2 pb-2">
          <p className="font-bold mb-1">Customer: {invoice.customerName}</p>
        </div>

        <div className="mb-4">
          <div className="flex justify-between font-bold border-b border-black mb-1">
            <span className="w-1/2">Item</span>
            <span className="w-1/6 text-center">Qty</span>
            <span className="w-1/3 text-right">Amt</span>
          </div>
          {invoice.items.map((item, idx) => (
            <div key={idx} className="flex justify-between py-0.5">
              <span className="w-1/2 truncate">{item.name}</span>
              <span className="w-1/6 text-center">{item.quantity}</span>
              <span className="w-1/3 text-right">{formatCurrency(item.total)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-black pt-2 space-y-1">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          {settings?.taxMode && (
            <div className="flex justify-between">
              <span>GST:</span>
              <span>{formatCurrency(invoice.gstTotal)}</span>
            </div>
          )}
          {invoice.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>-{formatCurrency(invoice.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold pt-2 border-t border-black">
            <span>TOTAL:</span>
            <span>{formatCurrency(invoice.grandTotal)}</span>
          </div>
        </div>

        <div className="mt-8 text-center text-[8px] uppercase">
          <p>{settings?.invoiceFooterText || 'Thank you for visiting!'}</p>
          <p>Medicines once sold will not be returned</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={ref} 
      className={cn(
        "bg-white text-text print:p-0 print:m-0",
        "w-full max-w-[210mm] mx-auto min-h-[297mm] flex flex-col",
        className
      )}
    >
      {/* Invoice Header */}
      <div className="p-10 border-b-4 border-primary bg-background/30 flex flex-col md:flex-row justify-between gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-[1.5rem] bg-primary flex items-center justify-center text-white print:bg-primary print:text-white">
              {settings?.logoURL ? (
                <img src={settings.logoURL} alt="Logo" className="h-10 w-10 object-contain" />
              ) : (
                <Building2 className="h-8 w-8" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-black text-text tracking-tighter">{settings?.storeName || 'PharmaFlow'}</h2>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">{settings?.ownerName ? `Owned by ${settings.ownerName}` : 'Central Pharmacy Solutions'}</p>
            </div>
          </div>
          <div className="space-y-1 text-xs font-bold text-text/60">
            <p className="max-w-[250px] leading-relaxed">{settings?.address || '123 Healthcare Avenue, Medical District, Mumbai, Maharashtra - 400001'}</p>
            <p className="flex items-center gap-2 mt-2"><Phone className="h-3 w-3" /> {settings?.phone || '+91 98765 43210'}</p>
            <p className="flex items-center gap-2"><Mail className="h-3 w-3" /> {settings?.email || 'support@pharmaflow.com'}</p>
            {settings?.gstNumber && <p className="flex items-center gap-2"><CreditCard className="h-3 w-3 text-primary" /> GSTIN: {settings.gstNumber}</p>}
          </div>
        </div>

        <div className="text-right flex flex-col justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-5xl font-black text-text tracking-tighter opacity-10 uppercase">Invoice</h1>
            <p className="text-lg font-black text-text tracking-tight uppercase">{invoice.invoiceNumber}</p>
            <Badge variant={invoice.paymentStatus === 'paid' ? 'success' : 'warning'} className="font-black px-4 py-1">
              {invoice.paymentStatus.toUpperCase()}
            </Badge>
          </div>
          <div className="space-y-1 text-xs font-bold text-text/60 text-right mt-4">
            <p className="uppercase text-[10px] text-text/30 font-black tracking-widest">Date of Issue</p>
            <p>{toJsDate(invoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            <p>{toJsDate(invoice.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
      </div>

      {/* Client & Billing Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
        <div className="p-10 bg-white space-y-4">
          <h3 className="text-[10px] font-black text-text/30 uppercase tracking-[0.3em] mb-4">Billed To</h3>
          <div className="space-y-2 text-left">
            <p className="text-xl font-black text-text">{invoice.customerName}</p>
            {customer ? (
              <div className="space-y-1 text-xs font-bold text-text/60 leading-relaxed">
                <p className="flex items-center gap-2"><Phone className="h-3 w-3" /> {customer.phone}</p>
                <p className="flex items-start gap-2"><MapPin className="h-3 w-3 mt-0.5" /> {customer.address}</p>
                {customer.gstNumber && <p className="flex items-center gap-2 text-primary"><CreditCard className="h-3 w-3" /> GSTIN: {customer.gstNumber}</p>}
              </div>
            ) : (
              <p className="text-xs font-bold text-text/40 italic">Walk-in Customer Detail</p>
            )}
          </div>
        </div>
        <div className="p-10 bg-white space-y-4">
          <h3 className="text-[10px] font-black text-text/30 uppercase tracking-[0.3em] mb-4">Payment Details</h3>
          <div className="grid grid-cols-2 gap-6 text-left">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-text/30 uppercase tracking-widest">Method</p>
              <p className="text-sm font-black text-text uppercase">{invoice.paymentMethod}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-text/30 uppercase tracking-widest">Due Date</p>
              <p className="text-sm font-black text-text">On Receipt</p>
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-[10px] font-black text-text/30 uppercase tracking-widest">Transaction Ref</p>
              <p className="text-xs font-mono text-text/40 break-all">{invoice.id}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Itemized Table */}
      <div className="flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-background/20 border-y border-border">
              <th className="px-10 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Description</th>
              <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-center">SKU</th>
              <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-center">Qty</th>
              <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-right">Unit Price</th>
              <th className="px-10 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className="hover:bg-background/20 transition-colors">
                <td className="px-10 py-6">
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-text">{item.name}</span>
                    <span className="text-[9px] font-bold text-text/30 uppercase">Medicine Item</span>
                  </div>
                </td>
                <td className="px-6 py-6 text-center">
                  <span className="text-xs font-mono text-text/40">{item.sku}</span>
                </td>
                <td className="px-6 py-6 text-center">
                  <span className="text-sm font-black text-text">{item.quantity}</span>
                </td>
                <td className="px-6 py-6 text-right">
                  <span className="text-sm font-bold text-text/60">{formatCurrency(item.price)}</span>
                </td>
                <td className="px-10 py-6 text-right">
                  <span className="text-sm font-black text-text">{formatCurrency(item.price * item.quantity)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Summary */}
      <div className="p-10 flex flex-col md:flex-row justify-between gap-12 bg-background/10">
        <div className="flex-1 space-y-6">
          <div className="p-6 bg-white border border-border rounded-2xl space-y-4">
            <h4 className="text-[10px] font-black text-text/30 uppercase tracking-[0.2em] flex items-center gap-2">
              <AlertCircle className="h-3 w-3" /> Important Notes
            </h4>
            <ul className="space-y-2 text-[10px] font-bold text-text/50 list-disc pl-4 leading-relaxed">
              <li>Goods once sold will not be taken back without valid prescription.</li>
              <li>Verify your medications before leaving the counter.</li>
              <li>This is a computer-generated invoice and requires no physical signature.</li>
            </ul>
          </div>
        </div>

        <div className="w-full md:w-80 space-y-4">
          <div className="flex justify-between items-center text-sm font-bold text-text/60">
            <span className="uppercase tracking-widest text-[10px]">Subtotal</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          {settings?.taxMode && (
            <>
              <div className="flex justify-between items-center text-sm font-bold text-text/60">
                <span className="uppercase tracking-widest text-[10px]">CGST ({settings.cgstRate}%)</span>
                <span>{formatCurrency(invoice.gstTotal / 2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold text-text/60">
                <span className="uppercase tracking-widest text-[10px]">SGST ({settings.sgstRate}%)</span>
                <span>{formatCurrency(invoice.gstTotal / 2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-black text-primary">
                <span className="uppercase tracking-widest text-[10px]">Total GST</span>
                <span>{formatCurrency(invoice.gstTotal)}</span>
              </div>
            </>
          )}
          {invoice.discount > 0 && (
            <div className="flex justify-between items-center text-sm font-black text-danger">
              <span className="uppercase tracking-widest text-[10px]">Discount</span>
              <span>- {formatCurrency(invoice.discount)}</span>
            </div>
          )}
          <div className="h-px bg-border my-4" />
          <div className="flex justify-between items-center">
            <span className="text-lg font-black text-text uppercase tracking-tighter">Total Payable</span>
            <span className="text-3xl font-black text-primary tracking-tighter">{formatCurrency(invoice.grandTotal)}</span>
          </div>
          
          <div className="pt-8">
            <div className="h-16 w-full border-b border-border mb-2" />
            <p className="text-[9px] font-black text-text/20 uppercase text-center tracking-widest">Authorized Signatory</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-8 bg-text text-white/40 text-center mt-auto">
        <p className="text-[9px] font-black uppercase tracking-[0.5em]">{settings?.invoiceFooterText || 'Thank you for choosing PharmaFlow Pharmacy'}</p>
      </div>
    </div>
  );
});

InvoiceTemplate.displayName = 'InvoiceTemplate';
