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
  Zap
} from 'lucide-react';
import { PageContainer, SectionHeader } from '../../components/common/PageContainer';
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
import { SkeletonDashboard } from '../../components/common/Skeleton';
import { PageTransition } from '../../components/common/PageTransition';

export default function Dashboard() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
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
  const [alerts, setAlerts] = useState<{ lowStock: Product[], expiring: Product[], allProducts: Product[] }>({
    lowStock: [],
    expiring: [],
    allProducts: []
  });

  useEffect(() => {
    if (!user) return;

    if (!user.tenantId) {
      console.warn('Dashboard: No tenantId found for user');
      setLoading(false);
      return;
    }
    
    console.log('Dashboard: Starting data subscriptions for tenant', user.tenantId);
    setLoading(true);

    // Safety timeout: stop loading after 8 seconds no matter what
    const timeoutId = setTimeout(() => {
      console.warn('Dashboard: Loading timeout reached, forcing display');
      setLoading(false);
    }, 8000);

    const unsubStats = dashboardService.subscribeToStats(
      user.tenantId,
      (newStats) => {
        console.log('Dashboard: Received stats update');
        setStats(newStats);
        setLoading(false);
        clearTimeout(timeoutId);
      },
      (err) => {
        console.error('Dashboard: Stats error', err);
        setLoading(false);
        clearTimeout(timeoutId);
      }
    );

    const unsubInvoices = dashboardService.subscribeToRecentInvoices(user.tenantId, (invoices) => {
      console.log('Dashboard: Received invoices update');
      setRecentInvoices(invoices);
    });

    const unsubAlerts = dashboardService.subscribeToAlerts(user.tenantId, (newAlerts) => {
      console.log('Dashboard: Received alerts update');
      setAlerts(newAlerts);
    });

    return () => {
      clearTimeout(timeoutId);
      unsubStats();
      unsubInvoices();
      unsubAlerts();
    };
  }, [user]);

  const handleQuickAction = (path: string) => {
    navigate(path);
  };


  return (
    <PageTransition>
      <PageContainer className="p-4 md:p-6 lg:p-8 gap-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <SectionHeader 
          title={`Welcome back, ${user?.displayName?.split(' ')[0] || 'Administrator'}`} 
          description="Here is a real-time overview of your pharmacy performance."
        />
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            className="font-bold hover:bg-accent/5 hover:text-accent border-accent/30 text-accent/90"
            leftIcon={<Zap className="h-4 w-4" />}
            onClick={() => window.dispatchEvent(new CustomEvent('open-quick-bill'))}
          >
            ⚡ Quick Bill
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="hidden md:flex font-bold"
            onClick={() => handleQuickAction('/inventory')}
          >
            Manage Inventory
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            className="font-bold shadow-lg shadow-primary/20"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => handleQuickAction('/billing')}
          >
            New Invoice
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard 
          label="Today's Sales" 
          value={formatCurrency(stats.todaySales)} 
          icon={ShoppingBag} 
          loading={loading}
          colorClass="bg-success/10 text-success"
          isHoverable
          onClick={() => navigate('/reports')}
        />
        <KpiCard 
          label="Today's Gross Profit" 
          value={formatCurrency(stats.todayGrossProfit)} 
          icon={TrendingUp} 
          loading={loading}
          colorClass="bg-secondary/10 text-secondary"
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
          onClick={() => navigate('/invoices')}
        />
        <KpiCard 
          label="Today's Purchases" 
          value={formatCurrencyCompact(stats.todayPurchases)} 
          icon={Package} 
          loading={loading}
          colorClass="bg-info/10 text-info"
          isHoverable
          onClick={() => navigate('/purchases')}
        />
        <KpiCard 
          label="Stock Value" 
          value={formatCurrency(stats.stockValue)} 
          icon={IndianRupee} 
          loading={loading}
          colorClass="bg-info/10 text-info"
          isHoverable
          onClick={() => navigate('/inventory')}
        />
        <KpiCard label="Receivable" value={formatCurrency(stats.totalReceivable)} icon={Users} loading={loading} colorClass="bg-danger/10 text-danger" isHoverable onClick={() => navigate('/receipts')} />
        <KpiCard label="Payable" value={formatCurrency(stats.totalPayable)} icon={IndianRupee} loading={loading} colorClass="bg-warning/10 text-warning" isHoverable onClick={() => navigate('/supplier-payments')} />
        <KpiCard label="Products" value={stats.totalProducts} icon={Package} loading={loading} colorClass="bg-primary/10 text-primary" isHoverable onClick={() => navigate('/inventory')} />
        <KpiCard label="Customers" value={stats.totalCustomers} icon={Users} loading={loading} colorClass="bg-secondary/10 text-secondary" isHoverable onClick={() => navigate('/customers')} />
        <KpiCard 
          label="Low Stock" 
          value={stats.lowStockItems} 
          icon={TrendingUp} 
          loading={loading}
          isUp={stats.lowStockItems === 0}
          colorClass={stats.lowStockItems > 0 ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}
          isHoverable
          onClick={() => navigate('/inventory')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {(settings?.showDashboardCharts ?? true) && (
            <DashboardCharts 
              invoices={recentInvoices} 
              products={alerts.allProducts}
              loading={loading} 
            />
          )}
          <RecentInvoices invoices={recentInvoices} loading={loading} />
        </div>

        {/* Sidebar Widgets */}
        <div className="flex flex-col gap-6">
          <Card className="p-6 border-primary/20 bg-primary/5 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-primary uppercase tracking-widest">Quick Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
              <button 
                onClick={() => handleQuickAction('/billing')}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-primary/10 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
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
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-primary/10 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
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
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-primary/10 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
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
            <div className="flex items-center justify-between p-5 border-b border-border bg-background/50">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-text uppercase tracking-wider">Stock Intelligence</h3>
                <div className="flex gap-1">
                  {stats.outOfStockItems > 0 && <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />}
                  {stats.criticalStockItems > 0 && <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />}
                </div>
              </div>
              <TrendingUp className="h-4 w-4 text-warning" />
            </div>
            
            <div className="p-4 grid grid-cols-3 gap-2">
               <button 
                 onClick={() => navigate('/low-stock')}
                 className="flex flex-col items-center p-3 rounded-xl bg-danger/5 border border-danger/10 hover:bg-danger/10 transition-colors"
               >
                 <span className="text-xl font-black text-danger">{stats.outOfStockItems}</span>
                 <span className="text-[8px] font-bold text-danger/60 uppercase whitespace-nowrap">Out of Stock</span>
               </button>
               <button 
                 onClick={() => navigate('/low-stock')}
                 className="flex flex-col items-center p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 hover:bg-orange-500/10 transition-colors"
               >
                 <span className="text-xl font-black text-orange-500">{stats.criticalStockItems}</span>
                 <span className="text-[8px] font-bold text-orange-500/60 uppercase whitespace-nowrap">Critical</span>
               </button>
               <button 
                 onClick={() => navigate('/low-stock')}
                 className="flex flex-col items-center p-3 rounded-xl bg-warning/5 border border-warning/10 hover:bg-warning/10 transition-colors"
               >
                 <span className="text-xl font-black text-warning">{stats.lowStockItems}</span>
                 <span className="text-[8px] font-bold text-warning/60 uppercase whitespace-nowrap">Low Stock</span>
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
