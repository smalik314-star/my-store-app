import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Customer } from '../../types';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { 
  Users, 
  Search, 
  Plus, 
  UserPlus, 
  Phone, 
  Mail, 
  MapPin, 
  ArrowUpDown, 
  MoreVertical,
  ChevronRight,
  ExternalLink,
  Trash2,
  Filter,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { useNavigate } from 'react-router-dom';
import CustomerForm from '../../components/customers/CustomerForm';
import { PageTransition } from '../../components/common/PageTransition';
import { useToast } from '../../context/ToastContext';
import { SkeletonTable } from '../../components/common/Skeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { customerService } from '../../services/customerService';

import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { matchesSearchQuery } from '../../utils/search';

export default function Customers() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'DUE' | 'HIGH_DUE'>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);
  
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.tenantId) return;
    setLoading(true);
    const q = query(
      collection(db, 'customers'), 
      where('tenantId', '==', user.tenantId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const items = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        } as Customer)).filter(customer => customer.recordStatus !== 'inactive');

        // Client-side sort by name
        items.sort((a, b) => a.name.localeCompare(b.name));

        setCustomers(items);
        setLoading(false);
      } catch (err) {
        console.error('Customers Processing Error:', err);
        setLoading(false);
      }
    }, (error) => {
      console.error('Customers List Error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = matchesSearchQuery(searchTerm, c.name, c.phone);
      
      const matchesTab = 
        activeTab === 'ALL' ? true :
        activeTab === 'DUE' ? c.outstandingBalance > 0 :
        activeTab === 'HIGH_DUE' ? c.outstandingBalance > 5000 : true;

      return matchesSearch && matchesTab;
    });
  }, [customers, searchTerm, activeTab]);

  const stats = useMemo(() => {
    return {
      total: customers.length,
      withDues: customers.filter(c => c.outstandingBalance > 0).length,
      totalOutstanding: customers.reduce((acc, c) => acc + c.outstandingBalance, 0)
    };
  }, [customers]);

  const handleDelete = async (id: string) => {
    try {
      if (!user?.tenantId) throw new Error('Tenant session not found.');
      await customerService.deleteCustomer(user.tenantId, id);
      showToast('Customer archived successfully', 'success');
      setDeleteConfirm(null);
    } catch (error: any) {
      console.error(error);
      showToast(error.message || 'Failed to archive customer', 'danger');
    }
  };

  const getStatusBadge = (balance: number) => {
    if (balance > 5000) return <Badge variant="danger" className="font-black">HIGH DUE</Badge>;
    if (balance > 0) return <Badge variant="warning" className="font-black">DUE</Badge>;
    return <Badge variant="success" className="font-black">ACTIVE</Badge>;
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div className="h-10 w-48 bg-text/5 animate-pulse rounded-lg" />
          <div className="h-12 w-32 bg-text/5 animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-surface rounded-3xl border border-border animate-pulse" />
          ))}
        </div>
        <SkeletonTable rows={10} />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-text tracking-tight flex items-center gap-4">
            Customer CRM
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
          </h1>
          <p className="text-[10px] font-black text-text/30 uppercase tracking-[0.3em] mt-2">
            Managing {customers.length} registered pharmacy clients
          </p>
        </div>
        
        <Button 
          variant="primary" 
          onClick={() => {
            setEditingCustomer(undefined);
            setShowForm(true);
          }}
          leftIcon={<Plus className="h-5 w-5" />} 
          className="font-black shadow-xl shadow-primary/20 h-14 px-8 rounded-2xl"
        >
          Add New Customer
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border-border/50 bg-surface/50 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-text/40 uppercase tracking-widest">Total Clients</span>
            <Users className="h-5 w-5 text-text/20" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-text">{stats.total}</span>
            <span className="text-[10px] font-bold text-text/20 uppercase">Registered</span>
          </div>
        </Card>

        <Card className="p-6 border-warning/20 bg-warning/5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-warning uppercase tracking-widest">Active Dues</span>
            <AlertCircle className="h-5 w-5 text-warning/40" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-warning">{stats.withDues}</span>
            <span className="text-[10px] font-bold text-warning/40 uppercase">Customers</span>
          </div>
        </Card>

        <Card className="p-6 border-danger/20 bg-danger/5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-danger uppercase tracking-widest">Total Outstanding</span>
            <div className="h-5 w-5 text-danger/40 font-black">₹</div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black text-danger">{formatCurrency(stats.totalOutstanding)}</span>
            <span className="text-[10px] font-bold text-danger/40 uppercase">Receivable</span>
          </div>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="overflow-hidden border-border bg-surface">
        <div className="p-6 border-b border-border bg-background/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-1 p-1 bg-background/50 rounded-2xl border border-border w-fit overflow-x-auto scrollbar-none">
            {[
              { id: 'ALL', label: 'All Clients' },
              { id: 'DUE', label: 'Outstanding' },
              { id: 'HIGH_DUE', label: 'High Priority' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                  activeTab === tab.id 
                    ? "bg-primary text-white shadow-lg shadow-primary/20" 
                    : "text-text/40 hover:text-text hover:bg-background"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
            />
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background/20 border-b border-border">
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Customer Info</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Contact Details</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-center">Purchases</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-center">Outstanding</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest">Status</th>
                <th className="px-6 py-5 text-[10px] font-black text-text/40 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <AnimatePresence mode="popLayout">
                {filteredCustomers.map((customer) => (
                  <motion.tr
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={customer.id}
                    className="group hover:bg-background/30 transition-all cursor-pointer"
                    onClick={() => navigate(`/customers/${customer.id}`)}
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-sm">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-text group-hover:text-primary transition-colors">{customer.name}</span>
                          <span className="text-[10px] font-bold text-text/30 uppercase tracking-wider">ID: {customer.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-text/60">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </div>
                        {customer.email && (
                          <div className="flex items-center gap-2 text-[10px] text-text/30 font-bold lowercase">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-text">{formatCurrency(customer.totalPurchases)}</span>
                        <span className="text-[8px] font-black text-text/30 uppercase">Lifetime</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className={cn(
                        "inline-flex flex-col p-2 rounded-xl min-w-[100px]",
                        customer.outstandingBalance > 0 ? "bg-danger/5 border border-danger/10" : "bg-success/5 border border-success/10"
                      )}>
                        <span className={cn(
                          "text-sm font-black",
                          customer.outstandingBalance > 0 ? "text-danger" : "text-success"
                        )}>
                          {formatCurrency(customer.outstandingBalance)}
                        </span>
                        <span className="text-[8px] font-black opacity-40 uppercase">Dues</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {getStatusBadge(customer.outstandingBalance)}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all" onClick={e => e.stopPropagation()}>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-9 w-9 p-0 rounded-xl hover:bg-primary/10 hover:text-primary"
                          onClick={() => {
                            setEditingCustomer(customer);
                            setShowForm(true);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-9 w-9 p-0 rounded-xl hover:bg-danger/10 hover:text-danger"
                          onClick={() => setDeleteConfirm({ id: customer.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-9 w-9 p-0 rounded-xl"
                          onClick={() => navigate(`/customers/${customer.id}`)}
                        >
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden divide-y divide-border/50">
          {filteredCustomers.map((customer) => (
            <div 
              key={customer.id} 
              className="p-6 space-y-4 hover:bg-background/30 transition-colors"
              onClick={() => navigate(`/customers/${customer.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-lg">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-text">{customer.name}</span>
                    <span className="text-[10px] font-bold text-text/30 uppercase tracking-widest">{customer.phone}</span>
                  </div>
                </div>
                {getStatusBadge(customer.outstandingBalance)}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-background/50 rounded-xl border border-border/50">
                  <span className="text-[8px] font-black text-text/30 uppercase block mb-1">Total Spent</span>
                  <span className="text-sm font-black text-text">{formatCurrency(customer.totalPurchases)}</span>
                </div>
                <div className={cn(
                  "p-3 rounded-xl border",
                  customer.outstandingBalance > 0 ? "bg-danger/5 border-danger/10" : "bg-success/5 border-success/10"
                )}>
                  <span className="text-[8px] font-black text-text/30 uppercase block mb-1">Outstanding</span>
                  <span className={cn(
                    "text-sm font-black",
                    customer.outstandingBalance > 0 ? "text-danger" : "text-success"
                  )}>
                    {formatCurrency(customer.outstandingBalance)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredCustomers.length === 0 && (
          <EmptyState 
            title="No customers found" 
            description="Start building your relationship management by adding your first customer."
            icon={<Users className="h-20 w-20" />}
            className="py-32"
            action={
              <Button 
                variant="primary" 
                onClick={() => setShowForm(true)}
                className="font-black uppercase text-[10px] tracking-widest px-8"
              >
                Add First Customer
              </Button>
            }
          />
        )}
      </Card>

      <ConfirmModal 
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        title="Archive Customer"
        message="Archive this customer? Invoice history stays intact, but the customer will no longer appear in active billing and CRM lists."
        confirmText="Archive Customer"
        variant="danger"
      />

      <AnimatePresence>
        {showForm && (
          <CustomerForm 
            onClose={() => setShowForm(false)} 
            editingCustomer={editingCustomer}
          />
        )}
      </AnimatePresence>
    </div>
    </PageTransition>
  );
}
