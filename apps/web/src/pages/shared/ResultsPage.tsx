import type { SemesterResult, StudentResults } from '@shikshya/shared';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { useCurrentUser } from '@/auth/AuthContext';
import { TrendLineChart } from '@/components/Charts';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { ChildSwitcher, useActiveChild } from './ChildSwitcher';

function SemesterCard({ semester }: { semester: SemesterResult }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Semester {semester.semesterNumber}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {semester.programCode}, {semester.academicYear}, {semester.totalCredits} credits
          </p>
        </div>
        <div className="text-right">
          <p className="font-heading text-2xl font-bold">{semester.gpa.toFixed(2)}</p>
          <Badge variant={semester.status === 'PASS' ? 'default' : 'warning'}>
            {semester.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          rows={semester.courses}
          rowKey={(row) => row.courseId}
          columns={[
            { header: 'Code', cell: (row) => row.courseCode },
            { header: 'Course', cell: (row) => row.courseTitle },
            { header: 'Credits', cell: (row) => row.creditHours },
            { header: 'Percent', cell: (row) => `${row.percent}%` },
            {
              header: 'Grade',
              cell: (row) => (
                <Badge variant={row.grade === 'F' ? 'warning' : 'default'}>{row.grade}</Badge>
              ),
            },
            { header: 'Grade point', cell: (row) => row.gradePoint.toFixed(1) },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function ResultsView({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ['results', studentId],
    queryFn: () => api.get<StudentResults>(`/students/${studentId}/results`),
  });

  if (query.isPending) return <LoadingRows rows={6} />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const { semesters, cgpa } = query.data;
  if (semesters.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No results yet"
        description="Results appear here once your college publishes them."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">CGPA</p>
            <p className="font-heading text-5xl font-bold">{cgpa.toFixed(2)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Across {semesters.length} published{' '}
              {semesters.length === 1 ? 'semester' : 'semesters'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>GPA by semester</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendLineChart
              ariaLabel="GPA for each published semester"
              xHeader="Semester"
              valueHeader="GPA"
              yDomain={[0, 4]}
              format={(value) => value.toFixed(2)}
              data={semesters.map((s) => ({ name: `Sem ${s.semesterNumber}`, value: s.gpa }))}
            />
          </CardContent>
        </Card>
      </div>
      {[...semesters].reverse().map((semester) => (
        <SemesterCard key={semester.resultId} semester={semester} />
      ))}
    </div>
  );
}

export function StudentResultsPage() {
  const { studentId } = useCurrentUser();
  return (
    <>
      <PageHeader title="My results" />
      {studentId && <ResultsView studentId={studentId} />}
    </>
  );
}

export function ParentResultsPage() {
  const { activeId, children, status } = useActiveChild();
  return (
    <>
      <PageHeader title="Results" />
      <ChildSwitcher status={status}>{children}</ChildSwitcher>
      {activeId && <ResultsView studentId={activeId} />}
    </>
  );
}
