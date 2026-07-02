import { ReactNode } from 'react';
import { PackageOpen } from 'lucide-react';
import { cn } from '../../utils/cn';
import { motion } from 'motion/react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ 
  title, 
  description, 
  icon, 
  action,
  className 
}: EmptyStateProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col items-center justify-center p-12 text-center",
        className
      )}
    >
      <div className="mb-6 rounded-[2rem] bg-surface p-8 text-text/10 shadow-2xl shadow-primary/5 border border-border group-hover:scale-105 transition-transform duration-500">
        {icon || <PackageOpen className="h-20 w-20" />}
      </div>
      <h3 className="mb-2 text-xl font-black text-text tracking-tight uppercase">{title}</h3>
      <p className="mb-8 max-w-xs text-sm font-bold text-text/40 leading-relaxed">{description}</p>
      {action}
    </motion.div>
  );
}
