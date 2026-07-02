import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Customer, Invoice } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { 
  ArrowLeft, 
  Phone, 
  Mail, 
  MapPin, 
  CreditCard, 
  Calendar,
  ShoppingBag,
  TrendingUp,
  Receipt,
  MoreVertical,
  ExternalLink,
  Plus,
  Edit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { formatCurrency } from '../../utils/currency';
import CustomerForm from '../../components/customers/CustomerForm';
import { useAuth } from '../../context/AuthContext';

export default function CustomerProfile() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!id || !user?.tenantId) return;

    // Fetch Customer
    const unsubCustomer = onSnapshot(doc(db, 'customers', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.tenantId === user.tenantId) {
          setCustomer({ ...data, id: docSnap.id } as Customer);
        } else {
          navigate('/customers');
        }
      }
      setLoading(false);
    });

    // Fetch Purchase History (Invoices)
    const q = query(
      collection(db, 'invoices'), 
      where('tenantId', '==', user.tenantId),
      where('customerId', '==', id),
      orderBy('createdAt', 'desc')
    );
    
    const unsubInvoices = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as Invoice));
      setInvoices(items);
    });

    return () => {
      unsubCustomer();
      unsubInvoices();
    };
  }, [id]);

  const stats = useMemo(() => {
    if (!customer) return null;
    return {
      totalPurchases: customer.totalPurchases,
      totalPaid: customer.totalPaid,
      outstanding: customer.outstandingBalance,
      invoiceCount: invoices.length,
      lastPurchase: invoices[0]?.createdAt?.toDate() || null
    };
  }, [customer, invoices]);

  if (loading) {
    return (
      <div className="p-8 flex flex-col gap-6 animate-pulse">
        <div className="h-8 w-32 bg-border rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-border rounded-3xl" />
          <div className="md:col-span-2 h-64 bg-border rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-black text-text">Customer Not Found</h2>
        <Button variant="primary" onClick={() => navigate('/customers')} className="mt-4">
          Back to CRM
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/customers')}
            className="h-12 w-12 rounded-2xl bg-surface border border-border flex items-center justify-center hover:bg-background transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-text/40" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-text tracking-tight flex items-center gap-3">
              {customer.name}
              {customer.outstandingBalance > 0 && (
                <Badge variant="warning" className="text-[10px] py-1">UNPAID DUES</Badge>
              )}
            </h1>
            <p className="text-[10px] font-black text-text/30 uppercase tracking-[0.2em] mt-1">
              Registered on {customer.createdAt?.toDate().toLocaleDateString()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="font-bold border-border bg-surface"
            onClick={() => setShowForm(true)}
          >
            Edit Profile
          </Button>
          <Button 
            variant="primary" 
            leftIcon={<Plus className="h-4 w-4" />} 
            className="font-black shadow-lg shadow-primary/20"
            onClick={() => navigate(`/invoices?customerId=${customer.id}`)}
          >
            Create Invoice
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <CustomerForm 
            onClose={() => setShowForm(false)} 
            editingCustomer={customer}
          />
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="space-y-6">
          <Card className="p-0 overflow-hidden border-border bg-surface">
            <div className="p-8 bg-primary/5 border-b border-border text-center">
              <div className="h-24 w-24 rounded-[2rem] bg-primary/10 border-4 border-surface shadow-xl flex items-center justify-center text-primary font-black text-3xl mx-auto mb-4">
                {customer.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-xl font-black text-text">{customer.name}</h2>
              <p className="text-[10px] font-black text-text/40 uppercase tracking-widest mt-1">Pharmacy Client</p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-4 group">
                <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center group-hover:border-primary/30 transition-colors">
                  <Phone className="h-4 w-4 text-text/30 group-hover:text-primary transition-colors" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">Phone</span>
                  <a href={`tel:${customer.phone}`} className="text-sm font-black text-text hover:text-primary transition-colors">{customer.phone}</a>
                </div>
              </div>

              {customer.email && (
                <div className="flex items-center gap-4 group">
                  <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center group-hover:border-primary/30 transition-colors">
                    <Mail className="h-4 w-4 text-text/30 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">Email</span>
                    <span className="text-sm font-black text-text truncate max-w-[200px]">{customer.email}</span>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-4 group">
                <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center group-hover:border-primary/30 transition-colors mt-1">
                  <MapPin className="h-4 w-4 text-text/30 group-hover:text-primary transition-colors" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">Address</span>
                  <span className="text-sm font-bold text-text leading-relaxed">{customer.address}</span>
                </div>
              </div>

              {customer.gstNumber && (
                <div className="flex items-center gap-4 group">
                  <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center group-hover:border-primary/30 transition-colors">
                    <CreditCard className="h-4 w-4 text-text/30 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-text/30 uppercase tracking-widest">GST Number</span>
                    <span className="text-sm font-black text-text uppercase tracking-widest">{customer.gstNumber}</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Financials & History */}
        <div className="lg:col-span-2 space-y-8">
          {/* Financial Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 border-border/50 bg-background/30">
              <div className="flex items-center justify-between mb-4">
                <ShoppingBag className="h-5 w-5 text-text/20" />
                <Badge variant="neutral" className="text-[8px] font-black">LIFETIME</Badge>
              </div>
              <span className="text-[10px] font-black text-text/40 uppercase tracking-widest block mb-1">Total Purchases</span>
              <span className="text-2xl font-black text-text">{formatCurrency(stats?.totalPurchases || 0)}</span>
            </Card>

            <Card className="p-6 border-success/20 bg-success/5">
              <div className="flex items-center justify-between mb-4">
                <TrendingUp className="h-5 w-5 text-success/40" />
                <Badge variant="success" className="text-[8px] font-black">PAID</Badge>
              </div>
              <span className="text-[10px] font-black text-success/40 uppercase tracking-widest block mb-1">Total Paid</span>
              <span className="text-2xl font-black text-success">{formatCurrency(stats?.totalPaid || 0)}</span>
            </Card>

            <Card className={cn(
              "p-6 border-warning/20 transition-all",
              (stats?.outstanding || 0) > 0 ? "bg-warning/10 border-warning/30" : "bg-background/30"
            )}>
              <div className="flex items-center justify-between mb-4">
                <Receipt className="h-5 w-5 text-warning/40" />
                <Badge variant="warning" className="text-[8px] font-black">RECEIVABLE</Badge>
              </div>
              <span className="text-[10px] font-black text-warning/60 uppercase tracking-widest block mb-1">Outstanding Balance</span>
              <span className={cn(
                "text-2xl font-black",
                (stats?.outstanding || 0) > 0 ? "text-warning" : "text-text"
              )}>
                {formatCurrency(stats?.outstanding || 0)}
              </span>
            </Card>
          </div>

          {/* History Table */}
          <Card className="overflow-hidden border-border bg-surface">
            <div className="p-6 border-b border-border bg-background/30 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-text uppercase tracking-widest">Purchase History</h3>
                <p className="text-[8px] font-bold text-text/30 uppercase mt-1">Transaction logs & invoice status</p>
              </div>
              <Button variant="outline" size="sm" className="font-black text-[10px] uppercase h-10 px-6">
                View All Invoices
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background/20 border-b border-border">
                    <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Invoice</th>
                    <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-center">Amount</th>
                    <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="group hover:bg-background/30 transition-all">
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-text uppercase group-hover:text-primary transition-colors">
                            #{invoice.invoiceNumber}
                          </span>
                          <span className="text-[8px] font-bold text-text/30 uppercase tracking-widest">
                            {invoice.items.length} items included
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-text/60">
                            {invoice.createdAt?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-[8px] font-bold text-text/20 uppercase">
                            {invoice.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="text-sm font-black text-text">{formatCurrency(invoice.grandTotal)}</span>
                      </td>
                      <td className="px-6 py-5">
                        <Badge 
                          variant={invoice.paymentStatus === 'paid' ? 'success' : invoice.paymentStatus === 'due' ? 'warning' : 'danger'}
                          className="font-black text-[9px]"
                        >
                          {invoice.paymentStatus.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <button className="p-2 hover:bg-background rounded-xl text-text/20 hover:text-text transition-all">
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center">
                          <Receipt className="h-12 w-12 text-text/10 mb-4" />
                          <span className="text-sm font-bold text-text/20 uppercase tracking-widest">No transaction history found</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
