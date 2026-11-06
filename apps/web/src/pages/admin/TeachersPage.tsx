import { teacherCreateBody, teacherUpdateBody } from '@shikshya/shared';
import { UserCog } from 'lucide-react';
import { useState } from 'react';
import { CredentialsDialog, type Credential } from '@/components/CredentialsDialog';
import { PageHeader } from '@/components/PageHeader';
import { ResourceManager } from '@/components/ResourceManager';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/FormField';
import { Badge } from '@/components/ui/badge';
import { personName, type Department, type Teacher } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';

export function TeachersPage() {
  const [search, setSearch] = useState('');
  const [credential, setCredential] = useState<Credential | null>(null);
  const departments = useOptions<Department>('/departments', (d) => ({
    value: d.id,
    label: d.name,
  }));

  return (
    <>
      <PageHeader title="Teachers" description="Staff accounts and their departments." />
      <ResourceManager<Teacher>
        path="/teachers"
        noun="teacher"
        icon={UserCog}
        filters={{ search }}
        toolbar={
          <div className="sm:max-w-xs">
            <FormField label="Search">
              <Input
                type="search"
                placeholder="Name, email or code"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </FormField>
          </div>
        }
        rowKey={(row) => row.id}
        rowLabel={(row) => personName(row.user)}
        columns={[
          { header: 'Code', cell: (row) => row.employeeCode },
          { header: 'Name', cell: (row) => personName(row.user) },
          { header: 'Email', cell: (row) => row.user.email },
          { header: 'Department', cell: (row) => row.department.name },
          { header: 'Designation', cell: (row) => row.designation },
          {
            header: 'Status',
            cell: (row) =>
              row.user.isActive ? <Badge>Active</Badge> : <Badge variant="muted">Inactive</Badge>,
          },
        ]}
        fields={[
          { name: 'firstName', label: 'First name' },
          { name: 'lastName', label: 'Last name' },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'phone', label: 'Phone (optional)', type: 'tel' },
          { name: 'employeeCode', label: 'Employee code', placeholder: 'T-001' },
          { name: 'departmentId', label: 'Department', type: 'select', options: departments },
          { name: 'designation', label: 'Designation', placeholder: 'Lecturer' },
        ]}
        createSchema={teacherCreateBody}
        updateSchema={teacherUpdateBody}
        emptyValues={{
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          employeeCode: '',
          departmentId: '',
          designation: '',
        }}
        toFormValues={(row) => ({
          firstName: row.user.firstName,
          lastName: row.user.lastName,
          email: row.user.email,
          phone: row.user.phone ?? '',
          employeeCode: row.employeeCode,
          departmentId: row.departmentId,
          designation: row.designation,
        })}
        onCreated={(result) => {
          const { teacher, temporaryPassword } = result as {
            teacher: Teacher;
            temporaryPassword: string;
          };
          setCredential({ email: teacher.user.email, temporaryPassword });
        }}
      />
      {credential && (
        <CredentialsDialog credentials={[credential]} onClose={() => setCredential(null)} />
      )}
    </>
  );
}
