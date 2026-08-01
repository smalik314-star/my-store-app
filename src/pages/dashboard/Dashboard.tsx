import { useState, useEffect } from 'react';
import { 
  Package, 
  Users, 
  ReceiptText, 
  TrendingUp, 
  ShoppingBag,
  IndianRupee,
  Plus,
  ArrowRight,
  Zap,
  CalendarDays,
  Activity,
  Wallet,
  AlertTriangle
} from 'lucide-react';
import { PageContainer } from '../../components/common/PageContainer';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { dashboardService, DashboardStats } from '../../services/dashboardService';
import { KpiCard } from '../../components/dashboard/KpiCard';
import { AlertPanel } from '../../components/dashboard/AlertPanel';
import { RecentInvoices } from '../../components/dashboard/RecentInvoices';
import { DashboardCharts } from '../../components/dashboard/DashboardCharts';
import { Invoice, Product } from '../../types';
import { formatCurrency, formatCurrencyCompact } from '../../utils/currency';
import { useNavigate } from 'react-router-dom';
import { PageTransition } from '../../components/common/PageTransition';
import { useBusinessMode } from '../../context/BusinessModeContext';
import { supportsRetail } from '../../utils/businessMode';

export default function Dashboard() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { mode } = useBusinessMode();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalCustomers: 0,
    totalInvoices: 0,
    todaySales: 0,
    todayGrossProfit: 0,
    todayInvoiceCount: 0,
    todayPurchases: 0,
    monthlyRevenue: 0,
    totalReceivable: 0,
    totalPayable: 0,
    stockValue: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    criticalStockItems: 0,
    expiryAlerts: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [dashboardInvoices, setDashboardInvoices] = useState<Invoice[]>([]);
  const [alerts, setAlerts] = useState<{ lowStock: Product[], expiring: Product[] }>({
    lowStock: [],
    expiring: []
  });

  useEffect(() => {
    if (!user) return;

    if (!user.tenantId) {
      console.warn('Dashboard: No tenantId found for user');
      setLoading(false);
      return;
    }
    
    setLoading(true);

    // Safety timeout: stop loading after 8 seconds no matter what
    const timeoutId = setTimeout(() => {
      console.warn('Dashboard: Loading timeout reached, forcing display');
      setLoading(false);
    }, 8000);

    const unsubStats = dashboardService.subscribeToStats(
      user.tenantId,
      (newStats) => {
        setStats(newStats);
        setLoading(false);
        clearTimeout(timeoutId);
      },
      (err) => {
        console.error('Dashboard: Stats error', err);
        setLoading(false);
        clearTimeout(timeoutId);
      },
      (invoices) => {
        setDashboardInvoices(invoices);
        setRecentInvoices(invoices.slice(0, 10));
      }
    );

    const unsubAlerts = dashboardService.subscribeToAlerts(user.tenantId, (newAlerts) => {
      setAlerts(newAlerts);
    });

    return () => {
      clearTimeout(timeoutId);
      unsubStats();
      unsubAlerts();
    };
  }, [user]);

  const handleQuickAction = (path: string) => {
    navigate(path);
  };


  return (
    <PageTransition>
      <PageContainer className="gap-4 sm:gap-5 pb-20 lg:pb-0">
      <div className="erp-panel p-3 sm:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex h-11 w-11 rounded-lg bg-primary text-white items-center justify-center shadow-sm">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black text-text tracking-tight">
                {mode === 'wholesale'
                  ? 'Wholesale Distribution Centre'
                  : mode === 'hybrid'
                    ? 'Retail + Wholesale Control Centre'
                    : 'Retail Pharmacy Control Centre'}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                Live
              </span>
            </div>
            <p className="mt-1 text-sm text-text/55">
              Welcome, {user?.displayName?.split(' ')[0] || 'Administrator'} - sales, stock and alerts in one operational view.
            </p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <div className="col-span-2 h-10 px-3 rounded-lg border border-border bg-background flex items-center justify-center sm:justify-start gap-2 text-[11px] font-bold text-text/60 sm:h-9">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            {new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())}
          </div>
          {supportsRetail(mode) && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center font-bold h-11 sm:h-9 sm:w-auto hover:bg-accent/5 hover:text-accent border-accent/30 text-accent/90"
              leftIcon={<Zap className="h-4 w-4" />}
              onClick={() => window.dispatchEvent(new CustomEvent('open-quick-bill'))}
            >
              Quick Bill
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            className="col-span-2 w-full justify-center font-bold h-11 sm:col-span-1 sm:h-9 sm:w-auto"
            onClick={() => handleQuickAction('/purchases/new')}
          >
            New Purchase
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            className="w-full justify-center font-bold h-11 sm:h-9 sm:w-auto shadow-sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => handleQuickAction(mode === 'wholesale' ? '/billing/wholesale' : '/billing/retail')}
          >
            {mode === 'wholesale' ? 'Wholesale Invoice' : 'Retail Sale'}
          </Button>
          {mode === 'hybrid' && (
            <Button
              variant="outline"
              size="sm"
              className="col-span-2 w-full justify-center font-bold h-11 sm:col-span-1 sm:h-9 sm:w-auto"
              onClick={() => handleQuickAction('/billing/wholesale')}
            >
              Wholesale Invoice
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard 
          label="Today's Sales" 
          value={formatCurrencyCompact(stats.todaySales)} 
          icon={ShoppingBag} 
          loading={loading}
          colorClass="bg-success/10 text-success"
          isHoverable
          onClick={() => navigate('/reports')}
        />
        <KpiCard 
          label="Today's Profit" 
          value={formatCurrency(stats.todayGrossProfit)} 
          icon={TrendingUp} 
          loading={loading}
          colorClass="bg-primary/10 text-primary"
          isHoverable
          onClick={() => navigate('/reports')}
        />
        <KpiCard 
          label="Today's Invoices" 
          value={stats.todayInvoiceCount} 
          icon={ReceiptText} 
          loading={loading}
          colorClass="bg-accent/10 text-accent"
          isHoverable
          onClick={() => navigate('/reports')}
        />
        <KpiCard 
          label="Today's Purchase" 
          value={formatCurrency(stats.todayPurchases)} 
          icon={Package} 
          loading={loading}
          colorClass="bg-purple-500/10 text-purple-500"
          isHoverable
          onClick={() => navigate('/purchases')}
        />
        <KpiCard 
          label="Receivable" 
          value={formatCurrency(stats.totalReceivable)} 
          icon={Wallet} 
          loading={loading}
          colorClass="bg-warning/10 text-warning"
          isHoverable
          onClick={() => navigate('/customers')}
        />
        <KpiCard 
          label="Payable" 
          value={formatCurrency(stats.totalPayable)} 
          icon={IndianRupee} 
          loading={loading}
          colorClass="bg-danger/10 text-danger"
          isHoverable
          onClick={() => navigate('/supplier-payments')}
        />
        <KpiCard 
          label="Stock Value" 
          value={formatCurrency(stats.stockValue)} 
          icon={Package} 
          loading={loading}
          colorClass="bg-info/10 text-info"
          isHoverable
          onClick={() => navigate('/inventory')}
        />
        <KpiCard 
          label="Low Stock" 
          value={stats.lowStockItems} 
          icon={AlertTriangle} 
          loading={loading}
          isUp={stats.lowStockItems === 0}
          colorClass={stats.lowStockItems > 0 ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}
          isHoverable
          onClick={() => navigate('/low-stock')}
        />
        <KpiCard 
          label="Expiring Soon" 
          value={stats.expiryAlerts} 
          icon={Package} 
          loading={loading}
          isUp={stats.expiryAlerts === 0}
          colorClass={stats.expiryAlerts > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}
          isHoverable
          onClick={() => navigate('/expiry-alerts')}
        />
        <KpiCard 
          label="Products" 
          value={stats.totalProducts} 
          icon={Package} 
          loading={loading}
          colorClass="bg-secondary/10 text-secondary"
          isHoverable
          onClick={() => navigate('/inventory')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        {/* Main Content Area */}
        <div className="lg:col-span-2 flex flex-col gap-4 lg:gap-5">
          {(settings?.showDashboardCharts ?? true) && (
            <DashboardCharts 
              invoices={dashboardInvoices}
              loading={loading} 
            />
          )}
          <RecentInvoices invoices={recentInvoices} loading={loading} />
        </div>

        {/* Sidebar Widgets */}
        <div className="flex flex-col gap-4 lg:gap-5">
          <Card className="p-4 sm:p-5 border-primary/20 bg-primary/5 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-primary uppercase tracking-widest">Quick Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
              <button 
                onClick={() => handleQuickAction('/billing')}
                className="flex min-h-14 items-center justify-between p-3 bg-white rounded-xl border border-primary/10 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ReceiptText className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm font-bold text-text">Create Invoice</span>
                </div>
                <ArrowRight className="h-4 w-4 text-text/20 group-hover:text-primary transition-colors hidden lg:block" />
              </button>
              <button 
                onClick={() => handleQuickAction('/inventory')}
                className="flex min-h-14 items-center justify-between p-3 bg-white rounded-xl border border-primary/10 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-secondary" />
                  </div>
                  <span className="text-sm font-bold text-text">Add Product</span>
                </div>
                <ArrowRight className="h-4 w-4 text-text/20 group-hover:text-secondary transition-colors hidden lg:block" />
              </button>
              <button 
                onClick={() => handleQuickAction('/customers')}
                className="flex min-h-14 items-center justify-between p-3 bg-white rounded-xl border border-primary/10 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-accent" />
                  </div>
                  <span className="text-sm font-bold text-text">Add Customer</span>
                </div>
                <ArrowRight className="h-4 w-4 text-text/20 group-hover:text-accent transition-colors hidden lg:block" />
              </button>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden border-warning/20">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-background/50">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-text uppercase tracking-wider">Stock Intelligence</h3>
                <div className="flex gap-1">
                  {stats.outOfStockItems > 0 && <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />}
                  {stats.criticalStockItems > 0 && <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />}
                </div>
              </div>
              <TrendingUp className="h-4 w-4 text-warning" />
            </div>
            
            <div className="p-3 sm:p-4 grid grid-cols-3 gap-1.5 sm:gap-2">
               <button 
                 onClick={() => navigate('/low-stock')}
                 className="flex min-h-20 flex-col items-center justify-center p-2 sm:p-3 rounded-xl bg-danger/5 border border-danger/10 hover:bg-danger/10 transition-colors"
               >
                 <span className="text-xl font-black text-danger">{stats.outOfStockItems}</span>
                 <span className="text-center text-[8px] font-bold leading-tight text-danger/60 uppercase">Out of Stock</span>
               </button>
               <button 
                 onClick={() => navigate('/low-stock')}
                 className="flex min-h-20 flex-col items-center justify-center p-2 sm:p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 hover:bg-orange-500/10 transition-colors"
               >
                 <span className="text-xl font-black text-orange-500">{stats.criticalStockItems}</span>
                 <span className="text-center text-[8px] font-bold leading-tight text-orange-500/60 uppercase">Critical</span>
               </button>
               <button 
                 onClick={() => navigate('/low-stock')}
                 className="flex min-h-20 flex-col items-center justify-center p-2 sm:p-3 rounded-xl bg-warning/5 border border-warning/10 hover:bg-warning/10 transition-colors"
               >
                 <span className="text-xl font-black text-warning">{stats.lowStockItems}</span>
                 <span className="text-center text-[8px] font-bold leading-tight text-warning/60 uppercase">Low Stock</span>
               </button>
            </div>

            <div className="px-4 pb-4">
              <Button 
                variant="primary" 
                size="sm" 
                className="w-full font-black text-[10px] uppercase tracking-widest h-10 shadow-lg shadow-primary/10"
                onClick={() => navigate('/low-stock')}
              >
                Review Inventory Health
              </Button>
            </div>
          </Card>

          <AlertPanel 
            title="Recent Low Stock" 
            items={alerts.lowStock.slice(0, 3)} 
            type="stock" 
            loading={loading} 
          />
          
          <AlertPanel 
            title="Expiry Alerts" 
            items={alerts.expiring} 
            type="expiry" 
            loading={loading} 
          />

          <Card className="p-5 bg-text text-white rounded-2xl relative overflow-hidden group">
            <div className="relative z-10">
              <h4 className="text-sm font-bold mb-1">System Status</h4>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Module 14: System Settings is now live. Configure your store branding and GST rules in Settings.
              </p>
            </div>
            <div className="absolute top-[-20%] right-[-10%] w-24 h-24 rounded-full bg-white/5 blur-xl group-hover:bg-white/10 transition-all" />
          </Card>
        </div>
      </div>
    </PageContainer>
    </PageTransition>
  );
}
