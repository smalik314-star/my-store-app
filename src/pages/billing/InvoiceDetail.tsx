import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Invoice, Customer } from '../../types';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { 
  ArrowLeft, 
  Printer, 
  Download, 
  Share2, 
  Mail, 
  Phone, 
  MapPin, 
  CreditCard,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Package,
  Building2,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { InvoiceTemplate } from '../../components/billing/InvoiceTemplate';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PageTransition } from '../../components/common/PageTransition';
import { useToast } from '../../context/ToastContext';

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<'a4' | 'thermal'>('a4');
  
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;

    const unsubInvoice = onSnapshot(doc(db, 'invoices', id), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = { ...docSnapshot.data(), id: docSnapshot.id } as Invoice;
        setInvoice(data);
        
        // Fetch customer info if not walk-in
        if (data.customerId && data.customerId !== 'walk-in') {
          const unsubCustomer = onSnapshot(doc(db, 'customers', data.customerId), (custSnapshot) => {
            if (custSnapshot.exists()) {
              setCustomer({ ...custSnapshot.data(), id: custSnapshot.id } as Customer);
            }
          });
          return () => unsubCustomer();
        }
      } else {
        setInvoice(null);
      }
      setLoading(false);
    });

    return () => unsubInvoice();
  }, [id]);

  const handlePrint = () => {
    navigate(`/invoice/${id}/print`);
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current || !invoice) return;
    
    setIsGeneratingPDF(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210; 
      const pageHeight = 297; 
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`Invoice_${invoice.invoiceNumber}.pdf`);
      showToast('PDF generated and downloaded successfully', 'success');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      showToast('Failed to generate PDF. Please try again.', 'danger');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-[1000px] mx-auto space-y-8">
        <div className="flex justify-between items-center mb-8">
          <div className="h-12 w-48 bg-text/5 animate-pulse rounded-2xl" />
          <div className="h-12 w-64 bg-text/5 animate-pulse rounded-2xl" />
        </div>
        <div className="h-[700px] w-full bg-surface rounded-[2.5rem] border border-border animate-pulse shadow-sm" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="h-20 w-20 rounded-3xl bg-danger/10 text-danger flex items-center justify-center mx-auto">
          <AlertCircle className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-black text-text">Invoice Not Found</h2>
        <p className="text-sm font-bold text-text/40">The invoice record might have been deleted or moved.</p>
        <Button variant="primary" onClick={() => navigate('/invoices')} className="mt-4 font-black uppercase text-xs tracking-widest px-8 h-12">
          Back to Records
        </Button>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-8 max-w-[1000px] mx-auto space-y-8">

      {/* Action Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 no-print">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/invoices')}
            className="h-12 w-12 rounded-2xl bg-surface border border-border flex items-center justify-center hover:bg-background transition-colors group"
          >
            <ArrowLeft className="h-5 w-5 text-text/40 group-hover:text-primary transition-colors" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-text tracking-tight uppercase">
              {invoice.invoiceNumber}
            </h1>
            <p className="text-[10px] font-black text-text/30 uppercase tracking-[0.2em] mt-1">
              Billing Transaction Details
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-surface p-1 rounded-xl border border-border flex items-center gap-1 mr-2">
            <button 
              onClick={() => setViewMode('a4')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                viewMode === 'a4' ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-text/40 hover:text-text"
              )}
            >
              A4
            </button>
            <button 
              onClick={() => setViewMode('thermal')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                viewMode === 'thermal' ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-text/40 hover:text-text"
              )}
            >
              80mm
            </button>
          </div>
          <Button 
            variant="outline" 
            className="font-bold border-border bg-surface h-12 px-6"
            onClick={handlePrint}
            leftIcon={<Printer className="h-4 w-4" />}
          >
            Print
          </Button>
          <Button 
            variant="primary" 
            className="font-black shadow-lg shadow-primary/20 h-12 px-6"
            onClick={handleDownloadPDF}
            isLoading={isGeneratingPDF}
            leftIcon={<Download className="h-4 w-4" />}
          >
            PDF Export
          </Button>
        </div>
      </div>

      {/* Professional Invoice Template Wrapper */}
      <div className={cn(
        "shadow-2xl rounded-[2rem] overflow-hidden border border-border print:shadow-none print:border-none print:rounded-none bg-white",
        viewMode === 'thermal' ? "max-w-[80mm] mx-auto" : ""
      )}>
        <InvoiceTemplate 
          ref={printRef}
          invoice={invoice}
          customer={customer}
          variant={viewMode}
        />
      </div>

      {/* Footer Info */}
      <div className="no-print flex items-center justify-center gap-8 py-8 border-t border-border/50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
          <span className="text-[10px] font-black text-text/40 uppercase tracking-widest">Verified Sale</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <span className="text-[10px] font-black text-text/40 uppercase tracking-widest">Store Certified</span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .print-m-0 { margin: 0 !important; }
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}} />
    </div>
    </PageTransition>
  );
}
