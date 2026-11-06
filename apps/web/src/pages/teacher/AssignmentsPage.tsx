import { zodResolver } from '@hookform/resolvers/zod';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  assignmentBody,
  gradeBody,
  type GradeBody,
  type Paginated,
  type StoredFile,
  type SubmissionRow,
  type TeacherAssignment,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FileList } from '@/components/FileList';
import { FormField } from '@/components/FormField';
import { Markdown } from '@/components/Markdown';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ResourceManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { offeringLabel } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { useMyOfferings } from './useMyOfferings';

export const UPLOAD_HINT = `Up to 5 files of 10 MB each: ${ALLOWED_UPLOAD_EXTENSIONS.filter((e) => e !== 'jpeg').join(', ')}.`;
export const UPLOAD_ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',');

/** datetime-local gives local time with no zone, so it is converted before leaving the browser. */
const formSchema = assignmentBody.extend({
  dueAt: z
    .string()
    .min(1, 'Choose a due date')
    .transform((value) => new Date(value).toISOString()),
});

function AssignmentDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const offerings = useMyOfferings();
  const [files, setFiles] = useState<File[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>({
    // The installed resolver types do not model a schema whose input and output differ.
    resolver: zodResolver(formSchema) as unknown as Resolver<
      z.input<typeof formSchema>,
      unknown,
      z.output<typeof formSchema>
    >,
    defaultValues: {
      courseOfferingId: '',
      title: '',
      description: '',
      dueAt: '',
      maxMarks: 20,
      allowLate: false,
    },
  });

  const submit = handleSubmit(async (values) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.append(key, String(value));
    files.forEach((file) => form.append('files', file));
    try {
      await api.post('/assignments', form);
      toast.success('Assignment created');
      await queryClient.invalidateQueries({ queryKey: ['/assignments'] });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>New assignment</DialogTitle>
          <DialogDescription>Students in the section will see it straight away.</DialogDescription>
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
          <FormField label="Instructions" hint="You can use markdown, like **bold** and - lists.">
            <textarea
              rows={5}
              className="w-full rounded-md border bg-card px-3 py-2 text-sm"
              {...register('description')}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Due" error={errors.dueAt?.message}>
              <Input type="datetime-local" {...register('dueAt')} />
            </FormField>
            <FormField label="Max marks" error={errors.maxMarks?.message}>
              <Input type="number" {...register('maxMarks')} />
            </FormField>
          </div>
          <label className="flex min-h-10 items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="size-5 accent-primary" {...register('allowLate')} />
            Accept late submissions
          </label>
          <FormField label="Attachments (optional)" hint={UPLOAD_HINT}>
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
              {isSubmitting ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherAssignmentsPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TeacherAssignment | null>(null);
  const query = useQuery({
    queryKey: ['/assignments', 'list'],
    queryFn: () => api.get<Paginated<TeacherAssignment>>('/assignments?pageSize=100'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/assignments/${id}`),
    onSuccess: async () => {
      setDeleting(null);
      toast.success('Deleted');
      await queryClient.invalidateQueries({ queryKey: ['/assignments'] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Assignments"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New assignment
          </Button>
        }
      />
      {query.isPending ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assignments yet" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {query.data.data.map((assignment) => (
            <li key={assignment.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3 pt-5">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {assignment.courseCode}, Section {assignment.sectionName}
                    </p>
                    <h2 className="font-semibold leading-snug">{assignment.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Due {formatDateTime(assignment.dueAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>
                      {assignment.submissionCount} of {assignment.studentCount} submitted
                    </Badge>
                    {assignment.submissionCount > assignment.gradedCount && (
                      <Badge variant="warning">
                        {assignment.submissionCount - assignment.gradedCount} to grade
                      </Badge>
                    )}
                    {assignment.allowLate && <Badge variant="muted">Late allowed</Badge>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/teacher/assignments/${assignment.id}`}>
                        <Users /> Submissions
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${assignment.title}`}
                      onClick={() => setDeleting(assignment)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {creating && <AssignmentDialog onClose={() => setCreating(false)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.title}?`}
          description="All submissions and their files will be deleted too. This cannot be undone."
          confirmLabel="Delete"
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      )}
    </>
  );
}

interface SubmissionList {
  title: string;
  maxMarks: number;
  rows: SubmissionRow[];
}

function GradeForm({
  assignmentId,
  submission,
  maxMarks,
}: {
  assignmentId: string;
  submission: NonNullable<SubmissionRow['submission']>;
  maxMarks: number;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GradeBody>({
    resolver: zodResolver(gradeBody),
    defaultValues: {
      marks: submission.marks ?? undefined,
      feedback: submission.feedback ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await api.put(`/submissions/${submission.id}/grade`, values);
      toast.success('Graded');
      await queryClient.invalidateQueries({ queryKey: ['/assignments'] });
      await queryClient.invalidateQueries({ queryKey: ['submissions', assignmentId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    }
  });

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="grid gap-3 sm:grid-cols-[6rem_1fr_auto] sm:items-end"
      noValidate
    >
      <FormField label={`Marks / ${maxMarks}`} error={errors.marks?.message}>
        <Input inputMode="decimal" {...register('marks')} />
      </FormField>
      <FormField label="Feedback">
        <Input {...register('feedback')} />
      </FormField>
      <Button type="submit" disabled={isSubmitting}>
        Save
      </Button>
    </form>
  );
}

export function SubmissionsPage() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['submissions', id],
    queryFn: () => api.get<SubmissionList>(`/assignments/${id}/submissions`),
  });

  if (query.isPending) return <LoadingRows rows={8} />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const submitted = query.data.rows.filter((row) => row.submission).length;

  return (
    <>
      <PageHeader
        title={query.data.title}
        description={`${submitted} of ${query.data.rows.length} students have submitted.`}
      />
      <ul className="space-y-3">
        {query.data.rows.map((row) => (
          <li key={row.studentId} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{row.studentName}</p>
                <p className="text-sm text-muted-foreground">{row.rollNumber}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {!row.submission && <Badge variant="muted">Not submitted</Badge>}
                {row.submission?.isLate && <Badge variant="warning">Late</Badge>}
                {row.submission?.gradedAt && <Badge>Graded</Badge>}
                {row.submission && !row.submission.gradedAt && (
                  <Badge variant="muted">To grade</Badge>
                )}
              </div>
            </div>
            {row.submission && (
              <>
                <p className="text-sm text-muted-foreground">
                  Submitted {formatDateTime(row.submission.submittedAt)}
                </p>
                {row.submission.text && <Markdown>{row.submission.text}</Markdown>}
                <FileList
                  files={row.submission.files as StoredFile[]}
                  basePath={`/submissions/${row.submission.id}`}
                />
                <GradeForm
                  assignmentId={id}
                  submission={row.submission}
                  maxMarks={query.data.maxMarks}
                />
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
