import {
  KHALTI_MIN_PAISA,
  formatNpr,
  type InitiatePaymentResult,
  type InvoiceView,
  type Paginated,
  type PaymentView,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Download, Loader2, Receipt, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
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
import { EASE_SPRING } from '@/lib/motion';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
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

type GatewayMethod = 'ESEWA' | 'KHALTI';

function GatewayOption({
  name,
  dotClass,
  note,
  busy,
  disabled,
  onChoose,
}: {
  name: string;
  dotClass: string;
  note?: string;
  busy: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChoose}
      className="group flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition-[transform,border-color,box-shadow] duration-200 ease-spring hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-soft active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl font-heading text-lg font-bold text-primary-foreground',
          dotClass,
        )}
      >
        {name.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Pay with {name}</span>
        {note && <span className="block text-sm text-muted-foreground">{note}</span>}
      </span>
      {busy ? (
        <Loader2 className="size-5 shrink-0 animate-spin text-primary-dark" aria-hidden />
      ) : (
        <ChevronRight
          className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-spring group-hover:translate-x-0.5"
          aria-hidden
        />
      )}
    </button>
  );
}

function PayDialog({ invoice, onClose }: { invoice: InvoiceView; onClose: () => void }) {
  const gateways = useQuery({
    queryKey: ['payments', 'gateways'],
    queryFn: () => api.get<Record<GatewayMethod, boolean>>('/payments/gateways'),
  });
  const pay = useMutation({
    mutationFn: (method: GatewayMethod) =>
      api.post<InitiatePaymentResult>('/payments/initiate', { invoiceId: invoice.id, method }),
    onSuccess: (result) => {
      if (result.formAction && result.formFields) {
        postToGateway(result.formAction, result.formFields);
      } else if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
      }
    },
    // Some gateway messages explain what to do, so they stay up long enough to read.
    onError: (error) => toast.error(error.message, { duration: 10000 }),
  });

  const khaltiNote =
    gateways.data && !gateways.data.KHALTI
      ? 'Not available right now'
      : invoice.outstandingPaisa < KHALTI_MIN_PAISA
        ? `Needs at least ${formatNpr(KHALTI_MIN_PAISA)}`
        : undefined;
  const busy = pay.isPending || pay.isSuccess;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Pay {formatNpr(invoice.outstandingPaisa)}</DialogTitle>
          <DialogDescription>
            Invoice {invoice.invoiceNumber}. You will confirm on the provider&apos;s own page.
          </DialogDescription>
        </div>
        <div className="stagger-children space-y-2">
          <GatewayOption
            name="eSewa"
            dotClass="bg-primary-strong"
            busy={busy && pay.variables === 'ESEWA'}
            disabled={busy}
            onChoose={() => pay.mutate('ESEWA')}
          />
          <GatewayOption
            name="Khalti"
            dotClass="bg-accent-strong"
            note={khaltiNote}
            busy={busy && pay.variables === 'KHALTI'}
            disabled={busy || Boolean(khaltiNote)}
            onChoose={() => pay.mutate('KHALTI')}
          />
        </div>
        {busy && (
          <p role="status" className="text-center text-sm text-muted-foreground">
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
    <div className="stagger-children grid gap-4 lg:grid-cols-2">
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

const BURST = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2;
  const distance = 62 + (index % 3) * 12;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, index };
});

/** The moment money has gone through: a tick drawn by hand, with a small burst of colour. */
function SuccessMark() {
  return (
    <div aria-hidden className="relative flex size-24 items-center justify-center">
      {BURST.map(({ x, y, index }) => (
        <motion.span
          key={index}
          className={cn(
            'absolute size-2.5 rounded-full',
            index % 2 === 0 ? 'bg-primary' : 'bg-accent',
          )}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{ x, y, scale: [0, 1, 0.4], opacity: [1, 1, 0] }}
          transition={{ duration: 0.9, delay: 0.35, ease: EASE_SPRING }}
        />
      ))}
      <motion.div
        className="flex size-24 items-center justify-center rounded-full bg-primary-strong shadow-glow-primary"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      >
        <svg viewBox="0 0 48 48" className="size-14" fill="none">
          <motion.path
            d="M12 25 l9 9 l16 -19"
            stroke="white"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.2, ease: 'easeOut' }}
          />
        </svg>
      </motion.div>
    </div>
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
    content = (
      <>
        <Loader2 className="size-12 animate-spin text-primary" aria-hidden />
        <p role="status" className="text-muted-foreground">
          Checking your payment…
        </p>
      </>
    );
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
        <XCircle className="size-16 animate-shake text-destructive" aria-hidden />
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
        <SuccessMark />
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
        <div aria-hidden className="relative flex size-20 items-center justify-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-primary/30" />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-primary-soft">
            <Loader2 className="size-8 animate-spin text-primary-dark" />
          </span>
        </div>
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
        <XCircle className="size-16 animate-shake text-accent-dark" aria-hidden />
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
      {/* The key replays the entrance each time the state changes. */}
      <div key={status ?? 'loading'} className="stagger-children flex flex-col items-center gap-4">
        {content}
      </div>
    </main>
  );
}
