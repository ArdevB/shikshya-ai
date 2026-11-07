import { zodResolver } from '@hookform/resolvers/zod';
import {
  policyDocumentBody,
  type PolicyDocumentBody,
  type Paginated,
  PolicyDocumentView,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookText, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

const KEY = ['/policies'];

function UploadDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PolicyDocumentBody>({
    resolver: zodResolver(policyDocumentBody),
    defaultValues: { title: '' },
  });

  const submit = handleSubmit(async (values) => {
    if (!file) {
      toast.error('Please choose a file');
      return;
    }
    const form = new FormData();
    form.append('title', values.title);
    form.append('files', file);
    try {
      await api.post('/policies', form);
      toast.success('Added. The assistant can now answer from it.');
      await queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add it');
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Add college rules</DialogTitle>
          <DialogDescription>
            A PDF, Word or text file. Everyone can ask the assistant about it, so only add what
            everyone may read.
          </DialogDescription>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
          <FormField label="Title" error={errors.title?.message}>
            <Input {...register('title')} placeholder="Examination rules 2026" />
          </FormField>
          <FormField label="File" hint="PDF, DOCX or TXT, up to 10 MB">
            <Input
              type="file"
              accept=".pdf,.docx,.txt"
              className="pt-2"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Reading the file…' : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PoliciesPage() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const documents = useQuery({
    queryKey: KEY,
    // A college has a handful of these, so one long page is plenty.
    queryFn: () => api.get<Paginated<PolicyDocumentView>>('/policies?pageSize=100'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/policies/${id}`),
    onSuccess: async () => {
      toast.success('Removed');
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toast.error(error.message),
  });

  const reindex = useMutation({
    mutationFn: () => api.post<{ embedded: number }>('/policies/reindex'),
    onSuccess: async ({ embedded }) => {
      toast.success(
        embedded ? `Prepared ${embedded} more passages for search` : 'Nothing needed preparing',
      );
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toast.error(error.message),
  });

  const incomplete = documents.data?.data.some((item) => item.embeddedChunks < item.chunks);

  return (
    <>
      <PageHeader
        title="College rules"
        description="Documents the assistant answers from. It quotes them rather than guessing."
        actions={
          <>
            {incomplete && (
              <Button
                variant="outline"
                disabled={reindex.isPending}
                onClick={() => reindex.mutate()}
              >
                <RefreshCw /> {reindex.isPending ? 'Preparing…' : 'Prepare search'}
              </Button>
            )}
            <Button onClick={() => setUploading(true)}>
              <Plus /> Add rules
            </Button>
          </>
        }
      />
      {documents.isPending ? (
        <LoadingRows rows={3} />
      ) : documents.isError ? (
        <ErrorState error={documents.error} onRetry={() => void documents.refetch()} />
      ) : documents.data.data.length === 0 ? (
        <EmptyState
          icon={BookText}
          title="No rules added yet"
          description="Add the examination or attendance rules, and students can ask about them."
        />
      ) : (
        <DataTable
          rows={documents.data.data}
          rowKey={(row) => row.id}
          columns={[
            { header: 'Title', cell: (row) => <span className="font-medium">{row.title}</span> },
            { header: 'File', cell: (row) => row.fileName },
            {
              header: 'Search',
              cell: (row) =>
                row.embeddedChunks === row.chunks ? (
                  <Badge>By meaning</Badge>
                ) : (
                  <Badge variant="muted">By keyword only</Badge>
                ),
            },
            { header: 'Added by', cell: (row) => row.uploadedBy },
            { header: 'Added', cell: (row) => formatDateTime(row.createdAt) },
            {
              header: 'Actions',
              cell: (row) => (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${row.title}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(row.id)}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              ),
            },
          ]}
        />
      )}
      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
    </>
  );
}
