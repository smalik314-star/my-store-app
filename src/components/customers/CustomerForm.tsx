import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, User, Phone, Mail, MapPin, CreditCard, Save } from 'lucide-react';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { customerService } from '../../services/customerService';
import { Customer } from '../../types';

interface CustomerFormProps {
  onClose: () => void;
  editingCustomer?: Customer;
}

export default function CustomerForm({ onClose, editingCustomer }: CustomerFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: editingCustomer?.name || '',
    phone: editingCustomer?.phone || '',
    email: editingCustomer?.email || '',
    address: editingCustomer?.address || '',
    gstNumber: editingCustomer?.gstNumber || '',
    outstandingBalance: editingCustomer?.outstandingBalance || 0,
    totalPurchases: editingCustomer?.totalPurchases || 0,
    totalPaid: editingCustomer?.totalPaid || 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic Validation
    if (!formData.name || !formData.phone || !formData.address) {
      setError('Name, Phone, and Address are required.');
      setLoading(false);
      return;
    }

    // Phone Validation (Indian 10-digit)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(formData.phone)) {
      setError('Please enter a valid 10-digit Indian phone number.');
      setLoading(false);
      return;
    }

    try {
      if (editingCustomer) {
        await customerService.updateCustomer(editingCustomer.id, formData);
      } else {
        await customerService.addCustomer(formData);
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl"
      >
        <Card className="p-0 overflow-hidden border-border shadow-2xl">
          <div className="p-6 border-b border-border bg-background/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-black text-text tracking-tight">
                  {editingCustomer ? 'Edit Profile' : 'New Customer'}
                </h2>
                <p className="text-[10px] font-bold text-text/30 uppercase tracking-widest">
                  Customer relationship management
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-background rounded-xl transition-colors">
              <X className="h-5 w-5 text-text/30" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {error && (
              <div className="p-4 bg-danger/5 border border-danger/10 rounded-2xl flex items-center gap-3 text-danger text-xs font-bold animate-shake">
                <X className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Full Name</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Phone Number</label>
                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
                  <input
                    required
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                    placeholder="e.g. 9876543210"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Email Address (Optional)</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                    placeholder="rahul@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">GST Number (Optional)</label>
                <div className="relative group">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    value={formData.gstNumber}
                    onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold"
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-text/40 uppercase tracking-widest ml-1">Full Address</label>
              <div className="relative group">
                <MapPin className="absolute left-4 top-4 h-4 w-4 text-text/20 group-focus-within:text-primary transition-colors" />
                <textarea
                  required
                  rows={3}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-background focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none text-sm font-bold resize-none"
                  placeholder="Street name, Area, City, Pincode"
                />
              </div>
            </div>

            <div className="pt-4 flex gap-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose} 
                className="flex-1 font-black uppercase text-[10px] tracking-widest h-14 rounded-2xl"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="primary" 
                isLoading={loading}
                leftIcon={<Save className="h-5 w-5" />}
                className="flex-1 font-black uppercase text-[10px] tracking-widest h-14 rounded-2xl shadow-xl shadow-primary/20"
              >
                {editingCustomer ? 'Update Profile' : 'Register Customer'}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
