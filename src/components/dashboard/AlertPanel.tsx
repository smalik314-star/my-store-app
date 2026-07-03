import { motion } from 'motion/react';
import { AlertCircle, Calendar, ChevronRight } from 'lucide-react';
import { Card } from '../common/Card';
import { Product } from '../../types';
import { toJsDate } from '../../utils/date';

import { cn } from '../../utils/cn';

interface AlertPanelProps {
  title: string;
  items: Product[];
  type: 'stock' | 'expiry';
  loading?: boolean;
}

export function AlertPanel({ title, items, type, loading }: AlertPanelProps) {
  if (loading) {
    return (
      <Card className="p-0 overflow-hidden">
        <div className="h-14 bg-border/20 animate-pulse border-b border-border" />
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-border/20 animate-pulse rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  const isStock = type === 'stock';

  return (
    <Card className="p-0 overflow-hidden flex flex-col border-white/20">
      <div className="flex items-center justify-between p-5 border-b border-border bg-background/50">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-text uppercase tracking-wider">{title}</h3>
          <span className={cn(
            "flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold text-white",
            items.length > 0 ? (isStock ? "bg-danger" : "bg-warning shadow-warning/20") : "bg-success"
          )}>
            {items.length}
          </span>
        </div>
        {isStock ? <AlertCircle className="h-4 w-4 text-danger" /> : <Calendar className="h-4 w-4 text-warning" />}
      </div>

      <div className="p-4 flex flex-col gap-3 min-h-[120px]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center mb-3">
              <span className="text-success text-lg">✓</span>
            </div>
            <p className="text-xs text-text/40 font-medium">All clear! No {isStock ? 'low stock' : 'expiring'} items.</p>
          </div>
        ) : (
          items.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={cn(
                "group flex items-center gap-4 p-3 rounded-xl border transition-all hover:shadow-md cursor-pointer",
                isStock ? "border-danger/10 bg-danger/5 hover:bg-danger/10" : "border-warning/10 bg-warning/5 hover:bg-warning/10"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-text truncate">{item.name}</p>
                  <p className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap",
                    isStock ? "bg-danger text-white" : "bg-warning text-white"
                  )}>
                    {isStock ? `${item.stockQuantity} left` : toJsDate(item.expiryDate).toLocaleDateString()}
                  </p>
                </div>
                <p className="text-[11px] text-text/60 mt-0.5 font-medium">
                  {isStock ? `Min. stock: ${item.minimumStock}` : `Batch: ${item.batchNumber}`}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-text/20 group-hover:text-text/40 transition-colors" />
            </motion.div>
          ))
        )}
      </div>
      
      {items.length > 0 && (
        <button className="w-full py-3 text-[11px] font-bold text-text/40 hover:text-primary transition-colors border-t border-border bg-background/30">
          VIEW ALL {isStock ? 'STOCK' : 'EXPIRING'}
        </button>
      )}
    </Card>
  );
}
