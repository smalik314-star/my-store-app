import { cn } from '../../utils/cn';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div
      className={cn(
        'rounded-full border-primary/20 border-t-primary animate-spin',
        sizes[size],
        className
      )}
    />
  );
}

export function Loader() {
  return (
    <div className="flex h-full w-full items-center justify-center min-h-[200px]">
      <Spinner size="lg" />
    </div>
  );
}
