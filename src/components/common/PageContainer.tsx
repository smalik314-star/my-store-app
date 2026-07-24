import { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../utils/cn';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("space-y-5 max-w-[1600px] mx-auto w-full", className)}
    >
      {children}
    </motion.div>
  );
}

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ 
  title, 
  description, 
  action,
  className 
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5", className)}>
      <div>
        <h1 className="text-xl font-bold text-text md:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-text/55">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-3">
          {action}
        </div>
      )}
    </div>
  );
}
