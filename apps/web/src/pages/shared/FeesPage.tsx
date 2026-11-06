import {
  KHALTI_MIN_PAISA,
  formatNpr,
  type InitiatePaymentResult,
  type InvoiceView,
  type Paginated,
  type PaymentView,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Download, Receipt, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { Logo } from '@/components/Logo';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, queryString } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { downloadOrToast, InvoiceStatusBadge } from '@/pages/finance/InvoicesPage';
import { ChildSwitcher, useActiveChild } from './ChildSwitcher';

/** eSewa takes a POSTed form, so one is built and submitted to leave for its page. */
function postToGateway(action: string, fields: Record<string, string>) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

function PayDialog({ invoice, onClose }: { invoice: InvoiceView; onClose: () => void }) {
  const pay = useMutation({
    mutationFn: (method: 'ESEWA' | 'KHALTI') =>
      api.post<InitiatePaymentResult>('/payments/initiate', { invoiceId: invoice.id, method }),
    onSuccess: (result) => {
      if (result.formAction && result.formFields) {
        postToGateway(result.formAction, result.formFields);
      } else if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const khaltiAllowed = invoice.outstandingPaisa >= KHALTI_MIN_PAISA;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Pay {formatNpr(invoice.outstandingPaisa)}</DialogTitle>
          <DialogDescription>
            Invoice {invoice.invoiceNumber}. You will be taken to the provider&apos;s page to
            confirm.
          </DialogDescription>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" disabled={pay.isPending} onClick={() => pay.mutate('ESEWA')}>
            Pay with eSewa
          </Button>
          <Button
            size="lg"
            variant="accent"
            disabled={pay.isPending || !khaltiAllowed}
            onClick={() => pay.mutate('KHALTI')}
          >
            Pay with Khalti
          </Button>
        </div>
        {!khaltiAllowed && (
          <p className="text-sm text-muted-foreground">
            Khalti needs at least {formatNpr(KHALTI_MIN_PAISA)}.
          </p>
        )}
        {pay.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Connecting…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvoiceCard({ invoice }: { invoice: InvoiceView }) {
  const [paying, setPaying] = useState(false);
  const payments = useQuery({
    queryKey: ['payments', 'invoice', invoice.id],
    enabled: invoice.paidPaisa > 0,
    queryFn: () =>
      api.get<Paginated<PaymentView>>(`/payments${queryString({ invoiceId: invoice.id })}`),
  });
  const payable = invoice.status !== 'PAID' && invoice.status !== 'CANCELLED';
  const receipts = payments.data?.data.filter((payment) => payment.receiptNumber) ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">{invoice.invoiceNumber}</p>
            <h2 className="font-heading text-2xl font-bold">
              {formatNpr(invoice.outstandingPaisa)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {payable ? 'Outstanding, due' : 'Was due'} {formatDate(invoice.dueDate)}
            </p>
          </div>
          <InvoiceStatusBadge status={invoice.status} />
        </div>

        <dl className="space-y-1 border-t pt-3 text-sm">
          {invoice.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{item.description}</dt>
              <dd>{formatNpr(item.amountPaisa)}</dd>
            </div>
          ))}
          {invoice.finePaisa > 0 && (
            <div className="flex justify-between gap-3 text-accent-dark">
              <dt>Late fine</dt>
              <dd>{formatNpr(invoice.finePaisa)}</dd>
            </div>
          )}
          {invoice.discountPaisa > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Discount</dt>
              <dd>- {formatNpr(invoice.discountPaisa)}</dd>
            </div>
          )}
          {invoice.paidPaisa > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Paid</dt>
              <dd>- {formatNpr(invoice.paidPaisa)}</dd>
            </div>
          )}
        </dl>

        {receipts.length > 0 && (
          <ul className="space-y-1 border-t pt-3 text-sm">
            {receipts.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-muted-foreground">
                  {formatNpr(payment.amountPaisa)},{' '}
                  {payment.paidAt && formatDateTime(payment.paidAt)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void downloadOrToast(
                      `/pdf/receipt/${payment.id}`,
                      `${payment.receiptNumber}.pdf`,
                    )
                  }
                >
                  <Receipt /> Receipt
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          {payable && <Button onClick={() => setPaying(true)}>Pay now</Button>}
          <Button
            variant="outline"
            onClick={() =>
              void downloadOrToast(`/pdf/invoice/${invoice.id}`, `${invoice.invoiceNumber}.pdf`)
            }
          >
            <Download /> Invoice
          </Button>
        </div>
      </CardContent>
      {paying && <PayDialog invoice={invoice} onClose={() => setPaying(false)} />}
    </Card>
  );
}

function InvoiceList({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ['invoices', 'student', studentId],
    queryFn: () =>
      api.get<Paginated<InvoiceView>>(`/invoices${queryString({ studentId, pageSize: 50 })}`),
  });
  if (query.isPending) return <LoadingRows />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (query.data.data.length === 0) {
    return <EmptyState icon={Receipt} title="No invoices yet" />;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {query.data.data.map((invoice) => (
        <InvoiceCard key={invoice.id} invoice={invoice} />
      ))}
    </div>
  );
}

export function StudentFeesPage() {
  const { studentId } = useCurrentUser();
  return (
    <>
      <PageHeader title="Fees" />
      {studentId && <InvoiceList studentId={studentId} />}
    </>
  );
}

export function ParentFeesPage() {
  const { activeId, children, status } = useActiveChild();
  return (
    <>
      <PageHeader title="Fees" />
      <ChildSwitcher status={status}>{children}</ChildSwitcher>
      {activeId && <InvoiceList studentId={activeId} />}
    </>
  );
}

/**
 * Where a gateway's redirect ends up. The API has already verified the payment by then, but a
 * gateway can still be deciding, so this keeps asking for a short while.
 */
export function PaymentResultPage() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const paymentId = params.get('paymentId');
  const [attempts, setAttempts] = useState(0);

  const query = useQuery({
    queryKey: ['payments', 'result', paymentId],
    enabled: Boolean(paymentId && user),
    queryFn: () => api.post<PaymentView>(`/payments/${paymentId}/refresh`),
    refetchInterval: (state) =>
      state.state.data?.status === 'INITIATED' && attempts < 8 ? 4000 : false,
  });

  const status = query.data?.status;
  useEffect(() => {
    if (status === 'INITIATED') setAttempts((count) => count + 1);
    if (status === 'SUCCESS') void queryClient.invalidateQueries({ queryKey: ['invoices'] });
  }, [status, query.dataUpdatedAt, queryClient]);

  const fees = user?.role === 'PARENT' ? '/parent/fees' : '/student/fees';

  let content;
  if (loading || (paymentId && query.isPending && user)) {
    content = <p className="text-muted-foreground">Checking your payment…</p>;
  } else if (!user) {
    content = (
      <>
        <p>Please log in to see this payment.</p>
        <Button asChild>
          <Link to="/login">Log in</Link>
        </Button>
      </>
    );
  } else if (!paymentId || query.isError) {
    content = (
      <>
        <XCircle className="size-12 text-destructive" aria-hidden />
        <h1 className="text-2xl font-bold">We could not confirm this payment</h1>
        <p className="text-muted-foreground">
          If money left your account, it will appear on your invoice shortly. Otherwise, please try
          again.
        </p>
        <Button asChild>
          <Link to={fees}>Back to fees</Link>
        </Button>
      </>
    );
  } else if (status === 'SUCCESS') {
    const payment = query.data as PaymentView;
    content = (
      <>
        <CheckCircle2 className="size-12 text-primary" aria-hidden />
        <h1 className="text-2xl font-bold">Payment successful</h1>
        <p className="text-muted-foreground">
          {formatNpr(payment.amountPaisa)} for invoice {payment.invoiceNumber}.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={() =>
              void downloadOrToast(`/pdf/receipt/${payment.id}`, `${payment.receiptNumber}.pdf`)
            }
          >
            <Download /> Download receipt
          </Button>
          <Button asChild variant="outline">
            <Link to={fees}>Back to fees</Link>
          </Button>
        </div>
      </>
    );
  } else if (status === 'INITIATED') {
    content = (
      <>
        <Clock className="size-12 text-primary" aria-hidden />
        <h1 className="text-2xl font-bold">Waiting for confirmation</h1>
        <p className="text-muted-foreground">
          {attempts < 8
            ? 'This usually takes a moment.'
            : 'This is taking longer than usual. It will update on your invoice once confirmed, so there is no need to pay again.'}
        </p>
        <Button asChild variant="outline">
          <Link to={fees}>Back to fees</Link>
        </Button>
      </>
    );
  } else {
    content = (
      <>
        <XCircle className="size-12 text-accent-dark" aria-hidden />
        <h1 className="text-2xl font-bold">Payment not completed</h1>
        <p className="text-muted-foreground">You have not been charged. You can try again.</p>
        <Button asChild>
          <Link to={fees}>Back to fees</Link>
        </Button>
      </>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      {content}
    </main>
  );
}
