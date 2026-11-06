import { zodResolver } from '@hookform/resolvers/zod';
import type { Paginated } from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm, type FieldValues, type Resolver, type UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import type { ZodTypeAny } from 'zod';
import { DataTable, Pagination, type Column } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { api, ApiError, queryString } from '@/lib/api';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FormFieldConfig {
  name: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'tel'
    | 'number'
    | 'date'
    | 'datetime-local'
    | 'select'
    | 'checkbox'
    | 'textarea';
  options?: FieldOption[];
  placeholder?: string;
  hint?: string;
  /** Only show the field when creating, for example a login email set once. */
  createOnly?: boolean;
}

/** Copies field errors from the API's validation response onto the form. */
export function applyServerErrors(error: unknown, setError: UseFormSetError<FieldValues>) {
  if (error instanceof ApiError && Array.isArray(error.details)) {
    for (const issue of error.details as { path?: string; message?: string }[]) {
      if (issue.path) setError(issue.path, { message: issue.message ?? 'Invalid value' });
    }
  }
}

interface ResourceFormProps {
  title: string;
  description?: string;
  fields: FormFieldConfig[];
  schema: ZodTypeAny;
  defaultValues: FieldValues;
  submitLabel: string;
  isEditing: boolean;
  onSubmit: (values: FieldValues) => Promise<unknown>;
  onClose: () => void;
  /** Adjusts raw form values before validation, for example local times to ISO. */
  preprocess?: (values: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Validate, but submit what was typed rather than the parsed result. For fields the schema
   * transforms, such as rupees into paisa, which the API must do itself.
   */
  sendRawValues?: boolean;
}

export function ResourceForm({
  title,
  description,
  fields,
  schema,
  defaultValues,
  submitLabel,
  isEditing,
  onSubmit,
  onClose,
  preprocess,
  sendRawValues = false,
}: ResourceFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FieldValues>({
    // The resolver's generics cannot follow a schema chosen at runtime.
    resolver: ((values, context, options) =>
      (zodResolver(schema) as Resolver<FieldValues>)(
        preprocess ? preprocess(values) : values,
        context,
        options,
      )) as Resolver<FieldValues>,
    defaultValues,
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(sendRawValues ? getValues() : values);
      onClose();
    } catch (error) {
      applyServerErrors(error, setError);
      toast.error(error instanceof Error ? error.message : 'Could not save');
    }
  });

  const visible = fields.filter((field) => !(field.createOnly && isEditing));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? 'Fill in the details below.'}</DialogDescription>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
          {visible.map((field) => {
            const error = errors[field.name]?.message as string | undefined;
            if (field.type === 'checkbox') {
              return (
                <label
                  key={field.name}
                  className="flex min-h-10 items-center gap-3 text-sm font-medium"
                >
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    {...register(field.name)}
                  />
                  {field.label}
                </label>
              );
            }
            return (
              <FormField key={field.name} label={field.label} error={error} hint={field.hint}>
                {field.type === 'textarea' ? (
                  <textarea
                    rows={4}
                    className="w-full rounded-md border bg-card px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
                    {...register(field.name)}
                  />
                ) : field.type === 'select' ? (
                  <Select {...register(field.name)}>
                    <option value="">Choose…</option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type={field.type ?? 'text'}
                    placeholder={field.placeholder}
                    {...register(field.name)}
                  />
                )}
              </FormField>
            );
          })}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  busy,
  variant = 'destructive',
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  variant?: 'destructive' | 'default';
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={variant} disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface ResourceManagerProps<T> {
  /** API path, such as "/departments". */
  path: string;
  /** Singular name, used in messages: "department". */
  noun: string;
  icon: LucideIcon;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowLabel: (row: T) => string;
  fields: FormFieldConfig[];
  createSchema: ZodTypeAny;
  updateSchema?: ZodTypeAny;
  emptyValues: FieldValues;
  toFormValues: (row: T) => FieldValues;
  /** Extra query parameters, from filter controls. */
  filters?: Record<string, string | number | undefined>;
  /** Controls shown above the table. */
  toolbar?: ReactNode;
  /** Extra buttons beside "Add", such as an import. */
  headerActions?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  /** Called with the API's response after creating, for example to show a temporary password. */
  onCreated?: (result: unknown) => void;
  /** See ResourceFormProps. */
  sendRawValues?: boolean;
  emptyDescription?: string;
}

export function ResourceManager<T>({
  path,
  noun,
  icon,
  columns,
  rowKey,
  rowLabel,
  fields,
  createSchema,
  updateSchema,
  emptyValues,
  toFormValues,
  filters,
  toolbar,
  headerActions,
  rowActions,
  onCreated,
  emptyDescription,
  sendRawValues,
}: ResourceManagerProps<T>) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);

  // A filter change can leave the current page past the end of the results.
  const filterKey = JSON.stringify(filters ?? {});
  useEffect(() => setPage(1), [filterKey]);

  const listQuery = useQuery({
    queryKey: [path, 'list', page, filters],
    queryFn: () => api.get<Paginated<T>>(`${path}${queryString({ page, ...filters })}`),
  });

  // Any select elsewhere that lists this resource needs refreshing too.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [path] });

  const deleteMutation = useMutation({
    mutationFn: (row: T) => api.delete(`${path}/${rowKey(row)}`),
    onSuccess: async () => {
      toast.success(`Deleted the ${noun}`);
      setDeleting(null);
      await invalidate();
    },
    onError: (error) => {
      setDeleting(null);
      toast.error(error.message);
    },
  });

  const addButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus /> Add {noun}
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">{toolbar}</div>
        <div className="flex flex-wrap gap-2">
          {headerActions}
          {addButton}
        </div>
      </div>

      {listQuery.isPending ? (
        <LoadingRows />
      ) : listQuery.isError ? (
        <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />
      ) : listQuery.data.data.length === 0 ? (
        <EmptyState
          icon={icon}
          title={`No ${noun}s found`}
          description={emptyDescription ?? `Add the first ${noun} to get started.`}
        />
      ) : (
        <>
          <DataTable
            rows={listQuery.data.data}
            columns={columns}
            rowKey={rowKey}
            actions={(row) => (
              <>
                {rowActions?.(row)}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${rowLabel(row)}`}
                  onClick={() => setEditing(row)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${rowLabel(row)}`}
                  onClick={() => setDeleting(row)}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </>
            )}
          />
          <Pagination
            page={listQuery.data.meta.page}
            totalPages={listQuery.data.meta.totalPages}
            total={listQuery.data.meta.total}
            onPageChange={setPage}
          />
        </>
      )}

      {creating && (
        <ResourceForm
          title={`Add ${noun}`}
          fields={fields}
          schema={createSchema}
          defaultValues={emptyValues}
          submitLabel={`Add ${noun}`}
          isEditing={false}
          sendRawValues={sendRawValues}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            const result = await api.post(path, values);
            toast.success(`Added the ${noun}`);
            await invalidate();
            onCreated?.(result);
          }}
        />
      )}

      {editing && (
        <ResourceForm
          title={`Edit ${noun}`}
          fields={fields}
          schema={updateSchema ?? createSchema}
          defaultValues={toFormValues(editing)}
          submitLabel="Save changes"
          isEditing
          sendRawValues={sendRawValues}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await api.put(`${path}/${rowKey(editing)}`, values);
            toast.success(`Saved the ${noun}`);
            await invalidate();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${rowLabel(deleting)}?`}
          description="This cannot be undone. Records linked to this one must be removed first."
          confirmLabel="Delete"
          busy={deleteMutation.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting)}
        />
      )}
    </div>
  );
}
