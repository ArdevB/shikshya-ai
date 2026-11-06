import { MAX_PAGE_SIZE, type Paginated, type SectionResultSummary } from '@shikshya/shared';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { useCurrentUser } from '@/auth/AuthContext';
import { CountBarChart } from '@/components/Charts';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { api, queryString } from '@/lib/api';
import { sectionLabel, type CourseOffering, type Section } from '@/lib/types';

/** Admins can pick any section; teachers only the sections they teach. */
function useSectionChoices() {
  const { teacherId } = useCurrentUser();
  const query = useQuery({
    queryKey: ['section-choices', teacherId],
    queryFn: async () => {
      if (teacherId) {
        const offerings = await api.get<Paginated<CourseOffering>>(
          `/course-offerings${queryString({ teacherId, pageSize: MAX_PAGE_SIZE })}`,
        );
        const unique = new Map(offerings.data.map((o) => [o.section.id, o.section]));
        return [...unique.values()];
      }
      const sections = await api.get<Paginated<Section>>(`/sections?pageSize=${MAX_PAGE_SIZE}`);
      return sections.data;
    },
  });
  return query.data ?? [];
}

function Summary({ sectionId }: { sectionId: string }) {
  const query = useQuery({
    queryKey: ['section-results', sectionId],
    queryFn: () => api.get<SectionResultSummary>(`/sections/${sectionId}/results`),
  });

  if (query.isPending) return <LoadingRows rows={6} />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const data = query.data;
  if (data.studentCount === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No published results yet"
        description="Results appear once an exam for this section is published."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ['Students', data.studentCount],
            ['Passed', `${data.passPercent}%`],
            ['Average GPA', data.averageGpa.toFixed(2)],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="font-heading text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grade distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <CountBarChart
            ariaLabel={`Number of course grades awarded in Section ${data.sectionName}`}
            xHeader="Grade"
            valueHeader="Courses"
            data={data.gradeDistribution.map((g) => ({ name: g.grade, value: g.count }))}
          />
        </CardContent>
      </Card>

      <DataTable
        rows={data.students}
        rowKey={(row) => row.studentId}
        columns={[
          { header: 'Roll no.', cell: (row) => row.rollNumber },
          { header: 'Name', cell: (row) => row.studentName },
          { header: 'GPA', cell: (row) => row.gpa.toFixed(2) },
          {
            header: 'Status',
            cell: (row) => (
              <Badge variant={row.status === 'PASS' ? 'default' : 'warning'}>{row.status}</Badge>
            ),
          },
        ]}
      />
    </div>
  );
}

export function SectionResultsPage() {
  const sections = useSectionChoices();
  const [sectionId, setSectionId] = useState('');

  return (
    <>
      <PageHeader title="Class results" description="Published results for one section." />
      <div className="mb-4 md:max-w-md">
        <FormField label="Section">
          <Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            <option value="">Choose a section…</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {sectionLabel(section)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {sectionId ? (
        <Summary sectionId={sectionId} />
      ) : (
        <EmptyState icon={GraduationCap} title="Choose a section to see its results" />
      )}
    </>
  );
}
