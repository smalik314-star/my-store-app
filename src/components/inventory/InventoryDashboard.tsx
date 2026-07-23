import { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  AreaChart, 
  Area,
  Legend
} from 'recharts';
import { 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  Layers, 
  ArrowUpRight, 
  ArrowDownRight, 
  Activity, 
  Calendar, 
  ShieldAlert, 
  Truck, 
  ShoppingCart,
  RefreshCw,
  Clock,
  Search
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Product, StockMovement } from '../../types';
import { ProductIntelligence } from '../../services/inventoryIntelligenceService';
import { productService } from '../../services/productService';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency } from '../../utils/currency';
import { toJsDate } from '../../utils/date';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';

interface InventoryDashboardProps {
  products: Product[];
  intelligence: Record<string, ProductIntelligence>;
  onViewProduct?: (product: Product) => void;
  onEditProduct?: (product: Product) => void;
}

const COLORS = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#64748B'];

export function InventoryDashboard({ products, intelligence, onViewProduct, onEditProduct }: InventoryDashboardProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [movementSearch, setMovementSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');

  // Fetch real-time stock movements
  useEffect(() => {
    if (!user?.tenantId) return;

    setLoadingMovements(true);
    const unsub = productService.subscribeToStockMovements(
      user.tenantId,
      (newMovements) => {
        setMovements(newMovements);
        setLoadingMovements(false);
      },
      150 // Fetch recent 150 movements
    );

    return () => unsub();
  }, [user?.tenantId]);

  // --- KPI CALCULATIONS ---
  const stats = useMemo(() => {
    const totalUnique = products.length;
    let totalValue = 0;
    let totalVolume = 0;
    let outOfStock = 0;
    let lowStock = 0;
    let expiringSoon = 0; // Expiring in <= 60 days
    const now = new Date();
    const soonThreshold = new Date();
    soonThreshold.setDate(soonThreshold.getDate() + 60);

    products.forEach(p => {
      totalValue += p.stockQuantity * p.purchasePrice;
      totalVolume += p.stockQuantity;
      if (p.stockQuantity === 0) {
        outOfStock++;
      } else if (p.stockQuantity <= p.minimumStock) {
        lowStock++;
      }

      if (p.expiryDate) {
        const expiry = toJsDate(p.expiryDate);
        if (expiry >= now && expiry <= soonThreshold) {
          expiringSoon++;
        }
      }
    });

    return {
      totalUnique,
      totalValue,
      totalVolume,
      outOfStock,
      lowStock,
      expiringSoon
    };
  }, [products]);

  // --- CHART 1: STOCK BY CATEGORY (Pie Chart) ---
  const stockByCategoryData = useMemo(() => {
    const categories: Record<string, { value: number; count: number; name: string }> = {};
    products.forEach(p => {
      const cat = p.category || 'Other';
      if (!categories[cat]) {
        categories[cat] = { name: cat, value: 0, count: 0 };
      }
      categories[cat].value += p.stockQuantity * p.purchasePrice;
      categories[cat].count += p.stockQuantity;
    });

    return Object.values(categories)
      .map(item => ({
        ...item,
        // Format value to 2 decimal places
        value: parseFloat(item.value.toFixed(2))
      }))
      .sort((a, b) => b.value - a.value);
  }, [products]);

  // --- CHART 2: TOP PRODUCTS BY STOCK VALUE / QUANTITY (Bar Chart) ---
  const topProductsData = useMemo(() => {
    return products
      .map(p => ({
        name: p.name,
        stock: p.stockQuantity,
        minStock: p.minimumStock,
        value: parseFloat((p.stockQuantity * p.purchasePrice).toFixed(2))
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [products]);

  // --- CHART 3: STOCK MOVEMENTS TREND OVER TIME (Area Chart) ---
  const movementsTrendData = useMemo(() => {
    // Group movements by date (last 7 days with transactions)
    const grouped: Record<string, { date: string; incoming: number; outgoing: number }> = {};
    
    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      grouped[dateStr] = { date: dateStr, incoming: 0, outgoing: 0 };
    }

    movements.forEach(m => {
      const mDate = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt);
      const dateStr = mDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      
      // If within our 7-day range, aggregate volume
      if (grouped[dateStr] !== undefined) {
        if (m.type === 'PURCHASE_IN' || m.type === 'SALE_RETURN' || m.type === 'SALE_CANCEL_REVERSE') {
          grouped[dateStr].incoming += Math.abs(m.quantity);
        } else if (
          m.type === 'SALE_OUT'
          || m.type === 'MANUAL_ADJUST'
          || m.type === 'PURCHASE_DELETE_REVERSE'
          || m.type === 'PURCHASE_CANCEL_REVERSE'
        ) {
          grouped[dateStr].outgoing += Math.abs(m.quantity);
        }
      }
    });

    return Object.values(grouped);
  }, [movements]);

  // --- LOW STOCK ALERT ITEMS ---
  const lowStockAlerts = useMemo(() => {
    return products
      .filter(p => p.stockQuantity <= p.minimumStock)
      .sort((a, b) => {
        // Out of stock first, then lowest percentage of min stock
        if (a.stockQuantity === 0 && b.stockQuantity > 0) return -1;
        if (b.stockQuantity === 0 && a.stockQuantity > 0) return 1;
        const ratioA = a.stockQuantity / (a.minimumStock || 1);
        const ratioB = b.stockQuantity / (b.minimumStock || 1);
        return ratioA - ratioB;
      })
      .slice(0, 5);
  }, [products]);

  // --- CRITICAL EXPIRY ITEMS ---
  const criticalExpiryAlerts = useMemo(() => {
    const now = new Date();
    const soonThreshold = new Date();
    soonThreshold.setDate(soonThreshold.getDate() + 60);

    return products
      .filter(p => {
        if (!p.expiryDate) return false;
        const expiry = toJsDate(p.expiryDate);
        return expiry <= soonThreshold;
      })
      .sort((a, b) => {
        const dateA = toJsDate(a.expiryDate);
        const dateB = toJsDate(b.expiryDate);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 5);
  }, [products]);

  // --- FILTERED MOVEMENT LEDGER ---
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      const matchesSearch = 
        m.productName.toLowerCase().includes(movementSearch.toLowerCase()) ||
        (m.batchNumber && m.batchNumber.toLowerCase().includes(movementSearch.toLowerCase())) ||
        (m.invoiceId && m.invoiceId.toLowerCase().includes(movementSearch.toLowerCase())) ||
        (m.purchaseId && m.purchaseId.toLowerCase().includes(movementSearch.toLowerCase()));

      const matchesType = 
        movementTypeFilter === 'all' ||
        (movementTypeFilter === 'in' && (m.type === 'PURCHASE_IN' || m.type === 'SALE_RETURN' || m.type === 'SALE_CANCEL_REVERSE')) ||
        (movementTypeFilter === 'out' && (m.type === 'SALE_OUT' || m.type === 'PURCHASE_DELETE_REVERSE' || m.type === 'PURCHASE_CANCEL_REVERSE')) ||
        (movementTypeFilter === 'adjust' && m.type === 'MANUAL_ADJUST');

      return matchesSearch && matchesType;
    });
  }, [movements, movementSearch, movementTypeFilter]);

  return (
    <div className="space-y-8">
      {/* 1. Bento Grid KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border-border bg-surface flex items-center justify-between group hover:border-primary/40 transition-all duration-300">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-text/40 uppercase tracking-widest block">Total Valuation</span>
            <span className="text-xl font-black text-text block tracking-tight">{formatCurrency(stats.totalValue)}</span>
            <span className="text-[9px] font-black text-success flex items-center gap-1 uppercase tracking-wider">
              <TrendingUp className="h-3 w-3" /> Active Stock Capital
            </span>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-success/10 flex items-center justify-center text-success group-hover:scale-110 transition-transform">
            <Activity className="h-6 w-6" />
          </div>
        </Card>

        <Card className="p-5 border-border bg-surface flex items-center justify-between group hover:border-primary/40 transition-all duration-300">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-text/40 uppercase tracking-widest block">Low-Stock Items</span>
            <span className="text-xl font-black text-warning block tracking-tight">{stats.lowStock} Items</span>
            <span className="text-[9px] font-black text-warning flex items-center gap-1 uppercase tracking-wider">
              {stats.outOfStock > 0 ? `${stats.outOfStock} completely out` : 'Requires Review'}
            </span>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-warning/10 flex items-center justify-center text-warning group-hover:scale-110 transition-transform">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </Card>

        <Card className="p-5 border-border bg-surface flex items-center justify-between group hover:border-primary/40 transition-all duration-300">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-text/40 uppercase tracking-widest block">Critical Expiry</span>
            <span className="text-xl font-black text-danger block tracking-tight">{stats.expiringSoon} Batch(es)</span>
            <span className="text-[9px] font-black text-danger flex items-center gap-1 uppercase tracking-wider">
              Expiring in 60 Days
            </span>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-danger/10 flex items-center justify-center text-danger group-hover:scale-110 transition-transform">
            <Clock className="h-6 w-6" />
          </div>
        </Card>

        <Card className="p-5 border-border bg-surface flex items-center justify-between group hover:border-primary/40 transition-all duration-300">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-text/40 uppercase tracking-widest block">Total Inventory Volume</span>
            <span className="text-xl font-black text-text block tracking-tight">{stats.totalVolume.toLocaleString()} Units</span>
            <span className="text-[9px] font-black text-text/40 uppercase tracking-wider">
              Across {stats.totalUnique} Unique SKUs
            </span>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <Layers className="h-6 w-6" />
          </div>
        </Card>
      </div>

      {/* 2. Visual Charts Row */}
      {(settings?.showDashboardCharts ?? true) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart A: Stock Value Distribution by Category (7 cols) */}
          <Card className="lg:col-span-7 p-6 border-border bg-surface flex flex-col justify-between">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-text uppercase tracking-widest">Inventory Financial Distribution</h3>
                <p className="text-[10px] font-bold text-text/40 tracking-wider uppercase">Stock Valuation By Drug Category (INR)</p>
              </div>
              <span className="text-[9px] font-black text-primary bg-primary/10 px-2 py-1 rounded-md uppercase tracking-wider">
                Valuation density
              </span>
            </div>

            {stockByCategoryData.length === 0 ? (
              <div className="h-[280px] flex flex-col items-center justify-center text-text/30 font-bold text-xs uppercase">
                No product stock data to display
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-6 h-[260px] w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stockByCategoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {stockByCategoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any) => [formatCurrency(value), 'Valuation']}
                        contentStyle={{ 
                          borderRadius: '16px', 
                          border: '1px solid #E2E8F0', 
                          backgroundColor: '#FFF', 
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
                          fontFamily: 'Inter, sans-serif',
                          fontSize: '11px',
                          fontWeight: 'bold'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend List */}
                <div className="md:col-span-6 space-y-2 max-h-[260px] overflow-y-auto custom-scrollbar pr-2">
                  {stockByCategoryData.map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between p-2 rounded-xl hover:bg-background/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <span className="text-[11px] font-black text-text/70 uppercase tracking-wider truncate max-w-[120px]">{item.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11.5px] font-black text-text block">{formatCurrency(item.value)}</span>
                        <span className="text-[9px] font-bold text-text/30 uppercase">{item.count} Units</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Chart B: Top Products by Valuation (5 cols) */}
          <Card className="lg:col-span-5 p-6 border-border bg-surface flex flex-col justify-between">
            <div className="mb-6">
              <h3 className="text-sm font-black text-text uppercase tracking-widest">Highest Capital Assets</h3>
              <p className="text-[10px] font-bold text-text/40 tracking-wider uppercase">Top Products by Stock Value (INR)</p>
            </div>

            {topProductsData.length === 0 ? (
              <div className="h-[280px] flex flex-col items-center justify-center text-text/30 font-bold text-xs uppercase">
                Add products with stock value
              </div>
            ) : (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProductsData} layout="vertical" margin={{ left: -10, right: 10, top: 0, bottom: 0 }}>
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#94A3B8' }} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      width={90}
                      tickFormatter={(name) => name.length > 12 ? `${name.substring(0, 10)}...` : name}
                      tick={{ fontSize: 9.5, fontWeight: 'black', fill: '#64748B' }} 
                    />
                    <Tooltip
                      formatter={(value: any) => [formatCurrency(value), 'Valuation']}
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: '1px solid #E2E8F0', 
                        backgroundColor: '#FFF', 
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}
                    />
                    <Bar dataKey="value" fill="#0EA5E9" radius={[0, 8, 8, 0]}>
                      {topProductsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 3. Alerts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column A: Low Stock & Reorder Alert Panels */}
        <Card className="p-6 border-border bg-surface">
          <div className="flex items-center justify-between mb-5 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-warning/10 flex items-center justify-center text-warning">
                <AlertTriangle className="h-4.5 w-4.5" />
              </div>
              <h3 className="text-xs font-black text-text uppercase tracking-widest">Low Stock Alerts</h3>
            </div>
            <Badge variant="warning" className="text-[8px] font-black uppercase">ACTION REQUIRED</Badge>
          </div>

          {lowStockAlerts.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success mb-2">
                <Package className="h-5 w-5" />
              </div>
              <p className="text-xs font-black text-text/60 uppercase tracking-wide">All stock levels are optimal</p>
              <p className="text-[9px] font-bold text-text/40 mt-1">No items are below their minimum thresholds.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {lowStockAlerts.map(p => {
                const ratio = Math.min(1, p.stockQuantity / (p.minimumStock || 1));
                const percentage = Math.round(ratio * 100);
                const suggestedQty = intelligence[p.id]?.suggestedQuantity || p.minimumStock * 2;

                return (
                  <div key={p.id} className="p-3.5 rounded-2xl bg-background/50 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-primary/30 transition-all duration-300">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-text group-hover:text-primary transition-colors">{p.name}</span>
                          <span className="text-[9px] font-bold text-text/30 uppercase tracking-widest">{p.sku} • {p.category}</span>
                        </div>
                        <Badge variant={p.stockQuantity === 0 ? 'danger' : 'warning'} className="text-[8px] px-1.5 font-bold">
                          {p.stockQuantity === 0 ? 'OUT OF STOCK' : 'LOW STOCK'}
                        </Badge>
                      </div>

                      {/* Stock Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[8px] font-black uppercase text-text/40">
                          <span>STOCK DEPLETION RATIO</span>
                          <span className={cn(p.stockQuantity === 0 ? 'text-danger' : 'text-warning')}>
                            {p.stockQuantity} / {p.minimumStock} {p.unit} ({percentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              p.stockQuantity === 0 ? 'bg-danger' : 'bg-warning'
                            )}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 md:border-l md:border-border md:pl-4">
                      <div className="text-left md:text-right">
                        <span className="text-[8px] font-black text-text/40 block uppercase tracking-widest">SUGGESTED REORDER</span>
                        <span className="text-xs font-black text-primary block mt-0.5">{suggestedQty} {p.unit}</span>
                      </div>
                      <div className="flex gap-1.5">
                        {onViewProduct && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 py-0 px-2.5 text-[8.5px] font-black uppercase rounded-lg"
                            onClick={() => onViewProduct(p)}
                          >
                            View
                          </Button>
                        )}
                        {onEditProduct && (
                          <Button 
                            variant="primary" 
                            size="sm" 
                            className="h-8 py-0 px-2.5 text-[8.5px] font-black uppercase rounded-lg"
                            onClick={() => onEditProduct(p)}
                          >
                            Adjust
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Column B: Expiry Risk Panel */}
        <Card className="p-6 border-border bg-surface">
          <div className="flex items-center justify-between mb-5 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-danger/10 flex items-center justify-center text-danger">
                <Clock className="h-4.5 w-4.5" />
              </div>
              <h3 className="text-xs font-black text-text uppercase tracking-widest">Shelf-Life Risk (Expiry)</h3>
            </div>
            <Badge variant="danger" className="text-[8px] font-black uppercase">CRITICAL ACTION</Badge>
          </div>

          {criticalExpiryAlerts.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success mb-2">
                <Clock className="h-5 w-5" />
              </div>
              <p className="text-xs font-black text-text/60 uppercase tracking-wide">No short-expiry batches found</p>
              <p className="text-[9px] font-bold text-text/40 mt-1">All batches are well within safe shelf-life limits.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {criticalExpiryAlerts.map(p => {
                const expiryDate = toJsDate(p.expiryDate);
                const daysToExpiry = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                const isExpired = daysToExpiry <= 0;

                return (
                  <div key={p.id} className="p-3.5 rounded-2xl bg-background/50 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-primary/30 transition-all duration-300">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex flex-col items-center justify-center text-center border font-black",
                        isExpired ? "bg-danger/10 border-danger/30 text-danger" : "bg-warning/10 border-warning/30 text-warning"
                      )}>
                        <span className="text-[8px] uppercase font-black leading-none">{expiryDate.toLocaleDateString('en-IN', { month: 'short' })}</span>
                        <span className="text-sm font-black leading-none mt-0.5">{expiryDate.getDate()}</span>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-xs font-black text-text group-hover:text-primary transition-colors">{p.name}</span>
                        <span className="text-[9px] font-bold text-text/30 uppercase tracking-widest">
                          SKU: {p.sku} • BATCH: {p.batchNumber || 'N/A'}
                        </span>
                        <span className="text-[9.5px] font-black text-text/60 mt-0.5">
                          Stock Quantity: <span className="font-bold text-text">{p.stockQuantity} {p.unit}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:border-l sm:border-border sm:pl-4">
                      <div className="text-left sm:text-right">
                        <span className="text-[8px] font-black text-text/40 block uppercase tracking-widest">SHELF-LIFE STATUS</span>
                        {isExpired ? (
                          <span className="text-[10px] font-black text-danger uppercase tracking-wider block mt-0.5 animate-pulse">EXPIRED</span>
                        ) : (
                          <span className="text-[10.5px] font-black text-warning block mt-0.5">{daysToExpiry} days left</span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        {onViewProduct && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 py-0 px-2.5 text-[8.5px] font-black uppercase rounded-lg"
                            onClick={() => onViewProduct(p)}
                          >
                            Details
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* 4. Movements Trend & Real-time Ledger */}
      <Card className="p-6 border-border bg-surface">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-border pb-4">
          <div>
            <h3 className="text-sm font-black text-text uppercase tracking-widest">Stock Movements Trend & Ledger</h3>
            <p className="text-[10px] font-bold text-text/40 tracking-wider uppercase">Aggregated activity trends & individual action timeline</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Type Filters */}
            <div className="flex border border-border rounded-xl p-1 bg-background">
              <button 
                onClick={() => setMovementTypeFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  movementTypeFilter === 'all' ? "bg-primary text-white" : "text-text/50 hover:text-text"
                )}
              >
                All
              </button>
              <button 
                onClick={() => setMovementTypeFilter('in')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  movementTypeFilter === 'in' ? "bg-success/20 text-success" : "text-text/50 hover:text-text"
                )}
              >
                Inflow
              </button>
              <button 
                onClick={() => setMovementTypeFilter('out')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  movementTypeFilter === 'out' ? "bg-danger/20 text-danger" : "text-text/50 hover:text-text"
                )}
              >
                Outflow
              </button>
              <button 
                onClick={() => setMovementTypeFilter('adjust')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                  movementTypeFilter === 'adjust' ? "bg-warning/20 text-warning" : "text-text/50 hover:text-text"
                )}
              >
                Adjust
              </button>
            </div>

            {/* Ledger Search */}
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text/20 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Search ledger..."
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                className="pl-9 pr-4 py-1.5 h-10 w-44 md:w-56 rounded-xl border border-border bg-background focus:border-primary transition-all outline-none text-xs font-bold"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Chart C: Stock Inflow vs Outflow Volume (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-3.5 rounded-2xl bg-background/50 border border-border flex items-center justify-between">
              <span className="text-[10px] font-black text-text/40 uppercase tracking-widest">7-Day Aggregated activity</span>
              <span className="text-[8.5px] font-bold text-primary flex items-center gap-1 uppercase">
                Volume Analysis
              </span>
            </div>
            
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={movementsTrendData}>
                  <defs>
                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fontWeight: 'black', fill: '#94A3B8' }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fontWeight: 'black', fill: '#94A3B8' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: '1px solid #E2E8F0', 
                      backgroundColor: '#FFF', 
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                  />
                  <Legend iconSize={10} verticalAlign="top" height={36} wrapperStyle={{ fontSize: 10, fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Area 
                    type="monotone" 
                    dataKey="incoming" 
                    name="Inflow (Stock In)"
                    stroke="#10B981" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#colorIn)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="outgoing" 
                    name="Outflow (Billing/Sales)"
                    stroke="#EF4444" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#colorOut)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Real-time Ledger (7 cols) */}
          <div className="lg:col-span-7">
            <div className="max-h-[300px] overflow-y-auto custom-scrollbar border border-border rounded-2xl divide-y divide-border bg-background/30 pr-1">
              {loadingMovements ? (
                <div className="py-20 flex flex-col items-center justify-center">
                  <RefreshCw className="h-6 w-6 text-primary animate-spin mb-2" />
                  <span className="text-xs font-black text-text/40 uppercase tracking-widest">Loading Movement Records...</span>
                </div>
              ) : filteredMovements.length === 0 ? (
                <div className="py-24 flex flex-col items-center justify-center text-center">
                  <div className="h-10 w-10 rounded-full bg-text/5 flex items-center justify-center text-text/20 mb-2">
                    <Activity className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-black text-text/40 uppercase tracking-widest">No matching activities found</span>
                  <span className="text-[9px] font-bold text-text/30 mt-1">Activities populate on Billing Checkout and Stock-In Purchases</span>
                </div>
              ) : (
                filteredMovements.map((m) => {
                  const mDate = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt);
                  
                  // Get badges config
                  let typeLabel: string = m.type;
                  let typeBadgeVariant: 'success' | 'danger' | 'warning' | 'neutral' = 'neutral';
                  
                  if (m.type === 'PURCHASE_IN') {
                    typeLabel = 'STOCK IN';
                    typeBadgeVariant = 'success';
                  } else if (m.type === 'SALE_OUT') {
                    typeLabel = 'SALES BILL';
                    typeBadgeVariant = 'danger';
                  } else if (m.type === 'SALE_RETURN') {
                    typeLabel = 'SALE RETURN';
                    typeBadgeVariant = 'success';
                  } else if (m.type === 'SALE_CANCEL_REVERSE') {
                    typeLabel = 'INVOICE CANCELLED';
                    typeBadgeVariant = 'success';
                  } else if (m.type === 'MANUAL_ADJUST') {
                    typeLabel = 'ADJUST';
                    typeBadgeVariant = 'warning';
                  } else if (m.type === 'PURCHASE_DELETE_REVERSE') {
                    typeLabel = 'PURCHASE REVERSED';
                    typeBadgeVariant = 'danger';
                  } else if (m.type === 'PURCHASE_CANCEL_REVERSE') {
                    typeLabel = 'PURCHASE CANCELLED';
                    typeBadgeVariant = 'danger';
                  }

                  return (
                    <div key={m.id} className="p-3.5 hover:bg-background/80 transition-colors flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Circle indicating inflow/outflow direction */}
                        <div className={cn(
                          "h-8 w-8 rounded-full shrink-0 flex items-center justify-center font-black text-xs border",
                          typeBadgeVariant === 'success' ? "bg-success/10 border-success/20 text-success" : 
                          typeBadgeVariant === 'danger' ? "bg-danger/10 border-danger/20 text-danger" : 
                          "bg-warning/10 border-warning/20 text-warning"
                        )}>
                          {typeBadgeVariant === 'success' ? '+' : typeBadgeVariant === 'danger' ? '-' : '•'}
                        </div>

                        <div className="min-w-0 flex flex-col">
                          <span className="text-xs font-black text-text truncate max-w-[180px] sm:max-w-xs">{m.productName}</span>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <Badge variant={typeBadgeVariant} className="text-[7.5px] px-1 py-0 font-bold uppercase tracking-widest">{typeLabel}</Badge>
                            <span className="text-[9px] font-bold text-text/30 uppercase">QTY: {m.quantity}</span>
                            {m.batchNumber && (
                              <span className="text-[9px] font-bold text-text/30 uppercase">BATCH: {m.batchNumber}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Timestamp & Stocks Ledger */}
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-black text-text block tracking-tight">
                          {typeBadgeVariant === 'success' ? '+' : '-'}{m.quantity} Units
                        </span>
                        <div className="flex items-center justify-end gap-1.5 text-[8.5px] font-bold text-text/30 mt-0.5">
                          <span>{mDate.toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{mDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <span className="text-[8px] font-black uppercase text-primary bg-primary/5 px-1 rounded block mt-1 tracking-wider">
                          Ledger: {m.previousStock} → {m.newStock}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
