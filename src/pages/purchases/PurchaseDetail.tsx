import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { purchaseService } from '../../services/purchaseService';
import { Purchase, PurchaseItem } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/PageTransition';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { 
  ArrowLeft, 
  Printer, 
  Truck, 
  Calendar, 
  FileText, 
  User, 
  Info, 
  Tag 
} from 'lucide-react';

export default function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user?.tenantId) return;
    loadPurchaseDetails();
  }, [id, user]);

  const loadPurchaseDetails = async () => {
    setLoading(true);
    try {
      if (!user?.tenantId || !id) return;
      const data = await purchaseService.getPurchaseById(user.tenantId, id);
      if (!data) {
        showToast('Purchase entry not found', 'danger');
        navigate('/purchases');
        return;
      }
      setPurchase(data);
      const purchaseItems = await purchaseService.getPurchaseItems(id);
      setItems(purchaseItems);
    } catch (error) {
      console.error('Error loading purchase details:', error);
      showToast('Error loading purchase details', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-[1200px] mx-auto space-y-8 animate-pulse">
        <div className="h-10 w-48 bg-text/5 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-40 bg-surface rounded-2xl border border-border" />
          <div className="h-40 bg-surface rounded-2xl border border-border" />
        </div>
        <div className="h-96 bg-surface rounded-2xl border border-border" />
      </div>
    );
  }

  if (!purchase) {
    return null;
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-8 max-w-[1200px] mx-auto space-y-8 print:p-0">
        
        {/* Back and Action Buttons */}
        <div className="flex justify-between items-center no-print">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/purchases')}
            className="rounded-xl flex items-center gap-2 hover:bg-text/5 text-text/80 font-bold"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Purchase History
          </Button>
          <Button 
            onClick={handlePrint}
            variant="outline"
            className="rounded-xl flex items-center gap-2 border-border text-text hover:bg-text/5 font-bold h-11 px-5"
          >
            <Printer className="h-5 w-5" />
            Print Receipt
          </Button>
        </div>

        {/* Printable Voucher Section */}
        <div className="space-y-8 print:space-y-6">
          {/* Header Title */}
          <div className="flex justify-between items-start border-b border-border pb-6">
            <div>
              <div className="flex items-center gap-3">
                <Truck className="h-8 w-8 text-primary print:text-black" />
                <h1 className="text-3xl font-black text-text print:text-black tracking-tight">Stock Purchase Voucher</h1>
              </div>
              <p className="text-text/60 mt-1 font-medium">Purchase Number: <span className="font-mono font-bold text-primary print:text-black">{purchase.purchaseNumber}</span></p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-4 py-1.5 text-sm font-black text-emerald-500 print:border print:border-black print:text-black">
                RECEIVED
              </span>
              <p className="text-xs text-text/40 font-mono mt-1 font-bold">Logged: {formatDate(purchase.createdAt)}</p>
            </div>
          </div>

          {/* Supplier & Invoice metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 space-y-4 border border-border rounded-3xl bg-surface print:shadow-none print:border">
              <h3 className="text-lg font-black text-text print:text-black flex items-center gap-2">
                <User className="h-5 w-5 text-primary print:text-black" />
                Supplier Information
              </h3>
              <div className="space-y-2 text-sm text-text/80 font-medium">
                <p className="text-base font-bold text-text print:text-black">{purchase.supplierName}</p>
                <p>Contact / ID: {purchase.supplierId}</p>
                <p className="text-text/60">Registered on platform for stock tracking</p>
              </div>
            </Card>

            <Card className="p-6 space-y-4 border border-border rounded-3xl bg-surface print:shadow-none print:border">
              <h3 className="text-lg font-black text-text print:text-black flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary print:text-black" />
                Purchase Details
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm font-semibold">
                <div>
                  <p className="text-text/50">Supplier Invoice #</p>
                  <p className="text-text print:text-black mt-0.5">{purchase.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-text/50">Invoice Date</p>
                  <p className="text-text print:text-black mt-0.5">{formatDate(purchase.invoiceDate)}</p>
                </div>
                <div>
                  <p className="text-text/50">Items count</p>
                  <p className="text-text print:text-black mt-0.5">{purchase.itemsCount} lines</p>
                </div>
                <div>
                  <p className="text-text/50">Grand Total</p>
                  <p className="text-text print:text-black mt-0.5 font-bold">{formatCurrency(purchase.totalAmount)}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Items Table */}
          <Card className="overflow-hidden border border-border rounded-3xl bg-surface print:shadow-none print:border">
            <div className="px-6 py-4 border-b border-border bg-text/[0.02]">
              <h3 className="text-lg font-black text-text print:text-black">Items List</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-text/[0.01]">
                    <th className="px-6 py-3.5 text-xs font-bold text-text/60 uppercase tracking-wider">Product Name</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-text/60 uppercase tracking-wider">Batch No</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-text/60 uppercase tracking-wider text-center">Dates (Mfg / Exp)</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-text/60 uppercase tracking-wider text-right">Purchase Price</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-text/60 uppercase tracking-wider text-right">Sale Price</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-text/60 uppercase tracking-wider text-center">Qty</th>
                    <th className="px-6 py-3.5 text-xs font-bold text-text/60 uppercase tracking-wider text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-text/[0.01] transition-all">
                      <td className="px-6 py-4.5 font-bold text-text print:text-black">
                        {item.productName}
                      </td>
                      <td className="px-6 py-4.5 font-mono font-semibold text-sm">
                        {item.batchNumber}
                      </td>
                      <td className="px-6 py-4.5 text-center text-sm font-medium">
                        <span className="text-text/50">M:</span> {formatDate(item.mfgDate, { month: '2-digit', year: 'numeric' })}
                        <span className="mx-2 text-text/20">|</span>
                        <span className="text-text/50">E:</span> {formatDate(item.expiryDate, { month: '2-digit', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4.5 text-right font-semibold text-text print:text-black">
                        {formatCurrency(item.purchasePrice)}
                      </td>
                      <td className="px-6 py-4.5 text-right font-semibold text-text print:text-black">
                        {formatCurrency(item.salePrice)}
                      </td>
                      <td className="px-6 py-4.5 text-center font-bold text-text print:text-black">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4.5 text-right font-black text-text print:text-black">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total summary row */}
            <div className="p-6 bg-text/[0.02] border-t border-border flex justify-between items-center">
              <div>
                {purchase.notes && (
                  <p className="text-sm font-semibold text-text/60">
                    <span className="text-text font-black block">Voucher Notes:</span>
                    {purchase.notes}
                  </p>
                )}
              </div>
              <div className="text-right space-y-1">
                <p className="text-sm font-bold text-text/50">Grand Total Amount</p>
                <p className="text-3xl font-black text-text print:text-black">{formatCurrency(purchase.totalAmount)}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
