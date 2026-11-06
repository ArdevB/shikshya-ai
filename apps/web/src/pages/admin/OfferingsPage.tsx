import { courseOfferingBody } from '@shikshya/shared';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { ResourceManager } from '@/components/ResourceManager';
import { Select } from '@/components/ui/input';
import {
  personName,
  sectionLabel,
  type Course,
  type CourseOffering,
  type Section,
  type Teacher,
} from '@/lib/types';
import { useOptions } from '@/lib/useOptions';

export function OfferingsPage() {
  const [sectionId, setSectionId] = useState('');
  const courses = useOptions<Course>('/courses', (c) => ({
    value: c.id,
    label: `${c.code} ${c.title} (${c.program.code} Sem ${c.semesterNumber})`,
  }));
  const sections = useOptions<Section>('/sections', (s) => ({
    value: s.id,
    label: sectionLabel(s),
  }));
  const teachers = useOptions<Teacher>('/teachers', (t) => ({
    value: t.id,
    label: personName(t.user),
  }));

  return (
    <>
      <PageHeader
        title="Course assignments"
        description="Choose who teaches which course to which section."
      />
      <ResourceManager<CourseOffering>
        path="/course-offerings"
        noun="assignment"
        icon={CalendarDays}
        filters={{ sectionId }}
        toolbar={
          <div className="sm:max-w-xs">
            <FormField label="Filter by section">
              <Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                <option value="">All sections</option>
                {sections.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        }
        rowKey={(row) => row.id}
        rowLabel={(row) => `${row.course.code}, Section ${row.section.name}`}
        columns={[
          { header: 'Course', cell: (row) => `${row.course.code} ${row.course.title}` },
          { header: 'Section', cell: (row) => sectionLabel(row.section) },
          { header: 'Teacher', cell: (row) => personName(row.teacher.user) },
        ]}
        fields={[
          { name: 'courseId', label: 'Course', type: 'select', options: courses },
          { name: 'sectionId', label: 'Section', type: 'select', options: sections },
          { name: 'teacherId', label: 'Teacher', type: 'select', options: teachers },
        ]}
        createSchema={courseOfferingBody}
        emptyValues={{ courseId: '', sectionId, teacherId: '' }}
        toFormValues={(row) => ({
          courseId: row.courseId,
          sectionId: row.sectionId,
          teacherId: row.teacherId,
        })}
      />
    </>
  );
}
