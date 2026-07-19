import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import { Invoice, Customer } from '../../types';
import { logFirestoreOperation } from '../../utils/firestore-errors';
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
  FileText,
  X,
  RefreshCw,
  Send,
  Check,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { InvoiceTemplate } from '../../components/billing/InvoiceTemplate';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { PageTransition } from '../../components/common/PageTransition';
import { useToast } from '../../context/ToastContext';
import { toJsDate } from '../../utils/date';

const diagnosePdfError = (error: any): { title: string; message: string; actionableAdvice: string[] } => {
  const msg = (error?.message || '').toLowerCase();
  const stack = (error?.stack || '').toLowerCase();

  let title = 'PDF Generation Interrupted';
  let message = 'An unexpected issue occurred while rendering the invoice into a high-quality PDF document.';
  let actionableAdvice = [
    'Try the "Print" option next to PDF Export and select "Save as PDF" from your system print destination — this uses your browser\'s native high-performance rendering engine.',
    'Ensure you are using a modern desktop browser like Chrome, Edge, or Firefox for optimal PDF export compatibility.',
    'Check your internet connection to ensure all styles, logos, and fonts have finished loading successfully.'
  ];

  if (msg.includes('canvas') || msg.includes('todataurl') || msg.includes('tainted') || msg.includes('cors') || stack.includes('cors')) {
    title = 'Security & Asset Restrictions';
    message = 'We could not capture the invoice because some images or styling files have cross-origin (CORS) security restrictions.';
    actionableAdvice = [
      'Click the "Print" button and choose "Save as PDF" as the destination. This completely bypasses external asset restrictions.',
      'If you added a custom company logo, ensure the logo URL is public and supports cross-origin requests.',
      'Reload the page and try again once the network is stable.'
    ];
  } else if (msg.includes('oklch') || msg.includes('oklab') || msg.includes('color(')) {
    title = 'Unsupported Styling Formats';
    message = 'Your invoice template uses modern CSS color formats (oklch/oklab) that are too advanced for our offline PDF engine.';
    actionableAdvice = [
      'Use the browser\'s native "Print" utility by clicking the "Print" button and choosing "Save as PDF". The browser supports all advanced colors perfectly.',
      'Change your app theme or template settings to use standard hex/RGB colors.',
      'Retry downloading. We attempted to automatically clean up and convert these colors for you.'
    ];
  } else if (msg.includes('quota') || msg.includes('memory') || msg.includes('allocated') || msg.includes('size')) {
    title = 'Memory / Resolution Limit Exceeded';
    message = 'The invoice canvas size is too large for your browser\'s memory constraints, which is common on mobile devices.';
    actionableAdvice = [
      'Use the "Print" button to save/print the document instead of "PDF Export". This uses zero extra browser canvas memory.',
      'If you are on a mobile phone or tablet, try generating the PDF on a desktop computer.',
      'Reduce the size of any loaded images or custom logos to lower the memory footprint.'
    ];
  } else if (msg.includes('timeout') || msg.includes('failed to fetch')) {
    title = 'Network Connection Timeout';
    message = 'A network error occurred while downloading fonts or styles required to render the PDF.';
    actionableAdvice = [
      'Verify you have a stable internet connection and try again.',
      'Use the browser\'s "Print" option as a secure offline alternative.',
      'Clear your browser cache and refresh the page before retrying.'
    ];
  }

  return { title, message, actionableAdvice };
};

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfError, setPdfError] = useState<{ 
    title: string; 
    message: string; 
    actionableAdvice: string[]; 
    technicalMessage?: string;
    technicalStack?: string;
  } | null>(null);
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<'a4' | 'thermal'>('a4');
  const [showTechDetails, setShowTechDetails] = useState(false);
  
  const printRef = useRef<HTMLDivElement>(null);

  // Sharing States
  const [showShareModal, setShowShareModal] = useState(false);
  const [activeShareTab, setActiveShareTab] = useState<'whatsapp' | 'email'>('whatsapp');
  const [sharePhone, setSharePhone] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [shareSubject, setShareSubject] = useState('');
  const [shareBody, setShareBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [emailResult, setEmailResult] = useState<{ success: boolean; previewUrl?: string; message?: string } | null>(null);

  // PDF Benchmark States
  const [benchmarkResult, setBenchmarkResult] = useState<{
    originalSizeKB: number;
    optimizedSizeKB: number;
    savedKB: number;
    savedPercent: number;
  } | null>(null);
  const [isCalculatingBenchmark, setIsCalculatingBenchmark] = useState(false);

  const runSizeBenchmark = async () => {
    if (!invoice) return;
    setIsCalculatingBenchmark(true);
    try {
      console.log('[Benchmark] Running size comparison...');
      
      // 1. Generate unoptimized PDF (Scale 2, PNG, no compression)
      console.log('[Benchmark] Generating original PDF (unoptimized)...');
      const originalPdf = await generatePDFInstance({ scale: 2, format: 'png', quality: 1, compress: false });
      const originalBlob = originalPdf.output('blob');
      const originalSizeKB = Math.round(originalBlob.size / 1024);
      
      // 2. Generate optimized PDF (Scale 1.5, JPEG 75%, compress: true)
      console.log('[Benchmark] Generating optimized PDF...');
      const optimizedPdf = await generatePDFInstance({ scale: 1.5, format: 'jpeg', quality: 0.75, compress: true });
      const optimizedBlob = optimizedPdf.output('blob');
      const optimizedSizeKB = Math.round(optimizedBlob.size / 1024);
      
      const savedKB = originalSizeKB - optimizedSizeKB;
      const savedPercent = Math.round((savedKB / originalSizeKB) * 100);
      
      setBenchmarkResult({
        originalSizeKB,
        optimizedSizeKB,
        savedKB,
        savedPercent
      });
      console.log(`[Benchmark] Done! Original: ${originalSizeKB} KB, Optimized: ${optimizedSizeKB} KB (Saved ${savedPercent}%)`);
    } catch (err) {
      console.error('[Benchmark] Error running size comparison:', err);
    } finally {
      setIsCalculatingBenchmark(false);
    }
  };

  useEffect(() => {
    if (showShareModal && invoice && !benchmarkResult && !isCalculatingBenchmark) {
      const timer = setTimeout(() => {
        runSizeBenchmark();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showShareModal, invoice, benchmarkResult]);

  const handleOpenShare = () => {
    if (!invoice) return;
    setSharePhone(customer?.phone || '');
    setShareEmail(customer?.email || '');
    setShareSubject(`Invoice #${invoice.invoiceNumber} from PharmaFlow Store`);
    setShareBody(
      `Dear ${customer?.name || invoice.customerName || 'Customer'},\n\nPlease find attached the invoice #${invoice.invoiceNumber} for your recent purchase.\n\nInvoice Details:\n- Number: ${invoice.invoiceNumber}\n- Date: ${invoice.createdAt ? toJsDate(invoice.createdAt).toLocaleDateString() : 'Today'}\n- Grand Total: ₹${invoice.grandTotal}\n- Payment Status: ${invoice.paymentStatus.toUpperCase()}\n\nThank you for choosing PharmaFlow!\nBest regards,\nPharmaFlow Team`
    );
    setEmailResult(null);
    setBenchmarkResult(null); // Reset benchmark
    setShowShareModal(true);
  };

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    logFirestoreOperation('subscribe', `invoices/${id}`, 'pending');

    const unsubInvoice = onSnapshot(doc(db, 'invoices', id), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = { ...docSnapshot.data(), id: docSnapshot.id } as Invoice;
        logFirestoreOperation('snapshot_received', `invoices/${id}`, 'success', {
          id: docSnapshot.id,
          invoiceNumber: data.invoiceNumber,
          customerId: data.customerId,
          grandTotal: data.grandTotal,
          paymentStatus: data.paymentStatus
        });
        setInvoice(data);
        if (!data.customerId || data.customerId === 'walk-in') {
          setCustomer(null);
          setLoading(false);
        }
      } else {
        logFirestoreOperation('snapshot_received', `invoices/${id}`, 'success', {
          exists: false
        });
        setInvoice(null);
        setCustomer(null);
        setLoading(false);
      }
    }, (error) => {
      logFirestoreOperation('subscribe', `invoices/${id}`, 'failure', null, error);
      console.error('Error fetching invoice:', error);
      setLoading(false);
    });

    return () => {
      logFirestoreOperation('unsubscribe', `invoices/${id}`, 'success');
      unsubInvoice();
    };
  }, [id]);

  useEffect(() => {
    if (!invoice?.customerId || invoice.customerId === 'walk-in') {
      setCustomer(null);
      return;
    }

    logFirestoreOperation('subscribe', `customers/${invoice.customerId}`, 'pending');

    const unsubCustomer = onSnapshot(doc(db, 'customers', invoice.customerId), (custSnapshot) => {
      if (custSnapshot.exists()) {
        const data = { ...custSnapshot.data(), id: custSnapshot.id } as Customer;
        logFirestoreOperation('snapshot_received', `customers/${invoice.customerId}`, 'success', {
          id: custSnapshot.id,
          name: data.name,
          phone: data.phone
        });
        setCustomer(data);
      } else {
        logFirestoreOperation('snapshot_received', `customers/${invoice.customerId}`, 'success', {
          exists: false
        });
        setCustomer(null);
      }
      setLoading(false);
    }, (error) => {
      logFirestoreOperation('subscribe', `customers/${invoice.customerId}`, 'failure', null, error);
      console.error('Error fetching customer:', error);
      setLoading(false);
    });

    return () => {
      logFirestoreOperation('unsubscribe', `customers/${invoice.customerId}`, 'success');
      unsubCustomer();
    };
  }, [invoice?.customerId]);

  const handlePrint = () => {
    navigate(`/invoice/${id}/print`);
  };

  const generatePDFInstance = async (options?: {
    scale?: number;
    format?: 'png' | 'jpeg';
    quality?: number;
    compress?: boolean;
  }): Promise<jsPDF> => {
    if (!printRef.current || !invoice) {
      throw new Error('Invoice print area not rendered or invoice data is missing.');
    }
    
    const scale = options?.scale ?? 1.5;
    const format = options?.format ?? 'jpeg';
    const quality = options?.quality ?? 0.75;
    const compress = options?.compress ?? true;

    console.log(`[PDF Export] Starting PDF generation flow for invoice: ${invoice.invoiceNumber}`, {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      hasCustomerData: !!customer,
      isOnline: navigator.onLine,
      currentUserId: auth?.currentUser?.uid || 'none',
      timestamp: new Date().toISOString(),
      options: { scale, format, quality, compress }
    });

    // === DIAGNOSTIC UTILITY: LOG FULL INVOICE DATA AND IMAGE STRUCTURE ===
    console.group('=== PDF GENERATION DIAGNOSTICS ===');
    console.log('[Diagnostics] Invoice Data Structure:', JSON.parse(JSON.stringify(invoice)));
    console.log('[Diagnostics] Associated Customer:', customer ? JSON.parse(JSON.stringify(customer)) : 'None (Walk-In Customer)');
    
    try {
      const imgElements = Array.from(printRef.current.querySelectorAll('img'));
      console.log(`[Diagnostics] Found ${imgElements.length} image element(s) in print area:`);
      
      const imgDiagnostics = imgElements.map((img, idx) => {
        const src = img.getAttribute('src') || '';
        const isBase64 = src.startsWith('data:image/');
        const isBlob = src.startsWith('blob:');
        const isExternal = !isBase64 && !isBlob && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//'));
        
        return {
          elementIndex: idx,
          id: img.id || 'N/A',
          className: img.className || 'N/A',
          crossOrigin: img.getAttribute('crossorigin') || img.crossOrigin || 'none',
          referrerPolicy: img.getAttribute('referrerpolicy') || img.referrerPolicy || 'none',
          isBase64,
          isBlob,
          isExternal,
          srcType: isBase64 ? 'Base64 Encoded' : isBlob ? 'Blob URL' : isExternal ? 'External HTTP/S URL' : 'Relative URL',
          srcLength: src.length,
          srcPreview: src.length > 120 ? `${src.substring(0, 120)}...` : src,
          loaded: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        };
      });
      
      if (imgDiagnostics.length > 0) {
        console.table(imgDiagnostics);
        
        // Highlight any potential CORS risks
        const corsRisks = imgDiagnostics.filter(img => img.isExternal && img.crossOrigin !== 'anonymous');
        if (corsRisks.length > 0) {
          console.warn('[Diagnostics] WARNING: Found external image(s) WITHOUT crossOrigin="anonymous". This WILL cause Canvas Tainting and break PDF export!', corsRisks);
        } else {
          console.log('[Diagnostics] Image configurations checked. No high-risk external image patterns without CORS attribute detected.');
        }
      } else {
        console.log('[Diagnostics] No physical <img> elements detected inside the invoice print area.');
      }
    } catch (err) {
      console.error('[Diagnostics] Failed to extract image structures from print area:', err);
    }
    console.groupEnd();
    // === END DIAGNOSTIC UTILITY ===

    const tempStyleElements: HTMLStyleElement[] = [];
    const styleRestorations: { element: HTMLStyleElement; originalText: string }[] = [];
    const linkRestorations: { element: HTMLLinkElement; originalDisabled: boolean }[] = [];
    const inlineStyleRestorations: { element: HTMLElement; originalStyle: string | null }[] = [];
    let originalAdopted: any[] = [];
    let clearedAdopted = false;

    // Helper to safely replace any oklch/oklab/color expressions with valid rgb definitions
    const cleanOklchAndOklab = (cssText: string): string => {
      // Replace gradient color-space interpolation keywords "in oklab" / "in oklch" with standard "in srgb"
      // to prevent html2canvas's gradient parser from failing.
      let cleaned = cssText
        .replace(/\bin\s+oklab\b/gi, 'in srgb')
        .replace(/\bin\s+oklch\b/gi, 'in srgb');
      
      // Replace oklch, oklab, and color() functions (which don't have nested parens after this)
      cleaned = cleaned.replace(/oklch\s*\([^)]*\)/gi, 'rgb(15, 118, 110)');
      cleaned = cleaned.replace(/oklab\s*\([^)]*\)/gi, 'rgb(15, 118, 110)');
      cleaned = cleaned.replace(/color\s*\([^)]*\)/gi, 'rgb(15, 118, 110)');
      
      // Replace color-mix functions which might be left over
      cleaned = cleaned.replace(/color-mix\s*\([^)]*\)/gi, 'rgb(15, 118, 110)');
      
      return cleaned;
    };

    try {
      console.log('Preprocessing stylesheets for html2canvas compatibility...');

      // 1. Process adopted stylesheets if they exist
      if ((document as any).adoptedStyleSheets && (document as any).adoptedStyleSheets.length > 0) {
        try {
          originalAdopted = Array.from((document as any).adoptedStyleSheets);
          for (const sheet of originalAdopted) {
            try {
              let cssText = '';
              for (const rule of Array.from(sheet.cssRules as any)) {
                cssText += (rule as any).cssText + '\n';
              }
              if (cssText) {
                const cleanedCSS = cleanOklchAndOklab(cssText);
                const tempStyle = document.createElement('style');
                tempStyle.textContent = cleanedCSS;
                document.head.appendChild(tempStyle);
                tempStyleElements.push(tempStyle);
              }
            } catch (e) {
              console.warn('Could not read adopted stylesheet rules:', e);
            }
          }
          (document as any).adoptedStyleSheets = [];
          clearedAdopted = true;
        } catch (err) {
          console.warn('Failed to process adoptedStyleSheets:', err);
        }
      }

      // 2. Process all physical <style> elements in the DOM
      const styleElements = Array.from(document.querySelectorAll('style'));
      for (const el of styleElements) {
        // Skip any temporary styles we might have just appended
        if (tempStyleElements.includes(el)) continue;

        try {
          const cssText = el.textContent || '';
          const lowerCSS = cssText.toLowerCase();
          const hasUnsupportedColors = lowerCSS.includes('oklch') || lowerCSS.includes('oklab') || lowerCSS.includes('color(');
          
          if (hasUnsupportedColors) {
            const cleanedCSS = cleanOklchAndOklab(cssText);
            styleRestorations.push({ element: el, originalText: cssText });
            el.textContent = cleanedCSS;
            console.log('[PDF Export] Cleaned unsupported colors in physical <style> element');
          }
        } catch (e) {
          console.warn('Error cleaning physical style element:', el, e);
        }
      }

      // 3. Process all <link rel="stylesheet"> elements
      const linkElements = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
      for (const link of linkElements) {
        try {
          const href = link.href;
          const originalDisabled = link.disabled;
          
          let fetchedCSS = '';
          let fetchSuccess = false;
          
          // Try to fetch local/same-origin stylesheets
          if (href && (href.startsWith(window.location.origin) || href.startsWith('/') || !href.startsWith('http'))) {
            try {
              const response = await fetch(href);
              if (response.ok) {
                fetchedCSS = await response.text();
                fetchSuccess = true;
              }
            } catch (fetchErr) {
              console.warn('Failed to fetch local link stylesheet:', href, fetchErr);
            }
          }

          if (fetchSuccess && fetchedCSS) {
            const lowerCSS = fetchedCSS.toLowerCase();
            const hasUnsupportedColors = lowerCSS.includes('oklch') || lowerCSS.includes('oklab') || lowerCSS.includes('color(');
            
            if (hasUnsupportedColors) {
              const cleanedCSS = cleanOklchAndOklab(fetchedCSS);
              const tempStyle = document.createElement('style');
              tempStyle.textContent = cleanedCSS;
              document.head.appendChild(tempStyle);
              tempStyleElements.push(tempStyle);
              
              // Disable the original link element so html2canvas doesn't try to parse it
              link.disabled = true;
              linkRestorations.push({ element: link, originalDisabled });
              console.log('[PDF Export] Replaced local <link> with cleaned <style> element:', href);
            }
          } else {
            // For cross-origin or un-fetchable links, we MUST disable them during generation
            // because they might contain unsupported colors that would crash html2canvas
            link.disabled = true;
            linkRestorations.push({ element: link, originalDisabled });
            console.log('[PDF Export] Disabled un-fetchable external <link>:', href);
          }
        } catch (linkErr) {
          console.warn('Error processing link element:', link, linkErr);
        }
      }

      // 4. Clean inline style attributes of all elements inside the print area
      if (printRef.current) {
        const elementsWithStyle = printRef.current.querySelectorAll('[style]');
        elementsWithStyle.forEach((el: any) => {
          const styleAttr = el.getAttribute('style');
          if (styleAttr && (styleAttr.includes('oklch') || styleAttr.includes('oklab') || styleAttr.includes('color('))) {
            const cleanedStyle = cleanOklchAndOklab(styleAttr);
            inlineStyleRestorations.push({ element: el as HTMLElement, originalStyle: styleAttr });
            el.setAttribute('style', cleanedStyle);
          }
        });
      }

      console.log('Generating PDF from printRef...');
      console.log('[PDF Export] Capturing element with html2canvas. Current document stylesheets count:', document.styleSheets.length);
      const canvas = await html2canvas(printRef.current, {
        scale: scale,
        useCORS: true,
        logging: true, // Enable logging for debugging
        backgroundColor: '#ffffff',
        windowWidth: 1200 // Force standard desktop viewport width during capture to prevent mobile layout squishing
      });
      
      console.log('Canvas generated successfully:', canvas.width, 'x', canvas.height);
      console.log('[PDF Export] html2canvas rendering complete. Initiating jsPDF output creation.');
      
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const imgData = canvas.toDataURL(mimeType, format === 'jpeg' ? quality : undefined);
      
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: compress
      });
      
      const imgWidth = 210; 
      const pageHeight = 297; 
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      
      let position = 0;
      
      const pdfFormat = format === 'jpeg' ? 'JPEG' : 'PNG';
      pdf.addImage(imgData, pdfFormat, 0, position, imgWidth, imgHeight, undefined, compress ? 'FAST' : undefined);
      heightLeft -= pageHeight;
      
      // Use strict > 0 to prevent empty/duplicate pages on single-page invoices
      while (heightLeft > 0.5) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, pdfFormat, 0, position, imgWidth, imgHeight, undefined, compress ? 'FAST' : undefined);
        heightLeft -= pageHeight;
      }
      
      return pdf;
    } finally {
      // Clean up temporary styles
      tempStyleElements.forEach(el => el.remove());

      // Restore physical <style> elements
      styleRestorations.forEach(({ element, originalText }) => {
        element.textContent = originalText;
      });

      // Restore <link> elements
      linkRestorations.forEach(({ element, originalDisabled }) => {
        element.disabled = originalDisabled;
      });

      // Restore inline styles
      inlineStyleRestorations.forEach(({ element, originalStyle }) => {
        if (originalStyle === null) {
          element.removeAttribute('style');
        } else {
          element.setAttribute('style', originalStyle);
        }
      });

      // Restore adopted stylesheets
      if (clearedAdopted && originalAdopted.length > 0) {
        (document as any).adoptedStyleSheets = originalAdopted;
      }
    }
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const pdf = await generatePDFInstance();
      console.log('[PDF Export] Writing PDF binary. Name:', `Invoice_${invoice!.invoiceNumber}.pdf`);
      pdf.save(`Invoice_${invoice!.invoiceNumber}.pdf`);
      console.log('[PDF Export] PDF export operation completed successfully.');
      showToast('PDF generated and downloaded successfully', 'success');
    } catch (error: any) {
      console.error('Failed to generate PDF. Full exception details:');
      console.error(error);
      if (error && error.stack) {
        console.error('=== PDF GENERATION ERROR STACK TRACE ===');
        console.error(error.stack);
        console.error('========================================');
      }
      console.error('[PDF Export] Exception details:', {
        message: error?.message || String(error),
        stack: error?.stack,
        invoiceId: invoice?.id,
        isOnline: navigator?.onLine,
        timestamp: new Date().toISOString()
      });
      
      const diagnosis = diagnosePdfError(error);
      setPdfError({
        ...diagnosis,
        technicalMessage: error?.message || String(error),
        technicalStack: error?.stack || 'No stack trace available.'
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleWhatsAppShare = async () => {
    if (!invoice) return;
    setIsSendingWhatsApp(true);
    try {
      let cleanedPhone = sharePhone.replace(/\D/g, '');
      if (cleanedPhone.length === 10) {
        cleanedPhone = '91' + cleanedPhone;
      }
      
      const message = `Hello, here are the details of your invoice from PharmaFlow:\n\n` +
        `Invoice Number: ${invoice.invoiceNumber}\n` +
        `Customer Name: ${customer?.name || invoice.customerName || 'Walk-In Customer'}\n` +
        `Total Amount: ₹${invoice.grandTotal}\n` +
        `Payment Status: ${invoice.paymentStatus.toUpperCase()}\n` +
        `Date: ${invoice.createdAt ? toJsDate(invoice.createdAt).toLocaleDateString() : 'Today'}\n\n` +
        `Thank you for your business!`;
        
      const whatsappUrl = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
      showToast('WhatsApp sharing link opened successfully!', 'success');
      setShowShareModal(false);
    } catch (err: any) {
      console.error(err);
      showToast('Failed to share via WhatsApp: ' + (err.message || err), 'danger');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const handleEmailShare = async () => {
    if (!invoice) return;
    setIsSendingEmail(true);
    setEmailResult(null);
    try {
      console.log('[Email Share] Rendering PDF in background...');
      const pdf = await generatePDFInstance();
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Please sign in again before sending email.');
      
      console.log('[Email Share] Sending request to express backend endpoint...');
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          to: shareEmail.trim(),
          subject: shareSubject.trim(),
          body: shareBody,
          invoiceId: invoice.id,
          pdfBase64,
          filename: `Invoice_${invoice.invoiceNumber}.pdf`
        })
      });
      
      const result = await response.json();
      if (response.ok) {
        setEmailResult({
          success: true,
          previewUrl: result.previewUrl,
          message: result.message || 'Email sent successfully!'
        });
        showToast('Invoice shared via Email successfully!', 'success');
      } else {
        throw new Error(result.error || 'Failed to send email');
      }
    } catch (err: any) {
      console.error('[Email Share] Failed to share invoice via Email:', err);
      setEmailResult({
        success: false,
        message: err.message || 'An error occurred while sending the email.'
      });
      showToast('Email sharing failed: ' + (err.message || err), 'danger');
    } finally {
      setIsSendingEmail(false);
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
            variant="outline" 
            className="font-bold border-border bg-surface h-12 px-6"
            onClick={handleOpenShare}
            leftIcon={<Share2 className="h-4 w-4" />}
          >
            Share
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

      <AnimatePresence>
        {pdfError && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm no-print">
            <div className="absolute inset-0 cursor-default" onClick={() => { setPdfError(null); setShowTechDetails(false); }} />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative w-full max-w-lg bg-surface border border-border rounded-[2.5rem] shadow-2xl p-6 md:p-8 overflow-hidden z-10"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-danger" />
              
              <button 
                onClick={() => { setPdfError(null); setShowTechDetails(false); }}
                className="absolute top-6 right-6 p-2 rounded-xl text-text/30 hover:text-text hover:bg-text/5 transition-all"
                aria-label="Close error notice"
              >
                <X className="h-5 w-5" />
              </button>
 
              <div className="flex flex-col items-center text-center sm:items-start sm:text-left gap-6">
                <div className="h-14 w-14 rounded-2xl bg-danger/10 text-danger flex items-center justify-center shrink-0">
                  <AlertCircle className="h-7 w-7" />
                </div>
 
                <div className="space-y-2 w-full">
                  <h3 className="text-xl font-black text-text uppercase tracking-tight">
                    {pdfError.title}
                  </h3>
                  <p className="text-sm font-semibold text-text/60 leading-relaxed">
                    {pdfError.message}
                  </p>
                </div>
              </div>
 
              {/* Expandable Technical Exception Box */}
              {pdfError.technicalMessage && (
                <div className="mt-5 border border-border bg-background/50 rounded-2xl overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => setShowTechDetails(!showTechDetails)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-text/[0.02] hover:bg-text/[0.04] text-[10px] font-black uppercase tracking-wider text-text/50 transition-colors"
                  >
                    <span>Technical Error details</span>
                    <span className="text-xs">{showTechDetails ? 'Hide' : 'Show'}</span>
                  </button>
                  
                  {showTechDetails && (
                    <div className="p-4 border-t border-border font-mono text-[10px] text-danger/90 leading-relaxed max-h-40 overflow-y-auto select-all bg-danger/[0.02] space-y-2">
                      <div>
                        <strong className="text-text/70">Message:</strong> {pdfError.technicalMessage}
                      </div>
                      {pdfError.technicalStack && (
                        <div>
                          <strong className="text-text/70">Stack Trace:</strong>
                          <pre className="mt-1 font-mono text-[9px] text-text/40 overflow-x-auto whitespace-pre-wrap leading-tight">
                            {pdfError.technicalStack}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
 
              <div className="mt-5 bg-danger/5 border border-danger/10 rounded-2xl p-5 space-y-4">
                <p className="text-[10px] font-black text-danger uppercase tracking-widest">
                  Actionable Recommendations:
                </p>
                <div className="space-y-3">
                  {pdfError.actionableAdvice.map((advice, idx) => (
                    <div key={idx} className="flex gap-3 text-xs font-bold text-text/70 leading-relaxed">
                      <span className="text-danger mt-0.5">•</span>
                      <span>{advice}</span>
                    </div>
                  ))}
                </div>
              </div>
 
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPdfError(null);
                    setShowTechDetails(false);
                    setTimeout(() => {
                      handleDownloadPDF();
                    }, 100);
                  }}
                  leftIcon={<RefreshCw className="h-4 w-4 animate-spin-slow" />}
                  className="w-full sm:flex-1 h-12 uppercase text-[10px] tracking-widest font-black border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary"
                >
                  Retry Export
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setPdfError(null);
                    setShowTechDetails(false);
                    handlePrint();
                  }}
                  leftIcon={<Printer className="h-4 w-4" />}
                  className="w-full sm:flex-1 h-12 uppercase text-[10px] tracking-widest font-black shadow-lg shadow-primary/20"
                >
                  Print Fallback
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setPdfError(null); setShowTechDetails(false); }}
                  className="w-full sm:w-auto h-12 uppercase text-[10px] tracking-widest font-black hover:bg-text/5 text-text/40 hover:text-text/60 border border-transparent"
                >
                  Dismiss
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {showShareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm no-print">
            <div className="absolute inset-0 cursor-default" onClick={() => setShowShareModal(false)} />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative w-full max-w-xl bg-surface border border-border rounded-[2.5rem] shadow-2xl p-6 md:p-8 overflow-hidden z-10 text-text"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary" />
              
              <button 
                onClick={() => setShowShareModal(false)}
                className="absolute top-6 right-6 p-2 rounded-xl text-text/30 hover:text-text hover:bg-text/5 transition-all"
                aria-label="Close share modal"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-6">
                <h3 className="text-xl font-black text-text uppercase tracking-tight">Share Invoice</h3>
                <p className="text-xs font-semibold text-text/40 mt-1">Select your preferred channel to share {invoice.invoiceNumber}</p>
              </div>

              {/* Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-background/50 border border-border rounded-2xl mb-6">
                <button
                  onClick={() => { setActiveShareTab('whatsapp'); setEmailResult(null); }}
                  className={cn(
                    "flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                    activeShareTab === 'whatsapp' ? "bg-success/10 text-success border border-success/10" : "text-text/40 hover:text-text"
                  )}
                >
                  <Phone className="h-4 w-4" />
                  WhatsApp
                </button>
                <button
                  onClick={() => { setActiveShareTab('email'); setEmailResult(null); }}
                  className={cn(
                    "flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                    activeShareTab === 'email' ? "bg-primary/10 text-primary border border-primary/10" : "text-text/40 hover:text-text"
                  )}
                >
                  <Mail className="h-4 w-4" />
                  Email
                </button>
              </div>

              {activeShareTab === 'whatsapp' ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1 mb-2 block">Recipient Phone Number</label>
                    <input
                      type="tel"
                      value={sharePhone}
                      onChange={(e) => setSharePhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full h-12 px-4 bg-background border border-border rounded-xl focus:border-success focus:ring-4 focus:ring-success/5 transition-all font-bold text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1 mb-2 block">Message Summary Preview</label>
                    <div className="p-4 bg-background border border-border rounded-xl text-xs font-semibold text-text/60 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                      Hello, here are the details of your invoice from PharmaFlow:
                      {"\n\n"}
                      Invoice Number: {invoice.invoiceNumber}{"\n"}
                      Customer Name: {customer?.name || invoice.customerName || 'Walk-In Customer'}{"\n"}
                      Total Amount: ₹{invoice.grandTotal}{"\n"}
                      Payment Status: {invoice.paymentStatus.toUpperCase()}{"\n"}
                      Date: {invoice.createdAt ? toJsDate(invoice.createdAt).toLocaleDateString() : 'Today'}{"\n\n"}
                      Thank you for your business!
                    </div>
                  </div>

                  <Button
                    onClick={handleWhatsAppShare}
                    isLoading={isSendingWhatsApp}
                    variant="primary"
                    className="w-full h-14 rounded-2xl bg-success hover:bg-success/90 text-white font-black uppercase tracking-wider text-xs shadow-lg shadow-success/10 mt-2"
                    leftIcon={<Send className="h-4 w-4" />}
                  >
                    Share via WhatsApp Web
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1 mb-2 block">Recipient Email Address</label>
                    <input
                      type="email"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full h-12 px-4 bg-background border border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-bold text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1 mb-2 block">Email Subject</label>
                    <input
                      type="text"
                      value={shareSubject}
                      onChange={(e) => setShareSubject(e.target.value)}
                      placeholder="Email subject"
                      className="w-full h-12 px-4 bg-background border border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-bold text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1 mb-2 block">Email Message Body</label>
                    <textarea
                      rows={4}
                      value={shareBody}
                      onChange={(e) => setShareBody(e.target.value)}
                      className="w-full p-4 bg-background border border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-bold text-xs leading-relaxed"
                    />
                  </div>

                  <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <p className="text-[10px] font-bold text-primary/80 uppercase tracking-wider leading-normal">
                      The high-quality invoice PDF will be automatically generated and attached to this email.
                    </p>
                  </div>

                  {emailResult && (
                    <div className={cn(
                      "p-5 rounded-2xl border flex flex-col gap-3",
                      emailResult.success ? "bg-success/5 border-success/20 text-success" : "bg-danger/5 border-danger/20 text-danger"
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                          emailResult.success ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                        )}>
                          {emailResult.success ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                        </div>
                        <div className="text-xs font-black uppercase tracking-wider">
                          {emailResult.success ? 'Email Sent Successfully' : 'Sending Failed'}
                        </div>
                      </div>
                      <p className="text-[11px] font-bold opacity-80 leading-relaxed pl-11">
                        {emailResult.message}
                      </p>
                      {emailResult.previewUrl && (
                        <div className="pl-11 mt-1">
                          <a 
                            href={emailResult.previewUrl} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-success/10 text-success hover:bg-success/20 px-4 py-2 rounded-xl transition-all"
                          >
                            Open Ethereal Mail Preview Box
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={handleEmailShare}
                    isLoading={isSendingEmail}
                    variant="primary"
                    className="w-full h-14 rounded-2xl font-black uppercase tracking-wider text-xs shadow-lg shadow-primary/20 mt-2"
                    leftIcon={<Send className="h-4 w-4" />}
                  >
                    Generate PDF & Send Email
                  </Button>
                </div>
              )}

              {/* PDF Size Optimizer Report */}
              <div className="mt-6 pt-6 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-text/40">
                      ⚡ PDF Size Optimizer Active
                    </span>
                  </div>
                  {isCalculatingBenchmark ? (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-primary animate-pulse uppercase">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Measuring Benefit...
                    </div>
                  ) : benchmarkResult ? (
                    <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                      -{benchmarkResult.savedPercent}% Smaller File
                    </span>
                  ) : null}
                </div>

                {isCalculatingBenchmark ? (
                  <div className="p-4 bg-background/50 border border-border rounded-2xl flex flex-col items-center justify-center gap-2 h-20 text-center">
                    <RefreshCw className="h-5 w-5 text-text/30 animate-spin" />
                    <p className="text-[10px] font-bold text-text/40 uppercase tracking-wider">Analyzing invoice structure and measuring size comparison...</p>
                  </div>
                ) : benchmarkResult ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-background border border-border/60 rounded-xl flex flex-col justify-between">
                      <span className="text-[9px] font-bold text-text/40 uppercase tracking-wider">Before (Standard PNG)</span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-sm font-black text-text/60 line-through">
                          {benchmarkResult.originalSizeKB} KB
                        </span>
                        <span className="text-[9px] font-bold text-rose-500/80 bg-rose-500/5 px-1.5 py-0.5 rounded">🔴 Bloated</span>
                      </div>
                    </div>
                    <div className="p-3 bg-emerald-500/[0.03] border border-emerald-500/20 rounded-xl flex flex-col justify-between">
                      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">After (Optimized JPEG)</span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-base font-black text-emerald-500">
                          {benchmarkResult.optimizedSizeKB} KB
                        </span>
                        <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">🟢 Standard</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-background/50 border border-border rounded-xl flex justify-between items-center">
                    <span className="text-[10px] font-bold text-text/40 uppercase tracking-wider">Optimization Report Ready</span>
                    <button 
                      onClick={runSizeBenchmark}
                      className="text-[9px] font-black uppercase tracking-widest text-primary hover:text-primary-dark"
                    >
                      Analyze Sizes
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
