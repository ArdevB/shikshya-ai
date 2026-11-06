import {
  INVOICE_STATUSES,
  MAX_PAGE_SIZE,
  cancelInvoiceBody,
  discountBody,
  formatNpr,
  generateInvoicesBody,
  manualPaymentBody,
  rupeesToPaisa,
  type InvoiceStatus,
  type InvoiceView,
  type Paginated,
} from '@shikshya/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Download, FilePlus2, Files, HandCoins, Percent } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable, Pagination } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { ResourceForm } from '@/components/ResourceManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { api, downloadFile, queryString } from '@/lib/api';
import type { Semester, Student } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';
import { formatDate, todayInNepal } from '@/lib/utils';

export const STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'warning' | 'muted'> = {
  UNPAID: 'muted',
  PARTIAL: 'default',
  PAID: 'default',
  OVERDUE: 'warning',
  CANCELLED: 'muted',
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Part paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
};

export const InvoiceStatusBadge = ({ status }: { status: InvoiceStatus }) => (
  <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
);

export const downloadOrToast = (path: string, name: string) =>
  downloadFile(path, name).catch((error: Error) => toast.error(error.message));

const semesterLabel = (s: Semester) =>
  `${s.program.code} Semester ${s.number} (${s.academicYear.name})`;

function ManualInvoiceDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [feeHeadId, setFeeHeadId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayInNepal());
  const [busy, setBusy] = useState(false);

  const students = useQuery({
    queryKey: ['/students', 'search', search],
    queryFn: () => api.get<Paginated<Student>>(`/students${queryString({ search, pageSize: 50 })}`),
  });
  const semesters = useOptions<Semester>('/semesters', (s) => ({
    value: s.id,
    label: semesterLabel(s),
  }));
  const heads = useOptions<{ id: string; name: string }>('/fee-heads', (h) => ({
    value: h.id,
    label: h.name,
  }));

  const amountOk = rupeesToPaisa(amount) !== null && rupeesToPaisa(amount) !== 0;
  const ready = studentId && semesterId && feeHeadId && description.trim() && amountOk && dueDate;

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/invoices', {
        studentId,
        semesterId,
        dueDate,
        items: [{ feeHeadId, description, amount }],
      });
      toast.success('Invoice created');
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the invoice');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>For a one-off charge to one student.</DialogDescription>
        </div>
        <FormField label="Find a student">
          <Input
            type="search"
            placeholder="Name or roll number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </FormField>
        <FormField label="Student">
          <Select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            <option value="">Choose…</option>
            {students.data?.data.map((student) => (
              <option key={student.id} value={student.id}>
                {student.rollNumber} {student.user.firstName} {student.user.lastName}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Semester">
          <Select value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
            <option value="">Choose…</option>
            {semesters.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Fee">
          <Select value={feeHeadId} onChange={(event) => setFeeHeadId(event.target.value)}>
            <option value="">Choose…</option>
            {heads.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Description">
          <Input value={description} onChange={(event) => setDescription(event.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Amount in rupees"
            error={amount && !amountOk ? 'Enter an amount like 1500.50' : undefined}
          >
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </FormField>
          <FormField label="Due date">
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready || busy} onClick={() => void submit()}>
            {busy ? 'Creating…' : 'Create invoice'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Action = { kind: 'discount' | 'cancel' | 'pay'; invoice: InvoiceView };

export function InvoicesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action | null>(null);

  const query = useQuery({
    queryKey: ['invoices', 'list', page, status, search],
    queryFn: () =>
      api.get<Paginated<InvoiceView>>(`/invoices${queryString({ page, status, search })}`),
  });
  const semesters = useOptions<Semester>(
    '/semesters',
    (s) => ({ value: s.id, label: semesterLabel(s) }),
    { pageSize: String(MAX_PAGE_SIZE) },
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invoices'] });

  const resetPage = (change: () => void) => {
    change();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Invoices"
        actions={
          <>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <FilePlus2 /> New invoice
            </Button>
            <Button onClick={() => setGenerating(true)}>
              <Files /> Generate for a semester
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <FormField label="Search">
          <Input
            type="search"
            placeholder="Invoice, name or roll no."
            value={search}
            onChange={(event) => resetPage(() => setSearch(event.target.value))}
          />
        </FormField>
        <FormField label="Status">
          <Select
            value={status}
            onChange={(event) => resetPage(() => setStatus(event.target.value))}
          >
            <option value="">All</option>
            {INVOICE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {query.isPending ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState icon={Files} title="No invoices found" />
      ) : (
        <div className="space-y-4">
          <DataTable
            rows={query.data.data}
            rowKey={(row) => row.id}
            columns={[
              { header: 'Invoice', cell: (row) => row.invoiceNumber },
              { header: 'Student', cell: (row) => `${row.studentName} (${row.rollNumber})` },
              { header: 'Due', cell: (row) => formatDate(row.dueDate) },
              { header: 'Outstanding', cell: (row) => formatNpr(row.outstandingPaisa) },
              { header: 'Status', cell: (row) => <InvoiceStatusBadge status={row.status} /> },
            ]}
            actions={(row) => {
              const open = row.status !== 'PAID' && row.status !== 'CANCELLED';
              return (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Download ${row.invoiceNumber}`}
                    onClick={() =>
                      void downloadOrToast(`/pdf/invoice/${row.id}`, `${row.invoiceNumber}.pdf`)
                    }
                  >
                    <Download />
                  </Button>
                  {open && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Record a payment for ${row.invoiceNumber}`}
                        onClick={() => setAction({ kind: 'pay', invoice: row })}
                      >
                        <HandCoins />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Discount ${row.invoiceNumber}`}
                        onClick={() => setAction({ kind: 'discount', invoice: row })}
                      >
                        <Percent />
                      </Button>
                    </>
                  )}
                  {open && row.paidPaisa === 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Cancel ${row.invoiceNumber}`}
                      onClick={() => setAction({ kind: 'cancel', invoice: row })}
                    >
                      <Ban className="text-destructive" />
                    </Button>
                  )}
                </>
              );
            }}
          />
          <Pagination
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            total={query.data.meta.total}
            onPageChange={setPage}
          />
        </div>
      )}

      {creating && <ManualInvoiceDialog onClose={() => setCreating(false)} />}

      {generating && (
        <ResourceForm
          title="Generate invoices"
          description="One invoice for every enrolled student, from the semester's fee structure. Students who already have one are skipped, so this is safe to run again."
          fields={[
            { name: 'semesterId', label: 'Semester', type: 'select', options: semesters },
            { name: 'dueDate', label: 'Due date', type: 'date' },
          ]}
          schema={generateInvoicesBody}
          defaultValues={{ semesterId: '', dueDate: '' }}
          submitLabel="Generate"
          isEditing={false}
          onClose={() => setGenerating(false)}
          onSubmit={async (values) => {
            const result = await api.post<{ created: number; skipped: number }>(
              '/invoices/generate',
              values,
            );
            toast.success(
              `Created ${result.created} invoices${result.skipped ? `, skipped ${result.skipped} that already had one` : ''}`,
            );
            await refresh();
          }}
        />
      )}

      {action?.kind === 'discount' && (
        <ResourceForm
          title={`Discount on ${action.invoice.invoiceNumber}`}
          description={`Replaces any earlier discount. Currently ${formatNpr(action.invoice.discountPaisa)}. The reason is kept in the audit log.`}
          fields={[
            { name: 'amount', label: 'Discount in rupees' },
            { name: 'reason', label: 'Reason', placeholder: 'Merit scholarship' },
          ]}
          schema={discountBody}
          defaultValues={{ amount: '', reason: '' }}
          submitLabel="Apply discount"
          isEditing={false}
          sendRawValues
          onClose={() => setAction(null)}
          onSubmit={async (values) => {
            await api.post(`/invoices/${action.invoice.id}/discount`, values);
            toast.success('Discount applied');
            await refresh();
          }}
        />
      )}

      {action?.kind === 'cancel' && (
        <ResourceForm
          title={`Cancel ${action.invoice.invoiceNumber}?`}
          description="The student will no longer be asked to pay this. The reason is kept in the audit log."
          fields={[{ name: 'reason', label: 'Reason' }]}
          schema={cancelInvoiceBody}
          defaultValues={{ reason: '' }}
          submitLabel="Cancel invoice"
          isEditing={false}
          onClose={() => setAction(null)}
          onSubmit={async (values) => {
            await api.post(`/invoices/${action.invoice.id}/cancel`, values);
            toast.success('Invoice cancelled');
            await refresh();
          }}
        />
      )}

      {action?.kind === 'pay' && (
        <ResourceForm
          title={`Record a payment for ${action.invoice.invoiceNumber}`}
          description={`${formatNpr(action.invoice.outstandingPaisa)} is outstanding.`}
          fields={[
            {
              name: 'method',
              label: 'Paid by',
              type: 'select',
              options: [
                { value: 'CASH', label: 'Cash' },
                { value: 'BANK', label: 'Bank deposit' },
              ],
            },
            { name: 'amount', label: 'Amount in rupees' },
            { name: 'reference', label: 'Reference (optional)', placeholder: 'Deposit slip no.' },
          ]}
          schema={manualPaymentBody}
          defaultValues={{
            invoiceId: action.invoice.id,
            method: 'CASH',
            amount: String(action.invoice.outstandingPaisa / 100),
            reference: '',
          }}
          submitLabel="Record payment"
          isEditing={false}
          sendRawValues
          onClose={() => setAction(null)}
          onSubmit={async (values) => {
            await api.post('/payments/manual', values);
            toast.success('Payment recorded');
            await refresh();
          }}
        />
      )}
    </>
  );
}
