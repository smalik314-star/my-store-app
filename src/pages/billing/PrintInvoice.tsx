import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Invoice, Customer } from '../../types';
import { InvoiceTemplate } from '../../components/billing/InvoiceTemplate';
import { Button } from '../../components/common/Button';
import { ArrowLeft, Printer, AlertCircle } from 'lucide-react';

export default function PrintInvoice() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      try {
        const invoiceDoc = await getDoc(doc(db, 'invoices', id));
        if (invoiceDoc.exists()) {
          const invData = { ...invoiceDoc.data(), id: invoiceDoc.id } as Invoice;
          setInvoice(invData);
          
          if (invData.customerId && invData.customerId !== 'walk-in') {
            const customerDoc = await getDoc(doc(db, 'customers', invData.customerId));
            if (customerDoc.exists()) {
              setCustomer({ ...customerDoc.data(), id: customerDoc.id } as Customer);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching print data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  useEffect(() => {
    if (!loading && invoice) {
      // Small delay to ensure everything is rendered
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, invoice]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-black text-text/40 uppercase tracking-widest">Preparing Print View...</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-sm">
          <div className="h-20 w-20 rounded-3xl bg-danger/10 text-danger flex items-center justify-center mx-auto">
            <AlertCircle className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-black text-text">Invoice Not Found</h2>
          <Button variant="primary" onClick={() => navigate('/invoices')} className="w-full">
            Back to Records
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white py-12 print:p-0">
      <div className="no-print fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-surface/80 backdrop-blur-xl border border-border p-2 rounded-2xl shadow-2xl">
        <button 
          onClick={() => navigate(`/invoice/${id}`)}
          className="h-10 px-4 rounded-xl hover:bg-background text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
          Close Preview
        </button>
        <div className="h-6 w-px bg-border" />
        <button 
          onClick={() => window.print()}
          className="h-10 px-6 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Printer className="h-4 w-4" />
          Print Now
        </button>
      </div>

      <div className="print:m-0">
        <InvoiceTemplate 
          invoice={invoice}
          customer={customer}
          className="shadow-2xl print:shadow-none"
        />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}} />
    </div>
  );
}
