import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { Card } from '../common/Card';
import { Invoice, Product } from '../../types';

interface DashboardChartsProps {
  invoices: Invoice[];
  products: Product[];
  loading?: boolean;
}

export function DashboardCharts({ invoices, products, loading }: DashboardChartsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="h-[350px] animate-pulse bg-border/10" />
        <Card className="h-[350px] animate-pulse bg-border/10" />
      </div>
    );
  }

  // Process data for charts
  const monthlyData = [
    { name: 'Jan', revenue: 4000, sales: 240 },
    { name: 'Feb', revenue: 3000, sales: 198 },
    { name: 'Mar', revenue: 2000, sales: 150 },
    { name: 'Apr', revenue: 2780, sales: 210 },
    { name: 'May', revenue: 1890, sales: 120 },
    { name: 'Jun', revenue: 2390, sales: 170 },
  ];

  // Distribution by category
  const categories = products.reduce((acc: any, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.keys(categories).map(cat => ({
    name: cat,
    value: categories[cat]
  })).slice(0, 5);

  const COLORS = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="p-6 border-white/20 shadow-xl overflow-hidden flex flex-col">
        <div className="mb-6">
          <h3 className="text-base font-bold text-text tracking-tight">Revenue Analysis</h3>
          <p className="text-[11px] text-text/40 font-bold uppercase tracking-wider">Financial trends over time</p>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fontWeight: 600, fill: '#94A3B8' }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fontWeight: 600, fill: '#94A3B8' }}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#0EA5E9" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorRev)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6 border-white/20 shadow-xl overflow-hidden flex flex-col">
        <div className="mb-6">
          <h3 className="text-base font-bold text-text tracking-tight">Inventory Split</h3>
          <p className="text-[11px] text-text/40 font-bold uppercase tracking-wider">Top product categories</p>
        </div>
        <div className="h-[300px] w-full flex items-center justify-center">
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center">
              <p className="text-sm text-text/40 font-medium">No inventory data for distribution</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
