import { EXAM_TYPES, examBody, examSubjectBody, type ExamType } from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, Lock, LockOpen, Plus, Settings2, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog, ResourceForm, ResourceManager } from '@/components/ResourceManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { offeringLabel, type CourseOffering, type Semester } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';
import { formatDate, toDateInput } from '@/lib/utils';

export interface Exam {
  id: string;
  semesterId: string;
  name: string;
  type: ExamType;
  startDate: string;
  endDate: string;
  isPublished: boolean;
  semester: {
    id: string;
    number: number;
    program: { code: string };
    academicYear: { name: string };
  };
  _count: { subjects: number };
}

export interface ExamSubject {
  id: string;
  fullMarks: string;
  passMarks: string;
  date: string | null;
  exam: { id: string; name: string; isPublished: boolean; type: ExamType };
  courseOffering: {
    id: string;
    course: { code: string; title: string };
    section: { id: string; name: string };
    teacher: { user: { firstName: string; lastName: string } };
  };
  _count: { marks: number };
}

const semesterLabel = (s: Semester) =>
  `${s.program.code} Semester ${s.number} (${s.academicYear.name})`;

export function PublishedBadge({ published }: { published: boolean }) {
  return published ? (
    <Badge>
      <Lock className="size-3" aria-hidden /> Published
    </Badge>
  ) : (
    <Badge variant="muted">Open for marks</Badge>
  );
}

export function ExamsPage() {
  const semesters = useOptions<Semester>('/semesters', (s) => ({
    value: s.id,
    label: semesterLabel(s),
  }));

  return (
    <>
      <PageHeader
        title="Exams"
        description="Schedule exams, then publish them to create results."
      />
      <ResourceManager<Exam>
        path="/exams"
        noun="exam"
        icon={FileCheck2}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
        columns={[
          { header: 'Name', cell: (row) => row.name },
          { header: 'Type', cell: (row) => row.type },
          {
            header: 'Semester',
            cell: (row) => `${row.semester.program.code} Sem ${row.semester.number}`,
          },
          { header: 'Starts', cell: (row) => formatDate(row.startDate) },
          { header: 'Subjects', cell: (row) => row._count.subjects },
          { header: 'Status', cell: (row) => <PublishedBadge published={row.isPublished} /> },
        ]}
        rowActions={(row) => (
          <Button asChild variant="ghost" size="icon" aria-label={`Manage ${row.name}`}>
            <Link to={`/admin/exams/${row.id}`}>
              <Settings2 />
            </Link>
          </Button>
        )}
        fields={[
          { name: 'semesterId', label: 'Semester', type: 'select', options: semesters },
          { name: 'name', label: 'Name', placeholder: 'First Term' },
          {
            name: 'type',
            label: 'Type',
            type: 'select',
            options: EXAM_TYPES.map((type) => ({ value: type, label: type })),
          },
          { name: 'startDate', label: 'Start date', type: 'date' },
          { name: 'endDate', label: 'End date', type: 'date' },
        ]}
        createSchema={examBody}
        emptyValues={{ semesterId: '', name: '', type: 'INTERNAL', startDate: '', endDate: '' }}
        toFormValues={(row) => ({
          semesterId: row.semesterId,
          name: row.name,
          type: row.type,
          startDate: toDateInput(row.startDate),
          endDate: toDateInput(row.endDate),
        })}
      />
    </>
  );
}

export function ExamDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<'publish' | 'unlock' | null>(null);

  const exam = useQuery({
    queryKey: ['/exams', 'detail', id],
    queryFn: () => api.get<Exam>(`/exams/${id}`),
  });
  const subjects = useQuery({
    queryKey: ['/exams', 'subjects', id],
    queryFn: () => api.get<ExamSubject[]>(`/exams/${id}/subjects`),
  });
  const offerings = useOptions<CourseOffering>('/course-offerings', (o) => ({
    value: o.id,
    label: offeringLabel(o),
  }));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/exams'] });

  const change = useMutation({
    mutationFn: (action: 'publish' | 'unlock') => api.post<Exam>(`/exams/${id}/${action}`),
    onSuccess: async (_data, action) => {
      toast.success(action === 'publish' ? 'Published. Results are now visible.' : 'Unlocked');
      setConfirming(null);
      await refresh();
    },
    onError: (error) => {
      setConfirming(null);
      toast.error(error.message, { duration: 10000 });
    },
  });

  const removeSubject = useMutation({
    mutationFn: (subjectId: string) => api.delete(`/exam-subjects/${subjectId}`),
    onSuccess: () => refresh(),
    onError: (error) => toast.error(error.message),
  });

  if (exam.isPending) return <LoadingRows />;
  if (exam.isError) return <ErrorState error={exam.error} onRetry={() => void exam.refetch()} />;

  const published = exam.data.isPublished;

  return (
    <>
      <PageHeader
        title={exam.data.name}
        description={`${exam.data.semester.program.code} Semester ${exam.data.semester.number}, ${formatDate(exam.data.startDate)} to ${formatDate(exam.data.endDate)}`}
        actions={
          published ? (
            <Button variant="outline" onClick={() => setConfirming('unlock')}>
              <LockOpen /> Unlock
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setAdding(true)}>
                <Plus /> Add subject
              </Button>
              <Button onClick={() => setConfirming('publish')}>
                <Lock /> Publish
              </Button>
            </>
          )
        }
      />
      <div className="mb-4">
        <PublishedBadge published={published} />
      </div>

      {subjects.isPending ? (
        <LoadingRows />
      ) : subjects.data?.length ? (
        <DataTable
          rows={subjects.data}
          rowKey={(row) => row.id}
          columns={[
            {
              header: 'Course',
              cell: (row) =>
                `${row.courseOffering.course.code}, Section ${row.courseOffering.section.name}`,
            },
            {
              header: 'Teacher',
              cell: (row) =>
                `${row.courseOffering.teacher.user.firstName} ${row.courseOffering.teacher.user.lastName}`,
            },
            { header: 'Full marks', cell: (row) => Number(row.fullMarks) },
            { header: 'Pass marks', cell: (row) => Number(row.passMarks) },
            { header: 'Date', cell: (row) => (row.date ? formatDate(row.date) : '–') },
            { header: 'Marks entered', cell: (row) => row._count.marks },
          ]}
          actions={
            published
              ? undefined
              : (row) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${row.courseOffering.course.code}`}
                    onClick={() => removeSubject.mutate(row.id)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                )
          }
        />
      ) : (
        <EmptyState
          icon={FileCheck2}
          title="No subjects yet"
          description="Add the courses this exam covers. Their teachers can then enter marks."
        />
      )}

      {adding && (
        <ResourceForm
          title="Add subject"
          fields={[
            {
              name: 'courseOfferingId',
              label: 'Class',
              type: 'select',
              options: offerings,
            },
            { name: 'fullMarks', label: 'Full marks', type: 'number' },
            { name: 'passMarks', label: 'Pass marks', type: 'number' },
            { name: 'date', label: 'Date (optional)', type: 'date' },
          ]}
          schema={examSubjectBody}
          defaultValues={{ courseOfferingId: '', fullMarks: 100, passMarks: 40, date: '' }}
          submitLabel="Add subject"
          isEditing={false}
          onClose={() => setAdding(false)}
          onSubmit={async (values) => {
            await api.post(`/exams/${id}/subjects`, values);
            toast.success('Added');
            await refresh();
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming === 'publish' ? 'Publish this exam?' : 'Unlock this exam?'}
          description={
            confirming === 'publish'
              ? 'Marks will be locked, results will be calculated, and students will see them.'
              : 'Teachers will be able to change marks. Students will not see this exam in their results until you publish it again.'
          }
          confirmLabel={confirming === 'publish' ? 'Publish' : 'Unlock'}
          variant="default"
          busy={change.isPending}
          onClose={() => setConfirming(null)}
          onConfirm={() => change.mutate(confirming)}
        />
      )}
    </>
  );
}
