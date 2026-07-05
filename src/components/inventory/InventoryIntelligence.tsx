import React from 'react';
import { motion } from 'motion/react';
import { 
  Activity, 
  TrendingUp, 
  AlertCircle, 
  Calendar, 
  Zap, 
  Skull,
  CheckCircle2,
  BarChart3,
  Package
} from 'lucide-react';
import { Card } from '../common/Card';
import { cn } from '../../utils/cn';
import { ProductIntelligence } from '../../services/inventoryIntelligenceService';

interface InventoryIntelligenceProps {
  intelligence: Record<string, ProductIntelligence>;
  loading: boolean;
}

export function InventoryIntelligence({ intelligence, loading }: InventoryIntelligenceProps) {
  const stats = React.useMemo(() => {
    const values = Object.values(intelligence);
    return {
      healthy: values.filter(v => v.status === 'Healthy').length,
      watch: values.filter(v => v.status === 'Watch').length,
      critical: values.filter(v => v.status === 'Critical').length,
      fastMoving: values.filter(v => v.movement === 'Fast Moving').length,
      slowMoving: values.filter(v => v.movement === 'Slow Moving').length,
      deadStock: values.filter(v => v.movement === 'Dead Stock').length,
      reorderCount: values.filter(v => v.reorderRequired).length
    };
  }, [intelligence]);

  if (loading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-32 bg-surface animate-pulse rounded-3xl" />
      ))}
    </div>
  );

  return (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <IntelligenceCard 
          label="Stock Health" 
          value={`${stats.healthy}`}
          total={Object.keys(intelligence).length}
          icon={Activity}
          color="success"
          description="Items with optimal stock levels"
        />
        <IntelligenceCard 
          label="Reorder Alerts" 
          value={`${stats.reorderCount}`}
          icon={AlertCircle}
          color="warning"
          description="Products below threshold"
          priority={stats.reorderCount > 0}
        />
        <IntelligenceCard 
          label="Fast Moving" 
          value={`${stats.fastMoving}`}
          icon={Zap}
          color="primary"
          description="High frequency sales"
        />
        <IntelligenceCard 
          label="Dead Stock" 
          value={`${stats.deadStock}`}
          icon={Skull}
          color="danger"
          description="No sales in 60 days"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6 border-border flex items-center justify-between select-none">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-info/10 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-info" />
            </div>
            <div>
              <h4 className="text-sm font-black text-text uppercase tracking-widest">Demand Forecast</h4>
              <p className="text-xs font-bold text-text/40 mt-1">AI calculated replenishment dates active</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-lg font-black text-info">Predictive</span>
          </div>
        </Card>

        <Card className="p-6 border-border flex items-center justify-between select-none">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-accent/10 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h4 className="text-sm font-black text-text uppercase tracking-widest">Usage Patterns</h4>
              <p className="text-xs font-bold text-text/40 mt-1">Tracking weekly & monthly trends</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-lg font-black text-accent">Real-time</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

function IntelligenceCard({ label, value, total, icon: Icon, color, description, priority }: any) {
  const colorMap = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    danger: "text-danger bg-danger/10",
    info: "text-info bg-info/10"
  };

  return (
    <Card className={cn(
      "p-6 border-border transition-all",
      priority && "border-warning/50 bg-warning/5 ring-4 ring-warning/5"
    )}>
      <div className="flex items-start justify-between">
        <div className={cn("p-3 rounded-2xl", colorMap[color as keyof typeof colorMap])}>
          <Icon className="h-5 w-5" />
        </div>
        {total && (
          <span className="text-[10px] font-black text-text/20 uppercase tracking-widest">
            {total} Total
          </span>
        )}
      </div>
      <div className="mt-4">
        <h3 className="text-2xl font-black text-text tracking-tighter">{value}</h3>
        <p className="text-[10px] font-black text-text/40 uppercase tracking-widest mt-1">{label}</p>
        <p className="text-[10px] font-bold text-text/30 mt-2 line-clamp-1">{description}</p>
      </div>
    </Card>
  );
}
