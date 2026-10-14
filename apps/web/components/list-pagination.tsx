import { pageHref } from '@/lib/pagination';
import { Button } from '@mybizone/ui/button';
import Link from 'next/link';

export function ListPagination({
  path,
  filters,
  page,
  hasNext,
}: {
  path: string;
  filters: Record<string, string | undefined>;
  page: number;
  hasNext: boolean;
}) {
  if (page === 1 && !hasNext) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">Page {page}</span>
      <div className="flex gap-2">
        {page > 1 && (
          <Button variant="outline" size="sm" asChild>
            <Link href={pageHref(path, filters, page - 1)} prefetch={false}>
              Previous
            </Link>
          </Button>
        )}
        {hasNext && (
          <Button variant="outline" size="sm" asChild>
            <Link href={pageHref(path, filters, page + 1)} prefetch={false}>
              Next
            </Link>
          </Button>
        )}
      </div>
    </nav>
  );
}
