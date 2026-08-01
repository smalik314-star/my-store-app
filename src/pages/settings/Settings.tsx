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
  Trash2,
  Database,
  UploadCloud,
  Sparkles,
  Download,
  BookOpen
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';
import { cn } from '../../utils/cn';
import { PageTransition } from '../../components/common/PageTransition';
import { useToast } from '../../context/ToastContext';
import { SkeletonForm } from '../../components/common/Skeleton';
import { motion, AnimatePresence } from 'motion/react';
import { medicineMasterService } from '../../services/medicineMasterService';
import { useAuth } from '../../context/AuthContext';
import { parseMedicineCsv } from '../../utils/medicineCsv';
import { useBusinessMode } from '../../context/BusinessModeContext';
import type { BusinessMode } from '../../types';

export default function Settings() {
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { user } = useAuth();
  const { mode: businessMode, updateMode } = useBusinessMode();
  const [selectedBusinessMode, setSelectedBusinessMode] = useState<BusinessMode>(businessMode);
  const [savingBusinessMode, setSavingBusinessMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();
  
  const [formData, setFormData] = useState({
    storeName: '',
    ownerName: '',
    phone: '',
    email: '',
    address: '',
    gstNumber: '',
    gstRegistrationType: 'regular' as 'regular' | 'composition' | 'unregistered',
    stateName: '',
    stateCode: '',
    drugLicenseNumber: '',
    annualAggregateTurnover: 0,
    einvoiceEnabled: false,
    logoURL: '',
    invoiceFooterText: '',
    currency: '₹',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h' as '12h' | '24h',
    taxMode: true,
    cgstRate: 9,
    sgstRate: 9,
    invoicePrefix: 'INV',
    themeMode: 'light' as 'light' | 'dark',
    showDashboardCharts: true
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Master Medicine Database states
  const [masterMedicineCount, setMasterMedicineCount] = useState<number>(0);
  const [importingMeds, setImportingMeds] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importingError, setImportingError] = useState<string | null>(null);

  const loadMasterCount = async () => {
    try {
      const count = await medicineMasterService.countMedicines();
      setMasterMedicineCount(count);
    } catch (err) {
      console.error('Error counting master medicines:', err);
    }
  };

  useEffect(() => {
    loadMasterCount();
  }, []);

  useEffect(() => {
    if (settings) {
      setFormData({
        storeName: settings.storeName || '',
        ownerName: settings.ownerName || '',
        phone: settings.phone || '',
        email: settings.email || '',
        address: settings.address || '',
        gstNumber: settings.gstNumber || '',
        gstRegistrationType: settings.gstRegistrationType || 'regular',
        stateName: settings.stateName || '',
        stateCode: settings.stateCode || '',
        drugLicenseNumber: settings.drugLicenseNumber || '',
        annualAggregateTurnover: settings.annualAggregateTurnover || 0,
        einvoiceEnabled: settings.einvoiceEnabled || false,
        logoURL: settings.logoURL || '',
        invoiceFooterText: settings.invoiceFooterText || '',
        currency: settings.currency || '₹',
        dateFormat: settings.dateFormat || 'DD/MM/YYYY',
        timeFormat: settings.timeFormat || '12h',
        taxMode: settings.taxMode ?? true,
        cgstRate: settings.cgstRate ?? 9,
        sgstRate: settings.sgstRate ?? 9,
        invoicePrefix: settings.invoicePrefix || 'INV',
        themeMode: settings.themeMode || 'light',
        showDashboardCharts: settings.showDashboardCharts ?? true
      });
    }
  }, [settings]);

  useEffect(() => {
    setSelectedBusinessMode(businessMode);
  }, [businessMode]);

  const saveBusinessMode = async () => {
    setSavingBusinessMode(true);
    try {
      await updateMode(selectedBusinessMode);
      showToast('Business workspace updated successfully.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Unable to update business workspace.', 'danger');
    } finally {
      setSavingBusinessMode(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: val
    }));
  };

  const uploadLogoFile = async (file: File) => {
    if (!user?.tenantId) {
      showToast('Your store profile is still loading. Please try again.', 'danger');
      return;
    }
    setUploadingLogo(true);
    try {
      const storageRef = ref(storage, `tenants/${user.tenantId}/logos/store-logo-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setFormData(prev => ({ ...prev, logoURL: url }));
      showToast('Logo uploaded and updated successfully. Save changes to persist.', 'success');
    } catch (error) {
      console.error('Error uploading logo:', error);
      showToast('Failed to upload logo. Please check storage configuration.', 'danger');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (PNG/JPG)', 'danger');
      return;
    }

    await uploadLogoFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (PNG/JPG)', 'danger');
      return;
    }

    await uploadLogoFile(file);
  };

  const handleMedicineCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingMeds(true);
    setImportProgress(0);
    setImportingError(null);

    try {
      const reader = new FileReader();
      
      const fileText = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read CSV file'));
        reader.readAsText(file);
      });

      const { medicines: parsedMedicines, skippedDiscontinued } = parseMedicineCsv(fileText);

      showToast(`Found ${parsedMedicines.length.toLocaleString()} medicines. Starting fast import...`, 'success');

      // Import in non-blocking batches
      await medicineMasterService.importInChunks(parsedMedicines, (progress) => {
        setImportProgress(progress);
      });

      showToast(`Successfully imported ${parsedMedicines.length.toLocaleString()} medicines!`, 'success');
      if (skippedDiscontinued) {
        showToast(`${skippedDiscontinued.toLocaleString()} discontinued medicines were safely skipped.`, 'info');
      }
      await loadMasterCount();
    } catch (err: any) {
      console.error('Import failed:', err);
      setImportingError(err.message || 'An unexpected error occurred during import.');
      showToast(err.message || 'Failed to import medicines', 'danger');
    } finally {
      setImportingMeds(false);
      e.target.value = '';
    }
  };

  const handleClearMasterDatabase = async () => {
    if (!window.confirm('Are you sure you want to clear all medicines from the Master Database? This will not affect your active store inventory.')) {
      return;
    }
    
    try {
      await medicineMasterService.clearMedicines();
      showToast('Master Medicine database cleared successfully.', 'success');
      await loadMasterCount();
    } catch (err) {
      console.error('Error clearing Master DB:', err);
      showToast('Failed to clear Master Database.', 'danger');
    }
  };

  const handleCloudMasterImport = async () => {
    setImportingMeds(true);
    setImportProgress(0);
    setImportingError(null);

    try {
      showToast('Downloading Master Medicines Dataset from Server...', 'info');
      const response = await fetch('/pharmaflow_medicines_master.csv');
      if (!response.ok) {
        throw new Error('Failed to download the master dataset file from the server.');
      }
      const fileText = await response.text();

      const { medicines: parsedMedicines, skippedDiscontinued } = parseMedicineCsv(fileText);

      showToast(`Found ${parsedMedicines.length.toLocaleString()} standard medicines. Starting high-speed import...`, 'success');

      // Import in non-blocking batches
      await medicineMasterService.importInChunks(parsedMedicines, (progress) => {
        setImportProgress(progress);
      });

      showToast(`Successfully imported all ${parsedMedicines.length.toLocaleString()} standard medicines!`, 'success');
      if (skippedDiscontinued) {
        showToast(`${skippedDiscontinued.toLocaleString()} discontinued medicines were safely skipped.`, 'info');
      }
      await loadMasterCount();
    } catch (err: any) {
      console.error('Cloud import failed:', err);
      setImportingError(err.message || 'An unexpected error occurred during cloud import.');
      showToast(err.message || 'Failed to download or import medicines', 'danger');
    } finally {
      setImportingMeds(false);
    }
  };

  const validateGST = (gst: string) => {
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return regex.test(gst);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.storeName.trim()) {
      showToast('Store name is required', 'danger');
      return;
    }

    if (formData.gstRegistrationType !== 'unregistered' && !formData.gstNumber) {
      showToast('GSTIN is required for regular or composition registration', 'danger');
      return;
    }
    if (formData.gstNumber && !validateGST(formData.gstNumber)) {
      showToast('Invalid GST number format', 'danger');
      return;
    }
    if (formData.gstRegistrationType !== 'regular' && formData.taxMode) {
      showToast('Only a regular GST taxpayer can collect GST on a tax invoice.', 'danger');
      return;
    }

    setIsSaving(true);
    try {
      await updateSettings({ ...formData, currency: '₹' });
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
        {user?.role === 'owner' && (
          <Card className="md:col-span-2 p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-text/60">Business Workspace</h3>
                <p className="text-[10px] font-bold text-text/30">Choose Retail, Wholesale, or both without changing your existing inventory.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {([
                ['retail', 'Retail', 'Counter billing and walk-in customer workflows'],
                ['wholesale', 'Wholesale', 'B2B parties, bulk invoices and credit workflows'],
                ['hybrid', 'Retail + Wholesale', 'Both workflows with shared batch stock'],
              ] as Array<[BusinessMode, string, string]>).map(([value, label, description]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedBusinessMode(value)}
                  className={cn(
                    'rounded-2xl border p-4 text-left transition-all',
                    selectedBusinessMode === value
                      ? 'border-2 border-primary bg-primary/5'
                      : 'border-border bg-background hover:border-primary/40'
                  )}
                >
                  <p className="text-sm font-black text-text">{label}</p>
                  <p className="mt-1 text-[10px] font-semibold leading-relaxed text-text/45">{description}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void saveBusinessMode()}
                isLoading={savingBusinessMode}
                disabled={selectedBusinessMode === businessMode}
              >
                Update Workspace
              </Button>
            </div>
          </Card>
        )}
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
              />
              <Input
                label="Email Address"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="store@example.com"
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

            <div className="space-y-4">
              <label className="block text-[10px] font-black uppercase tracking-widest text-text/40">GST Registration Type
                <select name="gstRegistrationType" value={formData.gstRegistrationType} onChange={handleInputChange} className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-text">
                  <option value="regular">Regular taxpayer (Tax Invoice)</option><option value="composition">Composition taxpayer (Bill of Supply)</option><option value="unregistered">Unregistered / no GST collection</option>
                </select>
              </label>
              <Input
                label="GST Number"
                name="gstNumber"
                value={formData.gstNumber}
                onChange={handleInputChange}
                placeholder="22AAAAA0000A1Z5"
              />
              <div className="grid grid-cols-2 gap-4"><Input label="State" name="stateName" value={formData.stateName} onChange={handleInputChange} placeholder="Maharashtra" /><Input label="State Code" name="stateCode" value={formData.stateCode} onChange={handleInputChange} placeholder="27" /></div>
              <Input label="Drug Licence Number" name="drugLicenseNumber" value={formData.drugLicenseNumber} onChange={handleInputChange} placeholder="Retail / wholesale drug licence" />
              <Input label="Annual Aggregate Turnover (₹)" name="annualAggregateTurnover" type="number" value={formData.annualAggregateTurnover} onChange={handleInputChange} placeholder="0" />
              {Number(formData.annualAggregateTurnover) >= 50000000 && <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-xs font-bold text-amber-900">E-invoicing may be mandatory for covered B2B documents at ₹5 crore+ AATO. Configure an authorized IRP integration before issuing applicable B2B invoices; PharmaFlow will not generate a fake IRN or QR code.</div>}
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

        {/* Medicine Database Master Section */}
        <Card className="md:col-span-2 p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-text/40">Medicine Database Master</h3>
                <p className="text-[10px] font-bold text-text/20">Offline high-speed search index supporting 2,50,000+ medicines</p>
              </div>
            </div>
            {masterMedicineCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase tracking-widest">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active Index
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-[9px] font-black uppercase tracking-widest">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Empty Database
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Database Stats Card */}
            <div className="p-6 bg-background rounded-2xl border border-border flex flex-col justify-between space-y-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text/30">Total Medicines Indexed</p>
                <p className="text-3xl font-black text-text mt-1">{masterMedicineCount.toLocaleString()}</p>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-medium text-text/50 leading-normal">
                  IndexedDB manages storage in your local browser. It keeps searches <span className="font-bold text-primary">under 5 milliseconds</span> even with 250,000 records, offline, and with zero impact on performance.
                </p>
                <div className="grid grid-cols-1 gap-2 pt-2">
                  {masterMedicineCount > 0 && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleClearMasterDatabase}
                      disabled={importingMeds}
                      className="text-[9px] font-black uppercase tracking-widest border border-danger/20 bg-danger/5 hover:bg-danger/10 text-danger flex items-center justify-center gap-1.5 animate-none py-2.5 w-full"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear Index
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* CSV/Excel Import Card */}
            <div className="p-6 bg-background rounded-2xl border border-border flex flex-col justify-center items-center text-center relative overflow-hidden">
              {importingMeds ? (
                <div className="w-full space-y-4 py-4 px-2">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary animate-bounce">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-widest text-text/80">Importing Medicines...</p>
                    <p className="text-[10px] font-bold text-text/40">Chunking data to keep browser completely responsive.</p>
                  </div>
                  <div className="w-full bg-border rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                  <p className="text-sm font-black text-primary">{importProgress}% Complete</p>
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div>
                    <label className="cursor-pointer">
                      <span className="px-5 py-2.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all inline-block shadow-lg shadow-primary/25">
                        Import Medicine CSV
                      </span>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept=".csv" 
                        onChange={handleMedicineCSVImport} 
                      />
                    </label>
                    <p className="text-[10px] font-black text-text/40 mt-3 uppercase tracking-widest">Supports 2,50,000+ Rows</p>
                    <p className="text-[8px] font-bold text-text/20 mt-1 leading-normal uppercase max-w-[280px] mx-auto">
                      Export your Excel sheet as a CSV file. It must contain a column named "Name" or "Medicine" with generic composition, pricing, and category.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Card 3: Standard Indian Master Dataset */}
            <div className="p-6 bg-background rounded-2xl border border-border flex flex-col justify-between space-y-4 relative overflow-hidden text-center">
              <div className="space-y-4 py-2">
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-text">Standard Master Dataset</h4>
                  <p className="text-[10px] font-bold text-text/40 mt-1 uppercase tracking-widest">5,150+ Indian Medicines</p>
                  <p className="text-[8px] font-bold text-text/20 mt-2 leading-normal uppercase max-w-[280px] mx-auto">
                    Pre-compiled list of common Indian medicines across key categories with brands, generic formulas, units, and MRPs.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 w-full">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCloudMasterImport}
                  disabled={importingMeds}
                  className="text-[9px] font-black uppercase tracking-widest w-full flex items-center justify-center gap-1.5 py-2.5 shadow-lg shadow-primary/20"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {importingMeds ? 'Please Wait...' : '1-Click Cloud Import'}
                </Button>
                
                <a 
                  href="/pharmaflow_medicines_master.csv" 
                  download="pharmaflow_medicines_master.csv"
                  className={cn(
                    "px-3 py-2.5 bg-surface text-text hover:bg-background border border-border text-[9px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm text-center",
                    importingMeds ? "opacity-50 pointer-events-none" : ""
                  )}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download CSV Dataset
                </a>
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
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col items-center p-6 bg-background border rounded-3xl space-y-4 transition-all relative overflow-hidden w-full",
                isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border border-dashed",
                uploadingLogo ? "opacity-60 pointer-events-none" : ""
              )}
            >
              {/* Drag over overlay */}
              {isDragging && (
                <div className="absolute inset-0 bg-primary/10 flex items-center justify-center backdrop-blur-xs z-10">
                  <p className="text-sm font-black text-primary uppercase tracking-widest">Drop logo to upload</p>
                </div>
              )}

              {formData.logoURL ? (
                <div className="flex flex-col items-center space-y-4 w-full">
                  {/* Logo Preview box */}
                  <div className="relative group overflow-hidden rounded-2xl border border-border p-4 bg-white/50 backdrop-blur-md shadow-inner flex items-center justify-center max-w-[180px] h-32">
                    <img 
                      src={formData.logoURL} 
                      alt="Logo Preview" 
                      className="max-h-full max-w-full object-contain cursor-pointer transition-transform duration-300 hover:scale-105"
                      onClick={() => setIsPreviewOpen(true)}
                      title="Click to view full-size logo"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 justify-center w-full">
                    {/* Preview button */}
                    <button
                      type="button"
                      onClick={() => setIsPreviewOpen(true)}
                      className="px-3 py-2 bg-surface text-text hover:bg-background border border-border text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 shadow-sm"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      Preview
                    </button>

                    {/* Replace button */}
                    <label className="cursor-pointer">
                      <span className="px-3 py-2 bg-primary text-white hover:bg-primary/90 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all inline-flex items-center gap-2 shadow-md shadow-primary/10">
                        <Save className="rotate-180 h-3.5 w-3.5" />
                        Replace
                      </span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                    </label>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, logoURL: '' }));
                        showToast('Logo removed from settings. Save changes to persist.', 'warning');
                      }}
                      className="px-3 py-2 bg-danger/10 text-danger hover:bg-danger/20 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-4 py-4 w-full">
                  <div className="h-20 w-20 rounded-2xl bg-surface border border-border flex items-center justify-center text-text/30 shadow-inner">
                    {uploadingLogo ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <ImageIcon className="h-8 w-8" />}
                  </div>
                  
                  <div className="text-center">
                    <label className="cursor-pointer">
                      <span className="px-5 py-2.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all inline-block shadow-lg shadow-primary/25">
                        Choose File
                      </span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                    </label>
                    <p className="text-[10px] font-black text-text/40 mt-3 uppercase tracking-widest">or Drag & Drop Logo Here</p>
                    <p className="text-[8px] font-bold text-text/20 mt-1 uppercase tracking-widest">Supports PNG, JPG, JPEG (200x200px recommended)</p>
                  </div>
                </div>
              )}
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
                  Currency (System Default)
                </label>
                <div className="w-full bg-background/50 border border-border rounded-xl px-4 py-3 text-sm font-black text-text/40 cursor-not-allowed">
                  ₹ INR (Indian Rupee)
                </div>
                <input type="hidden" name="currency" value="₹" />
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

            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center justify-between p-4 bg-background border border-border rounded-2xl">
                <div className="space-y-0.5">
                  <p className="text-sm font-black text-text uppercase">Dashboard Visual Graphs</p>
                  <p className="text-[10px] font-bold text-text/40">Show or hide analytics charts on Dashboard and Inventory screens</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    name="showDashboardCharts"
                    checked={formData.showDashboardCharts}
                    onChange={handleInputChange}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
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

      {/* Dynamic Logo Preview Lightbox Modal */}
      <AnimatePresence>
        {isPreviewOpen && formData.logoURL && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-lg w-full bg-surface border border-border p-6 rounded-3xl shadow-2xl flex flex-col items-center space-y-6"
            >
              <div className="flex items-center justify-between w-full border-b border-border pb-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-text/60">Store Logo Preview</h3>
                <button 
                  onClick={() => setIsPreviewOpen(false)}
                  className="h-8 w-8 rounded-full bg-background border border-border flex items-center justify-center text-sm font-black hover:bg-surface-hover transition-colors"
                >
                  ×
                </button>
              </div>
              <div className="p-8 bg-white rounded-2xl border border-border/50 max-h-[350px] w-full flex items-center justify-center shadow-inner overflow-hidden">
                <img src={formData.logoURL} alt="Store Logo High-Res Preview" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex justify-between items-center w-full pt-2">
                <p className="text-[8px] font-bold text-text/40 uppercase tracking-wider">Previewing uploaded active store branding logo</p>
                <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(false)} className="text-[9px] font-black uppercase tracking-widest">
                  Close Preview
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </PageTransition>
  );
}
