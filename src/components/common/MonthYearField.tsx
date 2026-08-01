import React, { useMemo, useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '../../utils/cn';
import { RequiredMark } from './RequiredMark';

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label: new Date(2020, index, 1).toLocaleDateString('en-IN', { month: 'short' }),
}));

interface MonthYearFieldProps {
  label: string;
  month: string;
  year: string;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
  kind: 'manufacturing' | 'expiry';
  required?: boolean;
  compact?: boolean;
  idPrefix: string;
  onComplete?: () => void;
}

export function MonthYearField({
  label, month, year, onMonthChange, onYearChange, kind, required = false,
  compact = false, idPrefix, onComplete,
}: MonthYearFieldProps) {
  const yearRef = useRef<HTMLSelectElement>(null);
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const start = kind === 'manufacturing' ? currentYear - 15 : currentYear - 1;
    const count = kind === 'manufacturing' ? 17 : 22;
    return Array.from({ length: count }, (_, index) => String(start + index));
  }, [currentYear, kind]);

  const status = useMemo(() => {
    if (kind !== 'expiry' || !month || !year) return null;
    const end = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
    if (days < 0) return { text: 'Expired', className: 'text-danger bg-danger/10' };
    if (days <= 90) return { text: `${days} days left`, className: 'text-warning bg-warning/10' };
    return { text: 'Valid', className: 'text-success bg-success/10' };
  }, [kind, month, year]);

  const selectClass = cn(
    'w-full border border-border bg-surface outline-none font-bold transition-all cursor-pointer',
    'focus:border-primary focus:ring-2 focus:ring-primary/15',
    compact ? 'h-10 rounded-xl px-2 text-xs' : 'min-h-11 rounded-xl px-3 text-sm',
    (!month || !year) && 'text-text/40'
  );

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <label htmlFor={`${idPrefix}-month`} className={cn(
          'font-black uppercase tracking-wider text-text/60', compact ? 'text-[10px]' : 'text-xs'
        )}>
          {label} {required && <RequiredMark />}
        </label>
        {status && <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-black uppercase', status.className)}>{status.text}</span>}
      </div>
      <div className="grid grid-cols-[1.2fr_1fr] gap-1.5">
        <div className="relative">
          {!compact && <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/25" />}
          <select
            id={`${idPrefix}-month`}
            value={month}
            onChange={event => onMonthChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                yearRef.current?.focus();
              }
            }}
            required={required}
            aria-label={`${label} month`}
            className={cn(selectClass, !compact && 'pl-9')}
          >
            <option value="">MM / Month</option>
            {MONTHS.map(item => <option key={item.value} value={item.value}>{item.value} · {item.label}</option>)}
          </select>
        </div>
        <select
          ref={yearRef}
          id={`${idPrefix}-year`}
          value={year}
          onChange={event => onYearChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && month && year) {
              event.preventDefault();
              onComplete?.();
            }
          }}
          required={required}
          aria-label={`${label} year`}
          className={selectClass}
        >
          <option value="">YYYY</option>
          {years.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {!compact && <p className="px-1 text-[10px] font-medium text-text/40">Enter: month → year → next field</p>}
    </div>
  );
}
