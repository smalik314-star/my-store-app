import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../common/Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems?: number;
  hasNextPage?: boolean;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  hasNextPage,
  onPageChange,
  disabled = false,
}: PaginationProps) {
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = totalItems === undefined
    ? page * pageSize
    : Math.min(page * pageSize, totalItems);
  const canGoNext = totalItems === undefined
    ? Boolean(hasNextPage)
    : lastItem < totalItems;

  return (
    <nav aria-label="Pagination" className="flex flex-col gap-2 border-t border-border pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-text/60" aria-live="polite">
        {totalItems === undefined
          ? `Page ${page}`
          : `Showing ${firstItem}–${lastItem} of ${totalItems}`}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Previous
        </Button>
        <span className="min-w-10 text-center font-semibold" aria-current="page">{page}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled || !canGoNext} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
