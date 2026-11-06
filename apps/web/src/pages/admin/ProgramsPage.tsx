import { programBody } from '@shikshya/shared';
import { School } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ResourceManager } from '@/components/ResourceManager';
import type { Department, Program } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';

export function ProgramsPage() {
  const departments = useOptions<Department>('/departments', (d) => ({
    value: d.id,
    label: d.name,
  }));

  return (
    <>
      <PageHeader title="Programs" description="The degrees offered by each department." />
      <ResourceManager<Program>
        path="/programs"
        noun="program"
        icon={School}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
        columns={[
          { header: 'Code', cell: (row) => row.code },
          { header: 'Name', cell: (row) => row.name },
          { header: 'Department', cell: (row) => row.department.name },
          { header: 'Semesters', cell: (row) => row.durationSemesters },
        ]}
        fields={[
          { name: 'departmentId', label: 'Department', type: 'select', options: departments },
          { name: 'name', label: 'Name', placeholder: 'BSc. CSIT' },
          { name: 'code', label: 'Code', placeholder: 'CSIT' },
          { name: 'durationSemesters', label: 'Number of semesters', type: 'number' },
        ]}
        createSchema={programBody}
        emptyValues={{ departmentId: '', name: '', code: '', durationSemesters: 8 }}
        toFormValues={(row) => ({
          departmentId: row.departmentId,
          name: row.name,
          code: row.code,
          durationSemesters: row.durationSemesters,
        })}
      />
    </>
  );
}
