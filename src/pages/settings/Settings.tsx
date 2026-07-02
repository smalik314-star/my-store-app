import React, { useState, useEffect } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { 
  Building2, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  CreditCard, 
  Percent, 
  Settings as SettingsIcon,
  Save,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Hash,
  Type,
  Clock,
  Calendar,
  ChevronRight,
  Globe,
  Loader2,
  FileText,
  Trash2
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';
import { cn } from '../../utils/cn';
import { PageTransition } from '../../components/common/PageTransition';
import { useToast } from '../../context/ToastContext';
import { SkeletonForm } from '../../components/common/Skeleton';
import { AnimatePresence } from 'motion/react';

export default function Settings() {
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();
  
  const [formData, setFormData] = useState({
    storeName: '',
    ownerName: '',
    phone: '',
    email: '',
    address: '',
    gstNumber: '',
    logoURL: '',
    invoiceFooterText: '',
    currency: '₹',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h' as '12h' | '24h',
    taxMode: true,
    cgstRate: 9,
    sgstRate: 9,
    invoicePrefix: 'INV',
    themeMode: 'light' as 'light' | 'dark'
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        storeName: settings.storeName || '',
        ownerName: settings.ownerName || '',
        phone: settings.phone || '',
        email: settings.email || '',
        address: settings.address || '',
        gstNumber: settings.gstNumber || '',
        logoURL: settings.logoURL || '',
        invoiceFooterText: settings.invoiceFooterText || '',
        currency: settings.currency || '₹',
        dateFormat: settings.dateFormat || 'DD/MM/YYYY',
        timeFormat: settings.timeFormat || '12h',
        taxMode: settings.taxMode ?? true,
        cgstRate: settings.cgstRate ?? 9,
        sgstRate: settings.sgstRate ?? 9,
        invoicePrefix: settings.invoicePrefix || 'INV',
        themeMode: settings.themeMode || 'light'
      });
    }
  }, [settings]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: val
    }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', 'danger');
      return;
    }

    setUploadingLogo(true);
    try {
      const storageRef = ref(storage, `logos/store_logo_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setFormData(prev => ({ ...prev, logoURL: url }));
      showToast('Logo uploaded successfully', 'success');
    } catch (error) {
      console.error('Error uploading logo:', error);
      showToast('Failed to upload logo', 'danger');
    } finally {
      setUploadingLogo(false);
    }
  };

  const validateGST = (gst: string) => {
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return regex.test(gst);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.storeName || !formData.phone || !formData.email) {
      showToast('Please fill in all required fields', 'danger');
      return;
    }

    if (formData.gstNumber && !validateGST(formData.gstNumber)) {
      showToast('Invalid GST number format', 'danger');
      return;
    }

    setIsSaving(true);
    try {
      await updateSettings(formData);
      showToast('Settings updated successfully', 'success');
    } catch (error) {
      showToast('Failed to save settings', 'danger');
    } finally {
      setIsSaving(false);
    }
  };

  if (settingsLoading) {
    return (
      <div className="p-4 md:p-8 space-y-8 max-w-[1200px] mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-text/5 animate-pulse rounded-lg" />
            <div className="h-4 w-64 bg-text/5 animate-pulse rounded-lg" />
          </div>
          <div className="h-12 w-32 bg-text/5 animate-pulse rounded-lg" />
        </div>
        <SkeletonForm />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-8 space-y-8 max-w-[1200px] mx-auto pb-20">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-text tracking-tight uppercase">System Settings</h1>
          <p className="text-sm font-bold text-text/40 flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            Configure your store profile and application preferences
          </p>
        </div>

        <Button 
          variant="primary" 
          onClick={handleSubmit}
          isLoading={isSaving}
          leftIcon={<Save className="h-4 w-4" />}
          className="h-12 px-8 font-black uppercase text-xs tracking-widest"
        >
          Save Changes
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Store Information */}
        <Card className="p-8 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-text/40">Store Information</h3>
              <p className="text-[10px] font-bold text-text/20">Basic details of your pharmacy</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              label="Store Name"
              name="storeName"
              value={formData.storeName}
              onChange={handleInputChange}
              placeholder="Enter Pharmacy Name"
              required
            />
            <Input
              label="Owner Name"
              name="ownerName"
              value={formData.ownerName}
              onChange={handleInputChange}
              placeholder="Enter Owner Name"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Phone Number"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="+91 XXXXX XXXXX"
                required
              />
              <Input
                label="Email Address"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="store@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-text/40 mb-1.5 ml-1">
                Store Address
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold text-text placeholder:text-text/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none min-h-[100px]"
                placeholder="Full address of the pharmacy"
              />
            </div>
          </div>
        </Card>

        {/* Tax Configuration */}
        <Card className="p-8 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Percent className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-text/40">Tax Configuration</h3>
              <p className="text-[10px] font-bold text-text/20">GST and tax calculation settings</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-background border border-border rounded-2xl">
              <div className="space-y-0.5">
                <p className="text-sm font-black text-text uppercase">GST Mode</p>
                <p className="text-[10px] font-bold text-text/40">Enable/Disable tax on invoices</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  name="taxMode"
                  checked={formData.taxMode}
                  onChange={handleInputChange}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className={cn("space-y-4", !formData.taxMode && "opacity-40 pointer-events-none")}>
              <Input
                label="GST Number"
                name="gstNumber"
                value={formData.gstNumber}
                onChange={handleInputChange}
                placeholder="22AAAAA0000A1Z5"
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="CGST Rate (%)"
                  name="cgstRate"
                  type="number"
                  value={formData.cgstRate}
                  onChange={handleInputChange}
                  placeholder="9"
                />
                <Input
                  label="SGST Rate (%)"
                  name="sgstRate"
                  type="number"
                  value={formData.sgstRate}
                  onChange={handleInputChange}
                  placeholder="9"
                />
              </div>
              <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-primary/60 leading-relaxed">
                  Default Indian GST is 18% (9% CGST + 9% SGST). You can modify these based on your specific tax bracket.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Invoice Settings */}
        <Card className="p-8 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-text/40">Invoice Branding</h3>
              <p className="text-[10px] font-bold text-text/20">Appearance and formatting of bills</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col items-center p-6 bg-background border border-border border-dashed rounded-3xl space-y-4">
              {formData.logoURL ? (
                <div className="relative group">
                  <img src={formData.logoURL} alt="Logo" className="h-24 w-auto object-contain rounded-lg" />
                  <button 
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, logoURL: '' }))}
                    className="absolute -top-2 -right-2 h-6 w-6 bg-danger text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="h-24 w-24 rounded-2xl bg-surface border border-border flex items-center justify-center text-text/10">
                  {uploadingLogo ? <Loader2 className="h-8 w-8 animate-spin" /> : <ImageIcon className="h-8 w-8" />}
                </div>
              )}
              
              <div className="flex flex-col items-center">
                <label className="cursor-pointer">
                  <span className="px-4 py-2 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all inline-block">
                    {formData.logoURL ? 'Change Logo' : 'Upload Logo'}
                  </span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                </label>
                <p className="text-[9px] font-bold text-text/30 mt-2 uppercase tracking-widest">A4 Layout Recommendation: 200x200px</p>
              </div>
            </div>

            <Input
              label="Invoice Number Prefix"
              name="invoicePrefix"
              value={formData.invoicePrefix}
              onChange={handleInputChange}
              placeholder="INV"
            />

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-text/40 mb-1.5 ml-1">
                Invoice Footer Text
              </label>
              <textarea
                name="invoiceFooterText"
                value={formData.invoiceFooterText}
                onChange={handleInputChange}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold text-text placeholder:text-text/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none min-h-[80px]"
                placeholder="Thank you for your business!"
              />
            </div>
          </div>
        </Card>

        {/* System Preferences */}
        <Card className="p-8 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-text/40">System Preferences</h3>
              <p className="text-[10px] font-bold text-text/20">Regional and interface settings</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-text/40 mb-1.5 ml-1">
                  Currency
                </label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleInputChange}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                >
                  <option value="₹">₹ INR (Indian Rupee)</option>
                  <option value="$">$ USD (US Dollar)</option>
                  <option value="€">€ EUR (Euro)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-text/40 mb-1.5 ml-1">
                  Time Format
                </label>
                <select
                  name="timeFormat"
                  value={formData.timeFormat}
                  onChange={handleInputChange}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                >
                  <option value="12h">12-Hour (AM/PM)</option>
                  <option value="24h">24-Hour</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-text/40 mb-1.5 ml-1">
                Date Format
              </label>
              <select
                name="dateFormat"
                value={formData.dateFormat}
                onChange={handleInputChange}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>

            <div className="pt-4 space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-text/30">Theme Selection</h4>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, themeMode: 'light' }))}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                    formData.themeMode === 'light' ? "border-primary bg-primary/5" : "border-border bg-background grayscale opacity-50"
                  )}
                >
                  <div className="h-10 w-full bg-white border border-border rounded-lg" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Light Mode</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, themeMode: 'dark' }))}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                    formData.themeMode === 'dark' ? "border-primary bg-primary/5" : "border-border bg-background grayscale opacity-50"
                  )}
                >
                  <div className="h-10 w-full bg-[#0a0a0a] border border-white/10 rounded-lg" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Dark Mode</span>
                </button>
              </div>
            </div>
          </div>
        </Card>
      </form>

      <div className="p-6 bg-surface border border-border rounded-3xl flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-success/10 text-success flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-black text-text">System Configuration Complete</p>
            <p className="text-[10px] font-bold text-text/40 uppercase">All changes are synced in real-time across the platform</p>
          </div>
        </div>
        <Button 
          variant="primary" 
          onClick={handleSubmit}
          isLoading={isSaving}
          className="h-12 px-10 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20"
        >
          Save All Settings
        </Button>
      </div>
    </div>
    </PageTransition>
  );
}
