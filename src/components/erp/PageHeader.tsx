import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, breadcrumbs = [], actions, className }: PageHeaderProps) {
  return (
    <header className={cn('space-y-2 border-b border-border pb-4', className)}>
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-text/55">
            {breadcrumbs.map((item, index) => (
              <li key={`${item.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                {item.to ? (
                  <Link className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded" to={item.to}>
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="font-medium text-text/75">{item.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-text/60">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
