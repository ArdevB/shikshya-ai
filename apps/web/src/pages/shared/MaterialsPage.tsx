import { zodResolver } from '@hookform/resolvers/zod';
import {
  materialBody,
  type MaterialBody,
  type MaterialView,
  type Paginated,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenText, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useCurrentUser } from '@/auth/AuthContext';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FileList } from '@/components/FileList';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { offeringLabel } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { UPLOAD_ACCEPT, UPLOAD_HINT } from '@/pages/teacher/AssignmentsPage';
import { useMyOfferings } from '@/pages/teacher/useMyOfferings';
import { ChildSwitcher, useActiveChild } from './ChildSwitcher';

function MaterialCards({
  materials,
  onDelete,
}: {
  materials: MaterialView[];
  onDelete?: (material: MaterialView) => void;
}) {
  if (materials.length === 0) {
    return <EmptyState icon={BookOpenText} title="No materials yet" />;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {materials.map((material) => (
        <Card key={material.id}>
          <CardContent className="space-y-2 pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">
                  {material.courseCode}, {formatDate(material.createdAt)}
                </p>
                <h2 className="font-semibold leading-snug">{material.title}</h2>
              </div>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${material.title}`}
                  onClick={() => onDelete(material)}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              )}
            </div>
            {material.description && <p className="text-sm">{material.description}</p>}
            <FileList files={material.files} basePath={`/materials/${material.id}`} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const offerings = useMyOfferings();
  const [files, setFiles] = useState<File[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MaterialBody>({
    resolver: zodResolver(materialBody),
    defaultValues: { courseOfferingId: '', title: '', description: '' },
  });

  const submit = handleSubmit(async (values) => {
    const form = new FormData();
    form.append('courseOfferingId', values.courseOfferingId);
    form.append('title', values.title);
    if (values.description) form.append('description', values.description);
    files.forEach((file) => form.append('files', file));
    try {
      await api.post('/materials', form);
      toast.success('Uploaded');
      await queryClient.invalidateQueries({ queryKey: ['/materials'] });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload');
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Upload material</DialogTitle>
          <DialogDescription>Students in the section can download it.</DialogDescription>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
          <FormField label="Class" error={errors.courseOfferingId?.message}>
            <Select {...register('courseOfferingId')}>
              <option value="">Choose a class…</option>
              {offerings.data?.data.map((offering) => (
                <option key={offering.id} value={offering.id}>
                  {offeringLabel(offering)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Title" error={errors.title?.message}>
            <Input {...register('title')} />
          </FormField>
          <FormField label="Description (optional)">
            <Input {...register('description')} />
          </FormField>
          <FormField label="Files" hint={UPLOAD_HINT}>
            <Input
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              className="pt-2"
              onChange={(event) => setFiles([...(event.target.files ?? [])])}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherMaterialsPage() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const query = useQuery({
    queryKey: ['/materials', 'list'],
    queryFn: () => api.get<Paginated<MaterialView>>('/materials?pageSize=100'),
  });
  const remove = useMutation({
    mutationFn: (material: MaterialView) => api.delete(`/materials/${material.id}`),
    onSuccess: async () => {
      toast.success('Deleted');
      await queryClient.invalidateQueries({ queryKey: ['/materials'] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Materials"
        actions={
          <Button onClick={() => setUploading(true)}>
            <Plus /> Upload
          </Button>
        }
      />
      {query.isPending ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <MaterialCards materials={query.data.data} onDelete={(m) => remove.mutate(m)} />
      )}
      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
    </>
  );
}

function StudentMaterials({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ['student-materials', studentId],
    queryFn: () => api.get<MaterialView[]>(`/students/${studentId}/materials`),
  });
  if (query.isPending) return <LoadingRows />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  return <MaterialCards materials={query.data} />;
}

export function StudentMaterialsPage() {
  const { studentId } = useCurrentUser();
  return (
    <>
      <PageHeader title="Materials" description="Notes and slides from your teachers." />
      {studentId && <StudentMaterials studentId={studentId} />}
    </>
  );
}

export function ParentMaterialsPage() {
  const { activeId, children, status } = useActiveChild();
  return (
    <>
      <PageHeader title="Materials" />
      <ChildSwitcher status={status}>{children}</ChildSwitcher>
      {activeId && <StudentMaterials studentId={activeId} />}
    </>
  );
}
