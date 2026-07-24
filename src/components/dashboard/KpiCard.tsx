import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';
import { Card } from '../common/Card';
import { cn } from '../../utils/cn';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  isUp?: boolean;
  loading?: boolean;
  colorClass?: string;
  isHoverable?: boolean;
  onClick?: () => void;
}

export function KpiCard({ 
  label, 
  value, 
  icon: Icon, 
  trend, 
  isUp, 
  loading, 
  colorClass = "bg-primary/10 text-primary",
  isHoverable,
  onClick
}: KpiCardProps) {
  if (loading) {
    return (
      <Card className="p-4 border-border relative overflow-hidden">
        <div className="animate-pulse flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 bg-text/5 rounded-md" />
            <div className="h-10 w-10 bg-text/5 rounded-xl" />
          </div>
          <div className="flex flex-col mt-1 gap-2">
            <div className="h-8 w-24 bg-text/10 rounded-lg" />
            <div className="h-4 w-32 bg-text/5 rounded-md mt-1" />
          </div>
        </div>
        {/* Decorative subtle gradient */}
        <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-primary/5 blur-2xl" />
      </Card>
    );
  }

  return (
    <motion.div
      whileHover={isHoverable ? { y: -2 } : {}}
      transition={{ type: 'spring', stiffness: 300 }}
      onClick={onClick}
      className={isHoverable ? 'cursor-pointer' : ''}
    >
      <Card className={cn(
        "flex flex-col gap-2 p-4 hover:shadow-md transition-all border-border overflow-hidden relative group",
        isHoverable && "hover:border-primary/30"
      )}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text/55 uppercase tracking-[0.14em] font-black">{label}</span>
          <div className={`p-2 rounded-lg ${colorClass} group-hover:scale-105 transition-transform`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        
        <div className="flex flex-col mt-1">
          <span className="text-xl font-black text-text tracking-tight">{value}</span>
          {trend && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className={`flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded-md ${isUp ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {isUp ? '▲' : '▼'} {trend}
              </span>
              <span className="text-[11px] text-text/40 font-medium italic">vs last month</span>
            </div>
          )}
        </div>

        {/* Decorative subtle gradient */}
        <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
      </Card>
    </motion.div>
  );
}
