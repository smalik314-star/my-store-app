import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'danger' | 'warning' | 'info' | 'neutral';
  children?: ReactNode;
  className?: string;
}

export function Badge({ 
  children, 
  variant = 'neutral', 
  className,
  ...props 
}: BadgeProps) {
  const variants = {
    success: 'bg-success/10 text-success border-success/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
    warning: 'bg-accent/10 text-accent border-accent/20',
    info: 'bg-secondary/10 text-secondary border-secondary/20',
    neutral: 'bg-text/5 text-text border-text/10',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
