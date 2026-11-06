import { departmentBody } from '@shikshya/shared';
import { Building2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ResourceManager } from '@/components/ResourceManager';
import type { Department } from '@/lib/types';

export function DepartmentsPage() {
  return (
    <>
      <PageHeader title="Departments" description="The academic departments of your institution." />
      <ResourceManager<Department>
        path="/departments"
        noun="department"
        icon={Building2}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
        columns={[
          { header: 'Code', cell: (row) => row.code },
          { header: 'Name', cell: (row) => row.name },
        ]}
        fields={[
          { name: 'name', label: 'Name', placeholder: 'Computer Science' },
          { name: 'code', label: 'Code', placeholder: 'CS' },
        ]}
        createSchema={departmentBody}
        emptyValues={{ name: '', code: '' }}
        toFormValues={(row) => ({ name: row.name, code: row.code })}
      />
    </>
  );
}
