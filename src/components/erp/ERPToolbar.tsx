import { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface ERPToolbarProps {
  primary?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ERPToolbar({ primary, filters, actions, className }: ERPToolbarProps) {
  return (
    <section
      aria-label="Page tools"
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border bg-surface p-2.5 lg:flex-row lg:items-center',
        className
      )}
    >
      {primary && <div className="min-w-0 flex-1">{primary}</div>}
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
    </section>
  );
}
