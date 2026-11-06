import { academicYearBody, sectionBody, semesterBody } from '@shikshya/shared';
import { CalendarRange, Layers, Rows3 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ResourceManager } from '@/components/ResourceManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { FormField } from '@/components/FormField';
import type { AcademicYear, Program, Section, Semester } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';
import { formatDate, toDateInput } from '@/lib/utils';

const TABS = ['Sections', 'Semesters', 'Academic years'] as const;
type Tab = (typeof TABS)[number];

const semesterLabel = (s: Semester) =>
  `${s.program.code} Semester ${s.number} (${s.academicYear.name})`;

function AcademicYears() {
  return (
    <ResourceManager<AcademicYear>
      path="/academic-years"
      noun="academic year"
      icon={CalendarRange}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.name}
      columns={[
        {
          header: 'Name',
          cell: (row) => (
            <span className="inline-flex items-center gap-2">
              {row.name}
              {row.isCurrent && <Badge>Current</Badge>}
            </span>
          ),
        },
        { header: 'Starts', cell: (row) => formatDate(row.startDate) },
        { header: 'Ends', cell: (row) => formatDate(row.endDate) },
      ]}
      fields={[
        { name: 'name', label: 'Name', placeholder: '2026/27' },
        { name: 'startDate', label: 'Start date', type: 'date' },
        { name: 'endDate', label: 'End date', type: 'date' },
        { name: 'isCurrent', label: 'This is the current academic year', type: 'checkbox' },
      ]}
      createSchema={academicYearBody}
      emptyValues={{ name: '', startDate: '', endDate: '', isCurrent: false }}
      toFormValues={(row) => ({
        name: row.name,
        startDate: toDateInput(row.startDate),
        endDate: toDateInput(row.endDate),
        isCurrent: row.isCurrent,
      })}
    />
  );
}

function Semesters() {
  const [programId, setProgramId] = useState('');
  const programs = useOptions<Program>('/programs', (p) => ({ value: p.id, label: p.name }));
  const years = useOptions<AcademicYear>('/academic-years', (y) => ({
    value: y.id,
    label: y.name,
  }));

  return (
    <ResourceManager<Semester>
      path="/semesters"
      noun="semester"
      icon={Layers}
      filters={{ programId }}
      toolbar={
        <div className="sm:max-w-xs">
          <FormField label="Filter by program">
            <Select value={programId} onChange={(event) => setProgramId(event.target.value)}>
              <option value="">All programs</option>
              {programs.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      }
      rowKey={(row) => row.id}
      rowLabel={semesterLabel}
      columns={[
        { header: 'Program', cell: (row) => row.program.name },
        { header: 'Semester', cell: (row) => row.number },
        { header: 'Academic year', cell: (row) => row.academicYear.name },
        { header: 'Starts', cell: (row) => formatDate(row.startDate) },
        { header: 'Ends', cell: (row) => formatDate(row.endDate) },
      ]}
      fields={[
        { name: 'programId', label: 'Program', type: 'select', options: programs },
        { name: 'academicYearId', label: 'Academic year', type: 'select', options: years },
        { name: 'number', label: 'Semester number', type: 'number' },
        { name: 'startDate', label: 'Start date', type: 'date' },
        { name: 'endDate', label: 'End date', type: 'date' },
      ]}
      createSchema={semesterBody}
      emptyValues={{ programId, academicYearId: '', number: 1, startDate: '', endDate: '' }}
      toFormValues={(row) => ({
        programId: row.programId,
        academicYearId: row.academicYearId,
        number: row.number,
        startDate: toDateInput(row.startDate),
        endDate: toDateInput(row.endDate),
      })}
    />
  );
}

function Sections() {
  const semesters = useOptions<Semester>('/semesters', (s) => ({
    value: s.id,
    label: semesterLabel(s),
  }));

  return (
    <ResourceManager<Section>
      path="/sections"
      noun="section"
      icon={Rows3}
      rowKey={(row) => row.id}
      rowLabel={(row) => `Section ${row.name}`}
      columns={[
        { header: 'Section', cell: (row) => row.name },
        { header: 'Program', cell: (row) => row.semester.program.name },
        { header: 'Semester', cell: (row) => row.semester.number },
        { header: 'Academic year', cell: (row) => row.semester.academicYear.name },
      ]}
      fields={[
        { name: 'semesterId', label: 'Semester', type: 'select', options: semesters },
        { name: 'name', label: 'Section name', placeholder: 'A' },
      ]}
      createSchema={sectionBody}
      emptyValues={{ semesterId: '', name: '' }}
      toFormValues={(row) => ({ semesterId: row.semesterId, name: row.name })}
    />
  );
}

export function SemestersPage() {
  const [tab, setTab] = useState<Tab>('Sections');
  return (
    <>
      <PageHeader
        title="Semesters & Sections"
        description="Set up academic years, then the semesters and sections inside them."
      />
      <div role="tablist" aria-label="Academic calendar" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((name) => (
          <Button
            key={name}
            role="tab"
            aria-selected={tab === name}
            variant={tab === name ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(name)}
          >
            {name}
          </Button>
        ))}
      </div>
      {tab === 'Sections' && <Sections />}
      {tab === 'Semesters' && <Semesters />}
      {tab === 'Academic years' && <AcademicYears />}
    </>
  );
}
