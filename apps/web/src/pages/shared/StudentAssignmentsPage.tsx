import type { AssignmentStatus, StudentAssignment } from '@shikshya/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/auth/AuthContext';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FileList } from '@/components/FileList';
import { FormField } from '@/components/FormField';
import { Markdown } from '@/components/Markdown';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { UPLOAD_ACCEPT, UPLOAD_HINT } from '@/pages/teacher/AssignmentsPage';
import { ChildSwitcher, useActiveChild } from './ChildSwitcher';

const STATUS: Record<
  AssignmentStatus,
  { label: string; variant: 'default' | 'warning' | 'muted' }
> = {
  DUE: { label: 'Due', variant: 'default' },
  OVERDUE: { label: 'Overdue', variant: 'warning' },
  SUBMITTED: { label: 'Submitted', variant: 'muted' },
  GRADED: { label: 'Graded', variant: 'default' },
};

function SubmitDialog({
  assignment,
  queryKey,
  onClose,
}: {
  assignment: StudentAssignment;
  queryKey: unknown[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(assignment.submission?.text ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const isResubmit = assignment.submission !== null;

  const submit = async () => {
    const form = new FormData();
    if (text.trim()) form.append('text', text);
    files.forEach((file) => form.append('files', file));
    setBusy(true);
    try {
      await api.post(`/assignments/${assignment.id}/submission`, form);
      toast.success(isResubmit ? 'Resubmitted' : 'Submitted');
      await queryClient.invalidateQueries({ queryKey });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>{isResubmit ? 'Resubmit' : 'Submit'} your work</DialogTitle>
          <DialogDescription>
            {isResubmit
              ? 'This replaces your earlier submission, including its files.'
              : assignment.title}
          </DialogDescription>
        </div>
        <FormField label="Your answer (optional if you attach a file)">
          <textarea
            rows={5}
            className="w-full rounded-md border bg-card px-3 py-2 text-sm"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
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
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentCard({
  assignment,
  canSubmit,
  onSubmit,
}: {
  assignment: StudentAssignment;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  const status = STATUS[assignment.status];
  const pastDue = new Date(assignment.dueAt) < new Date();
  const { submission } = assignment;
  const open =
    assignment.status !== 'GRADED' && (!pastDue || (assignment.allowLate && submission === null));

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">{assignment.courseCode}</p>
            <h2 className="font-semibold leading-snug">{assignment.title}</h2>
            <p className="text-sm text-muted-foreground">
              Due {formatDateTime(assignment.dueAt)}, {assignment.maxMarks} marks
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={status.variant}>{status.label}</Badge>
            {submission?.isLate && <Badge variant="warning">Late</Badge>}
          </div>
        </div>
        <Markdown>{assignment.description}</Markdown>
        <FileList files={assignment.attachments} basePath={`/assignments/${assignment.id}`} />

        {submission?.marks !== null && submission?.marks !== undefined && (
          <div className="rounded-md bg-primary-soft p-3 text-sm">
            <p className="font-semibold">
              {submission.marks} / {assignment.maxMarks}
            </p>
            {submission.feedback && <p className="mt-1">{submission.feedback}</p>}
          </div>
        )}
        {submission && (
          <div className="text-sm">
            <p className="text-muted-foreground">
              Submitted {formatDateTime(submission.submittedAt)}
            </p>
            <FileList files={submission.files} basePath={`/submissions/${submission.id}`} />
          </div>
        )}

        {canSubmit && open && (
          <Button size="sm" onClick={onSubmit}>
            <Upload /> {submission ? 'Resubmit' : pastDue ? 'Submit late' : 'Submit'}
          </Button>
        )}
        {canSubmit && !open && !submission && (
          <p className="text-sm text-accent-dark">
            The deadline has passed and late work is not accepted.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AssignmentList({ studentId, canSubmit }: { studentId: string; canSubmit: boolean }) {
  const queryKey = ['student-assignments', studentId];
  const [submitting, setSubmitting] = useState<StudentAssignment | null>(null);
  const query = useQuery({
    queryKey,
    queryFn: () => api.get<StudentAssignment[]>(`/students/${studentId}/assignments`),
  });

  if (query.isPending) return <LoadingRows />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (query.data.length === 0) {
    return <EmptyState icon={ClipboardList} title="No assignments yet" />;
  }
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {query.data.map((assignment) => (
          <AssignmentCard
            key={assignment.id}
            assignment={assignment}
            canSubmit={canSubmit}
            onSubmit={() => setSubmitting(assignment)}
          />
        ))}
      </div>
      {submitting && (
        <SubmitDialog
          assignment={submitting}
          queryKey={queryKey}
          onClose={() => setSubmitting(null)}
        />
      )}
    </>
  );
}

export function StudentAssignmentsPage() {
  const { studentId } = useCurrentUser();
  return (
    <>
      <PageHeader title="Assignments" />
      {studentId && <AssignmentList studentId={studentId} canSubmit />}
    </>
  );
}

export function ParentAssignmentsPage() {
  const { activeId, children, status } = useActiveChild();
  return (
    <>
      <PageHeader title="Assignments" />
      <ChildSwitcher status={status}>{children}</ChildSwitcher>
      {activeId && <AssignmentList studentId={activeId} canSubmit={false} />}
    </>
  );
}
