import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/**
 * Rows are a table on wider screens and a stack of cards on phones,
 * so nothing has to be scrolled sideways at 375px.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  actions,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  actions?: (row: T) => ReactNode;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-primary-soft">
            <tr>
              {columns.map((column) => (
                <th key={column.header} scope="col" className="px-4 py-3 font-semibold">
                  {column.header}
                </th>
              ))}
              {actions && (
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-t">
                {columns.map((column) => (
                  <td key={column.header} className={cn('px-4 py-3', column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-lg border p-4">
            <dl className="space-y-1.5 text-sm">
              {columns.map((column) => (
                <div key={column.header} className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">{column.header}</dt>
                  <dd className="min-w-0 break-words text-right font-medium">{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
            {actions && (
              <div className="mt-3 flex justify-end gap-1 border-t pt-3">{actions(row)}</div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return (
      <p className="text-sm text-muted-foreground">
        {total} {total === 1 ? 'record' : 'records'}
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} ({total} records)
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
