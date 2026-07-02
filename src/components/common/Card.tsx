import { ReactNode } from 'react';
import { motion, HTMLMotionProps, useReducedMotion } from 'motion/react';
import { cn } from '../../utils/cn';
import { transitions } from '../../utils/animations';

interface CardProps extends HTMLMotionProps<'div'> {
  children?: ReactNode;
  isHoverable?: boolean;
}

export function Card({ children, className, isHoverable = false, ...props }: CardProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={isHoverable && !shouldReduceMotion ? { 
        y: -5, 
        boxShadow: '0 20px 25px -5px rgb(var(--color-primary) / 0.1), 0 8px 10px -6px rgb(var(--color-primary) / 0.1)',
        borderColor: 'rgb(var(--color-primary) / 0.2)'
      } : undefined}
      transition={transitions.smooth}
      className={cn(
        'bg-surface rounded-3xl border border-border p-6 shadow-sm transition-all duration-300',
        isHoverable && 'cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
