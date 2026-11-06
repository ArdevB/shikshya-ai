import { zodResolver } from '@hookform/resolvers/zod';
import {
  FINE_TYPES,
  feeHeadBody,
  feeStructureBody,
  fineRuleBody,
  formatNpr,
  type FineType,
  type Paginated,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Gavel, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog, ResourceManager } from '@/components/ResourceManager';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { AcademicYear, Program } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';

interface FeeHead {
  id: string;
  name: string;
  code: string;
}

interface FineRule {
  id: string;
  name: string;
  type: FineType;
  amountPaisa: number;
  graceDays: number;
  maxPaisa: number | null;
}

interface FeeStructure {
  id: string;
  programId: string;
  academicYearId: string;
  semesterNumber: number;
  program: { code: string; name: string };
  academicYear: { name: string };
  items: { feeHeadId: string; amountPaisa: number; feeHead: { name: string } }[];
}

const paisaToInput = (paisa: number) => String(paisa / 100);

type StructureForm = z.input<typeof feeStructureBody>;

function StructureDialog({
  structure,
  onClose,
}: {
  structure: FeeStructure | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const programs = useOptions<Program>('/programs', (p) => ({ value: p.id, label: p.name }));
  const years = useOptions<AcademicYear>('/academic-years', (y) => ({
    value: y.id,
    label: y.name,
  }));
  const heads = useOptions<FeeHead>('/fee-heads', (h) => ({ value: h.id, label: h.name }));

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StructureForm, unknown, z.output<typeof feeStructureBody>>({
    // The installed resolver types do not model a schema whose input and output differ.
    resolver: zodResolver(feeStructureBody) as unknown as Resolver<
      StructureForm,
      unknown,
      z.output<typeof feeStructureBody>
    >,
    defaultValues: structure
      ? {
          programId: structure.programId,
          academicYearId: structure.academicYearId,
          semesterNumber: structure.semesterNumber,
          items: structure.items.map((item) => ({
            feeHeadId: item.feeHeadId,
            amount: paisaToInput(item.amountPaisa),
          })),
        }
      : {
          programId: '',
          academicYearId: '',
          semesterNumber: 1,
          items: [{ feeHeadId: '', amount: '' }],
        },
  });
  const items = useFieldArray({ control, name: 'items' });

  const submit = handleSubmit(async (values) => {
    // The form holds typed rupees, so they are re-sent as rupees for the API to validate.
    const body = {
      ...values,
      items: values.items.map((item) => ({
        feeHeadId: item.feeHeadId,
        amount: paisaToInput(item.amount),
      })),
    };
    try {
      if (structure) await api.put(`/fee-structures/${structure.id}`, body);
      else await api.post('/fee-structures', body);
      toast.success('Saved');
      await queryClient.invalidateQueries({ queryKey: ['/fee-structures'] });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>{structure ? 'Edit' : 'New'} fee structure</DialogTitle>
          <DialogDescription>
            What a student in this program and semester pays. Changes do not affect invoices already
            issued.
          </DialogDescription>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
          <FormField label="Program" error={errors.programId?.message}>
            <Select {...register('programId')}>
              <option value="">Choose…</option>
              {programs.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Academic year" error={errors.academicYearId?.message}>
              <Select {...register('academicYearId')}>
                <option value="">Choose…</option>
                {years.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Semester" error={errors.semesterNumber?.message}>
              <Input type="number" {...register('semesterNumber')} />
            </FormField>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Fees</legend>
            {items.fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[1fr_7rem_auto] items-start gap-2">
                <Select aria-label="Fee" {...register(`items.${index}.feeHeadId`)}>
                  <option value="">Choose…</option>
                  {heads.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <div>
                  <Input
                    aria-label="Amount in rupees"
                    placeholder="Rs."
                    inputMode="decimal"
                    {...register(`items.${index}.amount`)}
                  />
                  {errors.items?.[index]?.amount && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.items[index]?.amount?.message}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove this fee"
                  disabled={items.fields.length === 1}
                  onClick={() => items.remove(index)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {errors.items?.root?.message && (
              <p className="text-sm text-destructive">{errors.items.root.message}</p>
            )}
            {errors.items?.message && (
              <p className="text-sm text-destructive">{errors.items.message}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => items.append({ feeHeadId: '', amount: '' })}
            >
              <Plus /> Add a fee
            </Button>
          </fieldset>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Structures() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<FeeStructure | 'new' | null>(null);
  const [deleting, setDeleting] = useState<FeeStructure | null>(null);
  const query = useQuery({
    queryKey: ['/fee-structures', 'list'],
    queryFn: () => api.get<Paginated<FeeStructure>>('/fee-structures?pageSize=100'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/fee-structures/${id}`),
    onSuccess: async () => {
      setDeleting(null);
      toast.success('Deleted');
      await queryClient.invalidateQueries({ queryKey: ['/fee-structures'] });
    },
    onError: (error) => {
      setDeleting(null);
      toast.error(error.message);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> New fee structure
        </Button>
      </div>
      {query.isPending ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState icon={Layers} title="No fee structures yet" />
      ) : (
        <DataTable
          rows={query.data.data}
          rowKey={(row) => row.id}
          columns={[
            { header: 'Program', cell: (row) => row.program.code },
            { header: 'Semester', cell: (row) => row.semesterNumber },
            { header: 'Year', cell: (row) => row.academicYear.name },
            {
              header: 'Fees',
              cell: (row) => row.items.map((item) => item.feeHead.name).join(', '),
            },
            {
              header: 'Total',
              cell: (row) => formatNpr(row.items.reduce((sum, item) => sum + item.amountPaisa, 0)),
            },
          ]}
          actions={(row) => (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${row.program.code} semester ${row.semesterNumber}`}
                onClick={() => setEditing(row)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${row.program.code} semester ${row.semesterNumber}`}
                onClick={() => setDeleting(row)}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </>
          )}
        />
      )}
      {editing && (
        <StructureDialog
          structure={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this fee structure?"
          description="Invoices already issued keep their amounts."
          confirmLabel="Delete"
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

const TABS = ['Fee structures', 'Fee heads', 'Fine rules'] as const;

export function FeeSetupPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Fee structures');
  return (
    <>
      <PageHeader
        title="Fee setup"
        description="What students pay, and the fine for paying late."
      />
      <div role="tablist" aria-label="Fee setup" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((name) => (
          <Button
            key={name}
            role="tab"
            aria-selected={tab === name}
            variant={tab === name ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(name)}
          >
            {name}
          </Button>
        ))}
      </div>
      {tab === 'Fee structures' && <Structures />}
      {tab === 'Fee heads' && (
        <ResourceManager<FeeHead>
          path="/fee-heads"
          noun="fee head"
          icon={Coins}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.name}
          columns={[
            { header: 'Code', cell: (row) => row.code },
            { header: 'Name', cell: (row) => row.name },
          ]}
          fields={[
            { name: 'name', label: 'Name', placeholder: 'Tuition' },
            { name: 'code', label: 'Code', placeholder: 'TUITION' },
          ]}
          createSchema={feeHeadBody}
          emptyValues={{ name: '', code: '' }}
          toFormValues={(row) => ({ name: row.name, code: row.code })}
        />
      )}
      {tab === 'Fine rules' && (
        <ResourceManager<FineRule>
          path="/fine-rules"
          noun="fine rule"
          icon={Gavel}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.name}
          columns={[
            { header: 'Name', cell: (row) => row.name },
            {
              header: 'Charge',
              cell: (row) =>
                `${formatNpr(row.amountPaisa)}${row.type === 'PER_DAY' ? ' per day' : ' once'}`,
            },
            { header: 'Grace days', cell: (row) => row.graceDays },
            {
              header: 'Maximum',
              cell: (row) => (row.maxPaisa === null ? 'None' : formatNpr(row.maxPaisa)),
            },
          ]}
          fields={[
            { name: 'name', label: 'Name', placeholder: 'Late fee' },
            {
              name: 'type',
              label: 'How it is charged',
              type: 'select',
              options: FINE_TYPES.map((type) => ({
                value: type,
                label: type === 'FIXED' ? 'Once' : 'Every day',
              })),
            },
            { name: 'amount', label: 'Amount in rupees', placeholder: '50' },
            { name: 'graceDays', label: 'Grace days', type: 'number' },
            { name: 'max', label: 'Maximum in rupees (optional)' },
          ]}
          createSchema={fineRuleBody}
          emptyValues={{ name: '', type: 'PER_DAY', amount: '', graceDays: 0, max: '' }}
          toFormValues={(row) => ({
            name: row.name,
            type: row.type,
            amount: paisaToInput(row.amountPaisa),
            graceDays: row.graceDays,
            max: row.maxPaisa === null ? '' : paisaToInput(row.maxPaisa),
          })}
          // Sent as typed: the API turns rupees into paisa.
          sendRawValues
        />
      )}
    </>
  );
}
