import { courseBody } from '@shikshya/shared';
import { BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ResourceManager } from '@/components/ResourceManager';
import { Badge } from '@/components/ui/badge';
import type { Course, Program } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';

export function CoursesPage() {
  const programs = useOptions<Program>('/programs', (p) => ({ value: p.id, label: p.name }));

  return (
    <>
      <PageHeader title="Courses" description="The courses each program teaches, by semester." />
      <ResourceManager<Course>
        path="/courses"
        noun="course"
        icon={BookOpen}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.title}
        columns={[
          { header: 'Code', cell: (row) => row.code },
          { header: 'Title', cell: (row) => row.title },
          { header: 'Program', cell: (row) => row.program.code },
          { header: 'Semester', cell: (row) => row.semesterNumber },
          { header: 'Credits', cell: (row) => row.creditHours },
          {
            header: 'Practical',
            cell: (row) =>
              row.hasPractical ? <Badge>Yes</Badge> : <Badge variant="muted">No</Badge>,
          },
        ]}
        fields={[
          { name: 'programId', label: 'Program', type: 'select', options: programs },
          { name: 'code', label: 'Code', placeholder: 'CSC364' },
          { name: 'title', label: 'Title', placeholder: 'Software Engineering' },
          { name: 'creditHours', label: 'Credit hours', type: 'number' },
          { name: 'semesterNumber', label: 'Semester number', type: 'number' },
          { name: 'hasPractical', label: 'This course has a practical', type: 'checkbox' },
        ]}
        createSchema={courseBody}
        emptyValues={{
          programId: '',
          code: '',
          title: '',
          creditHours: 3,
          semesterNumber: 1,
          hasPractical: false,
        }}
        toFormValues={(row) => ({
          programId: row.programId,
          code: row.code,
          title: row.title,
          creditHours: row.creditHours,
          semesterNumber: row.semesterNumber,
          hasPractical: row.hasPractical,
        })}
      />
    </>
  );
}
