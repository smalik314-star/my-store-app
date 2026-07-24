import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Card } from '../common/Card';
import { Invoice } from '../../types';
import { formatCurrency, formatCurrencyCompact } from '../../utils/currency';
import { toJsDate } from '../../utils/date';

interface DashboardChartsProps {
  invoices: Invoice[];
  loading?: boolean;
}

const PAYMENT_COLORS: Record<Invoice['paymentMethod'], string> = {
  cash: '#0b6b63',
  upi: '#0f9f91',
  card: '#2563eb',
  credit: '#d97706',
};

export function DashboardCharts({ invoices, loading }: DashboardChartsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="h-[280px] md:h-[350px] animate-pulse bg-border/10" />
        <Card className="h-[280px] md:h-[350px] animate-pulse bg-border/10" />
      </div>
    );
  }

  const now = new Date();
  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      name: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date),
      revenue: 0,
      invoices: 0,
    };
  });

  invoices.forEach((invoice) => {
    const createdAt = toJsDate(invoice.createdAt);
    if (Number.isNaN(createdAt.getTime())) return;
    const bucket = monthBuckets.find(
      item => item.key === `${createdAt.getFullYear()}-${createdAt.getMonth()}`
    );
    if (!bucket) return;
    bucket.revenue += Number(invoice.grandTotal) || 0;
    bucket.invoices += 1;
  });

  const paymentTotals = invoices.reduce<Record<string, number>>((acc, invoice) => {
    const method = invoice.paymentMethod || 'credit';
    acc[method] = (acc[method] || 0) + (Number(invoice.grandTotal) || 0);
    return acc;
  }, {});

  const paymentData = Object.entries(paymentTotals)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      method: name as Invoice['paymentMethod'],
      value,
    }));

  const hasRevenue = monthBuckets.some(item => item.revenue > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-4 sm:p-5 overflow-hidden flex flex-col">
        <div className="mb-4">
          <h3 className="text-sm sm:text-base font-bold text-text tracking-tight">Revenue Analysis</h3>
          <p className="text-[10px] sm:text-[11px] text-text/40 font-bold uppercase tracking-wider">
            Real invoice totals · last 6 months
          </p>
        </div>
        <div className="h-[240px] sm:h-[280px] w-full">
          {hasRevenue ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthBuckets} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0b6b63" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#0b6b63" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dbe6e3" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 600, fill: '#6b7f7c' }}
                />
                <YAxis
                  width={58}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fontWeight: 600, fill: '#6b7f7c' }}
                  tickFormatter={(value) => formatCurrencyCompact(value)}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  labelFormatter={(label) => `${label} invoice revenue`}
                  contentStyle={{ borderRadius: '10px', border: '1px solid #dbe6e3' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0b6b63"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState message="No invoice revenue is available for this period." />
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-5 overflow-hidden flex flex-col">
        <div className="mb-4">
          <h3 className="text-sm sm:text-base font-bold text-text tracking-tight">Payment Mode Summary</h3>
          <p className="text-[10px] sm:text-[11px] text-text/40 font-bold uppercase tracking-wider">
            Based on saved invoice payment methods
          </p>
        </div>
        <div className="min-h-[240px] sm:min-h-[280px] grid grid-cols-1 min-[390px]:grid-cols-[1fr_130px] items-center gap-3">
          {paymentData.length > 0 ? (
            <>
              <div className="h-[210px] sm:h-[250px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentData}
                      cx="50%"
                      cy="50%"
                      innerRadius="48%"
                      outerRadius="76%"
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {paymentData.map(item => (
                        <Cell
                          key={item.method}
                          fill={PAYMENT_COLORS[item.method] || '#64748b'}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Amount']}
                      contentStyle={{ borderRadius: '10px', border: '1px solid #dbe6e3' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 min-[390px]:grid-cols-1 gap-2">
                {paymentData.map(item => (
                  <div key={item.method} className="min-w-0 rounded-lg border border-border bg-background px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: PAYMENT_COLORS[item.method] || '#64748b' }}
                      />
                      <span className="truncate text-[10px] font-black uppercase tracking-wide text-text/55">
                        {item.name}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-black text-text">
                      {formatCurrencyCompact(item.value)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="min-[390px]:col-span-2">
              <ChartEmptyState message="Payment summary will appear after the first invoice." />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[210px] items-center justify-center rounded-xl border border-dashed border-border bg-background/60 p-6 text-center">
      <p className="max-w-xs text-xs font-medium leading-relaxed text-text/45">{message}</p>
    </div>
  );
}
