import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, where, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Invoice, Product, Customer, Purchase, SaleReturnRecord } from '../../types';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { handleFirestoreError, OperationType } from '../../utils/firestore-errors';
import { 
  TrendingUp, 
  TrendingDown, 
  IndianRupee, 
  ShoppingCart, 
  Percent, 
  Users, 
  Calendar,
  Download,
  Filter,
  FileText,
  PieChart as PieChartIcon,
  BarChart3,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { cn } from '../../utils/cn';
import { useSettings } from '../../context/SettingsContext';
import { toJsDate } from '../../utils/date';
import { useNavigate } from 'react-router-dom';
import { PageTransition } from '../../components/common/PageTransition';
import { SkeletonChart, SkeletonCard } from '../../components/common/Skeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { Logo } from '../../components/common/Logo';

type DateRange = 'today' | '7days' | '30days' | 'thisMonth' | 'lastMonth' | 'custom';

export default function Reports() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [saleReturns, setSaleReturns] = useState<SaleReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date }>({
    start: subDays(new Date(), 30),
    end: new Date()
  });

  const { user } = useAuth();

  useEffect(() => {
    if (!user?.tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const qInvoices = query(
      collection(db, 'invoices'),
      where('tenantId', '==', user.tenantId)
    );
    const unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
      try {
        const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice));
        // Client-side sort: Recent first
        items.sort((a, b) => {
          const dateA = toJsDate(a.createdAt);
          const dateB = toJsDate(b.createdAt);
          return dateB.getTime() - dateA.getTime();
        });
        setInvoices(items);
      } catch (err) {
        console.error('Reports Invoices Processing Error:', err);
      }
    }, (error) => {
      console.error('Reports Invoices Error:', error);
    });

    const qProducts = query(
      collection(db, 'products'),
      where('tenantId', '==', user.tenantId)
    );
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    const qCustomers = query(
      collection(db, 'customers'),
      where('tenantId', '==', user.tenantId)
    );
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Customer)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
      setLoading(false);
    });

    const unsubPurchases = onSnapshot(
      query(collection(db, 'purchases'), where('tenantId', '==', user.tenantId)),
      snapshot => setPurchases(snapshot.docs.map(row => ({ id: row.id, ...row.data() } as Purchase))),
      error => handleFirestoreError(error, OperationType.LIST, 'purchases')
    );
    const unsubReturns = onSnapshot(
      query(collection(db, 'saleReturns'), where('tenantId', '==', user.tenantId)),
      snapshot => setSaleReturns(snapshot.docs.map(row => ({ id: row.id, ...row.data() } as SaleReturnRecord))),
      error => handleFirestoreError(error, OperationType.LIST, 'saleReturns')
    );

    return () => {
      unsubInvoices();
      unsubProducts();
      unsubCustomers();
      unsubPurchases();
      unsubReturns();
    };
  }, [user?.tenantId]);

  const activeWindow = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = endOfDay(now);

    switch (dateRange) {
      case 'today':
        start = startOfDay(now);
        break;
      case '7days':
        start = startOfDay(subDays(now, 7));
        break;
      case '30days':
        start = startOfDay(subDays(now, 30));
        break;
      case 'thisMonth':
        start = startOfMonth(now);
        break;
      case 'lastMonth':
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        break;
      case 'custom':
        start = startOfDay(customRange.start);
        end = endOfDay(customRange.end);
        break;
      default:
        start = startOfDay(subDays(now, 30));
    }

    return { start, end };
  }, [dateRange, customRange]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (inv.status === 'cancelled') return false;
      const date = toJsDate(inv.createdAt);
      if (!date) return false;
      return isWithinInterval(date, activeWindow);
    });
  }, [invoices, activeWindow]);

  const filteredPurchases = useMemo(() => purchases.filter(purchase => (
    purchase.status !== 'cancelled' &&
    isWithinInterval(toJsDate(purchase.invoiceDate || purchase.createdAt), activeWindow)
  )), [purchases, activeWindow]);

  const filteredSaleReturns = useMemo(() => saleReturns.filter(row => (
    isWithinInterval(toJsDate(row.createdAt), activeWindow)
  )), [saleReturns, activeWindow]);

  const stats = useMemo(() => {
    const productMap = new Map(products.map(p => [p.id, p]));
    
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalGst = 0;
    let pendingDues = 0;
    let retailRevenue = 0;
    let wholesaleRevenue = 0;
    let retailInvoices = 0;
    let wholesaleInvoices = 0;
    
    const productPerformance: Record<string, { name: string; quantity: number; revenue: number; profit: number }> = {};
    const customerPerformance: Record<string, { name: string; revenue: number; dues: number; visitCount: number }> = {};

    filteredInvoices.forEach(inv => {
      totalRevenue += inv.grandTotal;
      totalGst += inv.gstTotal;
      if (inv.saleMode === 'wholesale') {
        wholesaleRevenue += inv.grandTotal;
        wholesaleInvoices += 1;
      } else {
        retailRevenue += inv.grandTotal;
        retailInvoices += 1;
      }
      
      const exactDue = inv.paymentStatus === 'paid' ? 0 :
        Number.isFinite(inv.outstandingAmount) ? Math.max(0, Number(inv.outstandingAmount)) :
        inv.paymentStatus === 'due' ? inv.grandTotal : 0;
      pendingDues += exactDue;

      // Customer stats
      if (!customerPerformance[inv.customerId]) {
        customerPerformance[inv.customerId] = { name: inv.customerName, revenue: 0, dues: 0, visitCount: 0 };
      }
      customerPerformance[inv.customerId].revenue += inv.grandTotal;
      customerPerformance[inv.customerId].visitCount += 1;
      customerPerformance[inv.customerId].dues += exactDue;

      // Profit and Product stats
      inv.items.forEach(item => {
        const purchasePrice = Number.isFinite(item.purchaseCost) ? Number(item.purchaseCost) : 0;
        const profit = (item.price - purchasePrice) * item.quantity;
        totalProfit += profit;

        if (!productPerformance[item.productId]) {
          productPerformance[item.productId] = { name: item.name, quantity: 0, revenue: 0, profit: 0 };
        }
        productPerformance[item.productId].quantity += item.quantity;
        productPerformance[item.productId].revenue += item.total;
        productPerformance[item.productId].profit += profit;
      });
    });

    const invoiceMap = new Map(filteredInvoices.map(invoice => [invoice.id, invoice]));
    filteredSaleReturns.forEach(returnRecord => {
      totalRevenue -= returnRecord.totalAmount;
      const invoice = invoiceMap.get(returnRecord.invoiceId);
      if (!invoice) return;
      const gstRatio = invoice.grandTotal > 0 ? invoice.gstTotal / invoice.grandTotal : 0;
      totalGst -= roundMoney(returnRecord.totalAmount * gstRatio);
      if (customerPerformance[invoice.customerId]) {
        customerPerformance[invoice.customerId].revenue -= returnRecord.totalAmount;
      }
      returnRecord.lines.forEach(returnLine => {
        const sourceLine = invoice.items.find(item => item.productId === returnLine.productId);
        if (!sourceLine) return;
        const margin = (Number(sourceLine.price) || 0) - (Number(sourceLine.purchaseCost) || 0);
        totalProfit -= margin * returnLine.quantity;
        if (productPerformance[returnLine.productId]) {
          productPerformance[returnLine.productId].quantity -= returnLine.quantity;
          productPerformance[returnLine.productId].revenue -= returnLine.amount;
          productPerformance[returnLine.productId].profit -= margin * returnLine.quantity;
        }
      });
    });

    const topProducts = Object.values(productPerformance)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const topProfitProducts = Object.values(productPerformance)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    const topCustomers = Object.values(customerPerformance)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const topDueCustomers = Object.values(customerPerformance)
      .filter(c => c.dues > 0)
      .sort((a, b) => b.dues - a.dues)
      .slice(0, 10);

    return {
      totalRevenue: roundMoney(Math.max(0, totalRevenue)),
      totalProfit: roundMoney(totalProfit),
      totalGst: roundMoney(Math.max(0, totalGst)),
      totalSales: filteredInvoices.length,
      avgInvoiceValue: filteredInvoices.length > 0 ? totalRevenue / filteredInvoices.length : 0,
      pendingDues,
      retailRevenue: roundMoney(retailRevenue),
      wholesaleRevenue: roundMoney(wholesaleRevenue),
      retailInvoices,
      wholesaleInvoices,
      totalPurchases: filteredPurchases.reduce((sum, purchase) => sum + (Number(purchase.totalAmount) || 0), 0),
      topProducts,
      topProfitProducts,
      topCustomers,
      topDueCustomers
    };
  }, [filteredInvoices, filteredPurchases, filteredSaleReturns, products]);

  const salesTrendData = useMemo(() => {
    const dailyData: Record<string, { date: string; revenue: number; profit: number }> = {};
    
    // Sort filtered invoices by date to ensure continuity
    const sorted = [...filteredInvoices].sort((a, b) => toJsDate(a.createdAt).getTime() - toJsDate(b.createdAt).getTime());
    
    sorted.forEach(inv => {
      const dateStr = format(toJsDate(inv.createdAt), 'dd MMM');
      if (!dailyData[dateStr]) {
        dailyData[dateStr] = { date: dateStr, revenue: 0, profit: 0 };
      }
      dailyData[dateStr].revenue += inv.grandTotal;
      
      // Compute profit for the day
      inv.items.forEach(item => {
        const purchasePrice = Number.isFinite(item.purchaseCost) ? Number(item.purchaseCost) : 0;
        dailyData[dateStr].profit += (item.price - purchasePrice) * item.quantity;
      });
    });

    return Object.values(dailyData);
  }, [filteredInvoices, products]);

  const gstBreakdownData = useMemo(() => {
    return [
      { name: 'CGST', value: stats.totalGst / 2, color: '#6366f1' },
      { name: 'SGST', value: stats.totalGst / 2, color: '#a855f7' }
    ];
  }, [stats.totalGst]);

  const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

  const handleExportCSV = () => {
    const headers = ['Date', 'Invoice No', 'Sale Type', 'Customer', 'GSTIN', 'Total Amount', 'GST', 'Profit', 'Status'];
    const rows = filteredInvoices.map(inv => {
      let profit = 0;
      inv.items.forEach(item => {
        const purchasePrice = Number.isFinite(item.purchaseCost) ? Number(item.purchaseCost) : 0;
        profit += (item.price - purchasePrice) * item.quantity;
      });
      
      return [
        format(toJsDate(inv.createdAt), 'yyyy-MM-dd HH:mm'),
        inv.invoiceNumber,
        inv.saleMode || 'retail',
        inv.customerName,
        inv.customerGstNumber || '',
        inv.grandTotal,
        inv.gstTotal,
        profit.toFixed(2),
        inv.paymentStatus
      ];
    });

    const escapeCsv = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csvContent = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Report_${dateRange}_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-text/5 animate-pulse rounded-lg" />
            <div className="h-4 w-48 bg-text/5 animate-pulse rounded-lg" />
          </div>
          <div className="h-10 w-32 bg-text/5 animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-surface rounded-3xl border border-border animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto pb-20">
      
      {/* Print-only Branded Report Header */}
      <div className="hidden print:flex items-center justify-between border-b border-border pb-6 mb-8 w-full">
        <div className="flex items-center gap-4">
          <Logo className="h-14 w-14 shadow-sm shrink-0" variant="color" />
          <div className="text-left">
            <h1 className="text-2xl font-black text-text tracking-tight uppercase">Analytics & Sales Report</h1>
            <p className="text-xs text-text/40 font-bold uppercase tracking-wider">{settings?.storeName || 'PharmaFlow'} Pharmacy</p>
            {settings?.address && <p className="text-[10px] text-text/30 font-semibold">{settings.address}</p>}
          </div>
        </div>
        <div className="text-right text-xs text-text/40 font-semibold font-mono space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest">Report Summary</p>
          <p>Generated: {new Date().toLocaleDateString()}</p>
          <p>Period: {dateRange.toUpperCase()}</p>
        </div>
      </div>

      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 no-print">
        <div>
          <h1 className="text-3xl font-black text-text tracking-tight uppercase">Analytics Dashboard</h1>
          <p className="text-sm font-bold text-text/40 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Real-time business intelligence for PharmaFlow
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-surface p-1 rounded-xl border border-border flex items-center gap-1">
            {(['today', '7days', '30days', 'thisMonth'] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  dateRange === range ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-text/40 hover:text-text"
                )}
              >
                {range.replace(/([A-Z])/g, ' $1').trim()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={handleExportCSV}
              leftIcon={<Download className="h-4 w-4" />}
              className="h-10 text-[10px] uppercase tracking-widest font-black"
            >
              CSV
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.print()}
              leftIcon={<FileText className="h-4 w-4" />}
              className="h-10 text-[10px] uppercase tracking-widest font-black"
            >
              Print
            </Button>
          </div>
        </div>
      </div>

      {invoices.length === 0 ? (
        <EmptyState 
          title="No analytics data" 
          description="Start generating invoices to view insights into your sales, revenue, and profit performance."
          icon={<BarChart3 className="h-20 w-20" />}
          className="py-32 bg-surface rounded-[3rem] border border-border"
          action={
            <Button 
              variant="primary" 
              onClick={() => navigate('/billing')}
              className="px-10 font-black uppercase tracking-widest text-xs"
            >
              Go to Billing Terminal
            </Button>
          }
        />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard 
              label="Total Revenue" 
              value={formatCurrency(stats.totalRevenue)} 
              icon={<IndianRupee className="h-5 w-5 text-primary" />}
            />
            <StatCard 
              label="Gross Profit" 
              value={formatCurrency(stats.totalProfit)} 
              icon={<TrendingUp className="h-5 w-5 text-success" />}
            />
            <StatCard 
              label="Purchases" 
              value={formatCurrency(stats.totalPurchases)} 
              icon={<ShoppingCart className="h-5 w-5 text-purple-500" />}
            />
            <StatCard 
              label="GST Collected" 
              value={formatCurrency(stats.totalGst)} 
              icon={<Percent className="h-5 w-5 text-amber-500" />}
            />
            <StatCard 
              label="Avg Invoice" 
              value={formatCurrency(Math.round(stats.avgInvoiceValue))} 
              icon={<FileText className="h-5 w-5 text-blue-500" />}
            />
            <StatCard 
              label="Pending Dues" 
              value={formatCurrency(stats.pendingDues)} 
              icon={<Users className="h-5 w-5 text-danger" />}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5 border-border bg-surface">
              <p className="text-[10px] font-black uppercase tracking-widest text-text/35">Retail / B2C Sales</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-xl font-black text-text">{formatCurrency(stats.retailRevenue)}</p>
                <Badge variant="success" className="text-[9px] font-black">{stats.retailInvoices} invoices</Badge>
              </div>
            </Card>
            <Card className="p-5 border-border bg-surface">
              <p className="text-[10px] font-black uppercase tracking-widest text-text/35">Wholesale / B2B Sales</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-xl font-black text-text">{formatCurrency(stats.wholesaleRevenue)}</p>
                <Badge variant="warning" className="text-[9px] font-black">{stats.wholesaleInvoices} invoices</Badge>
              </div>
            </Card>
          </div>

          {/* Main Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-text/40">Revenue & Profit Trend</h3>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrendData}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      itemStyle={{ fontWeight: 800 }}
                    />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#6366f1" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
                    <Area type="monotone" dataKey="profit" name="Profit" stroke="#10b981" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-text/40">Top Performing Products</h3>
                <BarChart3 className="h-4 w-4 text-purple-500" />
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.topProducts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" axisLine={false} tickLine={false} hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      width={120}
                      tick={{ fontSize: 9, fontWeight: 800, fill: '#475569' }} 
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    />
                    <Bar dataKey="revenue" name={`Revenue (INR)`} fill="#a855f7" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {/* GST Breakdown */}
            <Card className="p-8 space-y-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-text/40">GST Breakdown</h3>
              <div className="h-64 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={gstBreakdownData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {gstBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" align="center" iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                  <span className="text-[10px] font-black text-text/30 uppercase">Total GST</span>
                  <span className="text-xl font-black text-text">{formatCurrency(stats.totalGst)}</span>
                </div>
              </div>
            </Card>

            {/* Top Profit Items */}
            <Card className="p-8 space-y-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-text/40">High Profit Items</h3>
              <div className="space-y-4">
                {stats.topProfitProducts.slice(0, 5).map((prod, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-text line-clamp-1">{prod.name}</span>
                      <span className="text-[10px] font-bold text-text/30 uppercase">Profit Unit: {formatCurrency(prod.profit / prod.quantity)}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-success">{formatCurrency(Math.round(prod.profit))}</p>
                      <p className="text-[10px] font-bold text-text/30">{prod.quantity} Units</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top Customers */}
            <Card className="p-8 space-y-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-text/40">Top Valued Customers</h3>
              <div className="space-y-4">
                {stats.topCustomers.slice(0, 5).map((cust, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-text">{cust.name}</span>
                      <span className="text-[10px] font-bold text-text/30 uppercase">{cust.visitCount} Purchases</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-primary">{formatCurrency(Math.round(cust.revenue))}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top Dues */}
            <Card className="p-8 space-y-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-text/40">Highest Outstanding Dues</h3>
              <div className="space-y-4">
                {stats.topDueCustomers.length > 0 ? (
                  stats.topDueCustomers.slice(0, 5).map((cust, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-text">{cust.name}</span>
                        <span className="text-[10px] font-bold text-text/30 uppercase">Last Visit: {cust.visitCount}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-danger">{formatCurrency(Math.round(cust.dues))}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs font-bold text-text/30 text-center py-10 italic">No outstanding dues</p>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; margin: 1cm; }
          /* Ensure charts are nicely fitted for print */
          .recharts-responsive-container {
            page-break-inside: avoid;
          }
        }
      `}} />
    </div>
    </PageTransition>
  );
}

function StatCard({ label, value, icon, trend, trendType = 'up' }: { label: string; value: string; icon: React.ReactNode; trend?: string; trendType?: 'up' | 'down' }) {
  return (
    <Card className="p-6 space-y-4 border-border/50 hover:border-primary/30 transition-all group overflow-hidden relative">
      <div className="flex items-center justify-between relative z-10">
        <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center group-hover:scale-110 transition-transform">
          {icon}
        </div>
        {trend && (
          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black",
            trendType === 'up' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          )}>
            {trendType === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {trend}
          </div>
        )}
      </div>
      <div className="relative z-10">
        <p className="text-[10px] font-black text-text/30 uppercase tracking-[0.2em]">{label}</p>
        <p className="text-2xl font-black text-text tracking-tighter">{value}</p>
      </div>
      <div className="absolute -right-4 -bottom-4 h-24 w-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
    </Card>
  );
}
