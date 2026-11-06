import { formatNpr, type InvoiceView, type Paginated, type PaymentView } from '@shikshya/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, Receipt, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/auth/AuthContext';
import { CountBarChart } from '@/components/Charts';
import { DataTable, Pagination } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { downloadOrToast } from './InvoicesPage';
import { useState } from 'react';

const METHOD_LABEL = { ESEWA: 'eSewa', KHALTI: 'Khalti', CASH: 'Cash', BANK: 'Bank' } as const;

export function FinanceDashboardPage() {
  const user = useCurrentUser();
  const summary = useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: () =>
      api.get<{ todayPaisa: number; monthPaisa: number }>('/finance/collections-summary'),
  });
  const byProgram = useQuery({
    queryKey: ['finance', 'by-program'],
    queryFn: () =>
      api.get<{ code: string; name: string; outstandingPaisa: number; invoices: number }[]>(
        '/finance/outstanding-by-program',
      ),
  });
  const trend = useQuery({
    queryKey: ['finance', 'trend'],
    queryFn: () => api.get<{ date: string; totalPaisa: number }[]>('/finance/collections-trend'),
  });
  const overdue = useQuery({
    queryKey: ['invoices', 'overdue'],
    queryFn: () => api.get<Paginated<InvoiceView>>('/invoices?status=OVERDUE&pageSize=8'),
  });

  const totalOutstanding = byProgram.data?.reduce((sum, p) => sum + p.outstandingPaisa, 0) ?? 0;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Fee collections at a glance."
        actions={
          <Button
            variant="outline"
            onClick={() => void downloadOrToast('/finance/outstanding.csv', 'outstanding-dues.csv')}
          >
            <Download /> Export dues (CSV)
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ['Collected today', summary.data?.todayPaisa],
            ['Collected this month', summary.data?.monthPaisa],
            ['Outstanding', byProgram.data ? totalOutstanding : undefined],
          ] as const
        ).map(([label, paisa]) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="font-heading text-2xl font-bold">
                {paisa === undefined ? '…' : formatNpr(paisa)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Collections, last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.isPending ? (
              <LoadingRows rows={3} />
            ) : trend.data?.length ? (
              <CountBarChart
                ariaLabel="Money collected per day over the last 30 days"
                xHeader="Date"
                valueHeader="Collected"
                format={(rupees) => formatNpr(rupees * 100)}
                // The axis has little room, so 150000 reads as 1.5L, the Nepali way.
                formatTick={(rupees) =>
                  rupees >= 100000
                    ? `${rupees / 100000}L`
                    : rupees >= 1000
                      ? `${rupees / 1000}k`
                      : String(rupees)
                }
                data={trend.data.map((d) => ({
                  name: d.date.slice(5),
                  value: d.totalPaisa / 100,
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing collected recently.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outstanding by program</CardTitle>
          </CardHeader>
          <CardContent>
            {byProgram.isPending ? (
              <LoadingRows rows={2} />
            ) : byProgram.isError ? (
              <ErrorState error={byProgram.error} onRetry={() => void byProgram.refetch()} />
            ) : byProgram.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
            ) : (
              <ul className="divide-y text-sm">
                {byProgram.data.map((program) => (
                  <li key={program.code} className="py-2">
                    <p className="flex justify-between gap-3 font-medium">
                      <span>{program.code}</span>
                      <span>{formatNpr(program.outstandingPaisa)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{program.invoices} invoices</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TriangleAlert className="size-4 text-accent-dark" aria-hidden /> Overdue
          </CardTitle>
          <Link
            to="/finance/invoices"
            className="text-sm font-medium text-primary-dark hover:underline"
          >
            All invoices
          </Link>
        </CardHeader>
        <CardContent>
          {overdue.data?.data.length ? (
            <DataTable
              rows={overdue.data.data}
              rowKey={(row) => row.id}
              columns={[
                { header: 'Invoice', cell: (row) => row.invoiceNumber },
                { header: 'Student', cell: (row) => row.studentName },
                { header: 'Due', cell: (row) => formatDate(row.dueDate) },
                { header: 'Outstanding', cell: (row) => formatNpr(row.outstandingPaisa) },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing is overdue.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export function PaymentsPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['payments', 'list', page],
    queryFn: () => api.get<Paginated<PaymentView>>(`/payments?page=${page}`),
  });

  return (
    <>
      <PageHeader title="Payments" description="Every payment, by gateway or at the counter." />
      {query.isPending ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState icon={Receipt} title="No payments yet" />
      ) : (
        <div className="space-y-4">
          <DataTable
            rows={query.data.data}
            rowKey={(row) => row.id}
            columns={[
              {
                header: 'Date',
                cell: (row) => formatDateTime(row.paidAt ?? row.createdAt),
              },
              { header: 'Student', cell: (row) => row.studentName },
              { header: 'Invoice', cell: (row) => row.invoiceNumber },
              { header: 'Method', cell: (row) => METHOD_LABEL[row.method] },
              { header: 'Amount', cell: (row) => formatNpr(row.amountPaisa) },
              {
                header: 'Status',
                cell: (row) => (
                  <Badge
                    variant={
                      row.status === 'SUCCESS'
                        ? 'default'
                        : row.status === 'FAILED'
                          ? 'warning'
                          : 'muted'
                    }
                  >
                    {row.status}
                  </Badge>
                ),
              },
            ]}
            actions={(row) =>
              row.receiptNumber ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Download receipt ${row.receiptNumber}`}
                  onClick={() =>
                    void downloadOrToast(`/pdf/receipt/${row.id}`, `${row.receiptNumber}.pdf`)
                  }
                >
                  <Download />
                </Button>
              ) : null
            }
          />
          <Pagination
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            total={query.data.meta.total}
            onPageChange={setPage}
          />
        </div>
      )}
    </>
  );
}
