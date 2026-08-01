import { ChangeEvent, forwardRef, InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  loading?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, onClear, loading = false, className, placeholder = 'Search...', ...props }, ref) => {
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value);
    const clear = () => {
      onChange('');
      onClear?.();
    };

    return (
      <div className={cn('relative w-full', className)}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/45" aria-hidden="true" />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          aria-busy={loading}
          className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-9 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          {...props}
        />
        {loading ? (
          <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-primary/20 border-t-primary" aria-label="Searching" />
        ) : value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text/50 hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
