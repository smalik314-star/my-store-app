import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

interface NumericInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
}

const NumericField = forwardRef<HTMLInputElement, NumericInputProps & { prefix?: string }>(({
  label,
  error,
  prefix,
  className,
  ...props
}, ref) => {
  const inputId = props.id;
  const errorId = inputId && error ? `${inputId}-error` : undefined;
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={inputId} className="block text-xs font-semibold text-text/75">{label}</label>}
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-text/60">{prefix}</span>}
        <input
          ref={ref}
          type="number"
          inputMode="decimal"
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          className={cn(
            'h-10 w-full rounded-lg border border-border bg-surface px-3 text-right text-sm tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20',
            prefix && 'pl-8',
            error && 'border-danger',
            className
          )}
          {...props}
        />
      </div>
      {error && <p id={errorId} className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
});
NumericField.displayName = 'NumericField';

export const CurrencyInput = forwardRef<HTMLInputElement, NumericInputProps>((props, ref) => (
  <NumericField ref={ref} min="0" step="0.01" prefix="₹" {...props} />
));
CurrencyInput.displayName = 'CurrencyInput';

export const QuantityInput = forwardRef<HTMLInputElement, NumericInputProps>((props, ref) => (
  <NumericField ref={ref} min="0" step="1" {...props} />
));
QuantityInput.displayName = 'QuantityInput';
