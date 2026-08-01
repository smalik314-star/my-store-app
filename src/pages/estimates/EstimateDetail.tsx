import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { estimateService } from '../../services/estimateService';
import type { Estimate } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { formatDate, toJsDate } from '../../utils/date';
import { Button } from '../../components/common/Button';

export default function EstimateDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user?.tenantId) return;
    estimateService.get(user.tenantId, id).then(setEstimate).finally(() => setLoading(false));
  }, [id, user?.tenantId]);
  if (loading) return <p className="p-8">Loading estimate…</p>;
  if (!estimate) return <p className="p-8 text-red-700 font-bold">Estimate not found or access denied.</p>;
  return (
    <div className="p-4 md:p-8">
      <div className="mb-4 flex justify-end no-print"><Button onClick={() => window.print()} leftIcon={<Printer className="h-4 w-4" />}>Print / PDF</Button></div>
      <article className="mx-auto min-h-[297mm] max-w-[210mm] bg-white p-6 md:p-10 text-black shadow-sm print:shadow-none">
        <header className="border-b-4 border-primary pb-6 text-center"><h1 className="text-5xl font-black tracking-widest">ESTIMATE</h1><p className="mt-2 text-lg font-black text-red-700">NOT A TAX INVOICE</p><p className="text-sm">No GST is charged or collected. Not valid for input tax credit.</p></header>
        <section className="grid grid-cols-2 gap-8 py-6 border-b"><div><h2 className="text-xl font-black">{settings?.storeName || 'PharmaFlow'}</h2><p>{settings?.address}</p><p>{settings?.phone}</p>{settings?.gstNumber && <p>GSTIN (identity only): {settings.gstNumber}</p>}</div><div className="text-right"><p className="font-black">{estimate.estimateNumber}</p><p>Date: {formatDate(estimate.createdAt)}</p><p>Valid until: {formatDate(estimate.validUntil)}</p></div></section>
        <section className="py-5"><p className="text-xs font-bold uppercase text-gray-500">Estimate for</p><p className="text-xl font-black">{estimate.customerName}</p>{estimate.customerPhone && <p>{estimate.customerPhone}</p>}{estimate.customerAddress && <p>{estimate.customerAddress}</p>}</section>
        <table className="w-full border-collapse"><thead><tr className="border-y bg-gray-100"><th className="p-3 text-left">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">Discount</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{estimate.items.map((item, index) => <tr key={index} className="border-b"><td className="p-3 font-bold">{item.name}</td><td className="p-3 text-right">{item.quantity}</td><td className="p-3 text-right">{formatCurrency(item.rate)}</td><td className="p-3 text-right">{formatCurrency(item.discount)}</td><td className="p-3 text-right font-bold">{formatCurrency(item.total)}</td></tr>)}</tbody></table>
        <section className="ml-auto mt-6 max-w-sm space-y-2 text-right"><p>Subtotal: {formatCurrency(estimate.subtotal)}</p><p>Discount: {formatCurrency(estimate.discount)}</p><p>GST: ₹0.00</p><p className="border-t pt-2 text-2xl font-black">Estimate Total: {formatCurrency(estimate.grandTotal)}</p></section>
        {estimate.notes && <section className="mt-8"><p className="font-bold">Notes</p><p>{estimate.notes}</p></section>}
        <footer className="mt-12 border-t pt-5 text-xs text-gray-600"><p>{estimate.terms}</p><p className="mt-2 font-bold">This estimate does not evidence supply, payment, stock movement or tax liability. Final prices and availability are confirmed only on a valid sale invoice.</p><p className="mt-8 text-right">Generated {toJsDate(estimate.createdAt).toLocaleString('en-IN')}</p></footer>
      </article>
    </div>
  );
}
