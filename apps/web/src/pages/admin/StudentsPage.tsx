import {
  STUDENT_CSV_COLUMNS,
  studentCreateBody,
  studentUpdateBody,
  type CsvRowError,
  type StudentImportResult,
} from '@shikshya/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Download, GraduationCap, Upload } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { CredentialsDialog, type Credential } from '@/components/CredentialsDialog';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { ResourceManager } from '@/components/ResourceManager';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { personName, sectionLabel, type Program, type Section, type Student } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';
import { toDateInput } from '@/lib/utils';
import { readImageFile } from './InstitutionSettingsPage';

const SAMPLE_ROW = [
  'student@example.com',
  'Sita',
  'Sharma',
  '9800000000',
  'CSIT-078-41',
  '',
  'CSIT',
  '6',
  'A',
  '2023-11-15',
  '2002-04-20',
  'Kathmandu',
  'Hari Sharma',
  '9800000001',
];

function downloadTemplate() {
  const content = `${STUDENT_CSV_COLUMNS.join(',')}\n${SAMPLE_ROW.join(',')}\n`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'students-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (credentials: Credential[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [rowErrors, setRowErrors] = useState<CsvRowError[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('file', file as File);
      return api.post<StudentImportResult>('/students/import', form);
    },
    onSuccess: (result) => {
      toast.success(`Imported ${result.created} students`);
      onImported(result.credentials);
    },
    onError: (error) => {
      if (error instanceof ApiError && Array.isArray(error.details)) {
        setRowErrors(error.details as CsvRowError[]);
        setFileError(error.message);
      } else {
        setRowErrors([]);
        setFileError(error.message);
      }
    },
  });

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setRowErrors([]);
    setFileError(null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Import students from CSV</DialogTitle>
          <DialogDescription>
            Every row is checked first. If any row has a problem, nothing is imported, so you can
            fix the file and try again.
          </DialogDescription>
        </div>
        <Button variant="link" className="justify-start px-0" onClick={downloadTemplate}>
          <Download /> Download the template
        </Button>
        <FormField label="CSV file">
          <Input type="file" accept=".csv,text/csv" className="pt-2" onChange={chooseFile} />
        </FormField>

        {fileError && (
          <div role="alert" className="space-y-2">
            <p className="text-sm font-medium text-destructive">{fileError}</p>
            {rowErrors.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-primary-soft">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        Row
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Column
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Problem
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowErrors.map((error, index) => (
                      <tr key={index} className="border-t align-top">
                        <td className="px-3 py-2">{error.row}</td>
                        <td className="px-3 py-2">{error.field}</td>
                        <td className="px-3 py-2">{error.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!file || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StudentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [programId, setProgramId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [importing, setImporting] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);

  const programs = useOptions<Program>('/programs', (p) => ({ value: p.id, label: p.name }));
  const sections = useOptions<Section>('/sections', (s) => ({
    value: s.id,
    label: sectionLabel(s),
  }));

  return (
    <>
      <PageHeader title="Students" description="Student records, enrollment and CSV import." />
      <ResourceManager<Student>
        path="/students"
        noun="student"
        icon={GraduationCap}
        filters={{ search, programId, sectionId }}
        toolbar={
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Search">
              <Input
                type="search"
                placeholder="Name, email or roll no."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </FormField>
            <FormField label="Program">
              <Select value={programId} onChange={(event) => setProgramId(event.target.value)}>
                <option value="">All programs</option>
                {programs.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Section">
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
        headerActions={
          <Button variant="outline" onClick={() => setImporting(true)}>
            <Upload /> Import CSV
          </Button>
        }
        rowKey={(row) => row.id}
        rowLabel={(row) => personName(row.user)}
        rowActions={(row) => (
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label={`Set a photo for ${personName(row.user)}`}
          >
            <label className="cursor-pointer">
              <Camera />
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  readImageFile(file)
                    .then((photoDataUrl) => api.put(`/students/${row.id}/photo`, { photoDataUrl }))
                    .then(() => toast.success('Photo saved. It appears on the ID card.'))
                    .catch((error: Error) => toast.error(error.message));
                }}
              />
            </label>
          </Button>
        )}
        columns={[
          { header: 'Roll no.', cell: (row) => row.rollNumber },
          { header: 'Name', cell: (row) => personName(row.user) },
          { header: 'Email', cell: (row) => row.user.email },
          { header: 'Program', cell: (row) => row.program.code },
          {
            header: 'Section',
            cell: (row) => `Sem ${row.currentSection.semester.number} ${row.currentSection.name}`,
          },
        ]}
        fields={[
          { name: 'firstName', label: 'First name' },
          { name: 'lastName', label: 'Last name' },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'phone', label: 'Phone (optional)', type: 'tel' },
          { name: 'rollNumber', label: 'Roll number' },
          { name: 'registrationNumber', label: 'Registration number (optional)' },
          { name: 'programId', label: 'Program', type: 'select', options: programs },
          { name: 'currentSectionId', label: 'Section', type: 'select', options: sections },
          { name: 'admissionDate', label: 'Admission date', type: 'date' },
          { name: 'dateOfBirth', label: 'Date of birth (optional)', type: 'date' },
          { name: 'address', label: 'Address (optional)' },
          { name: 'guardianName', label: 'Guardian name (optional)' },
          { name: 'guardianPhone', label: 'Guardian phone (optional)', type: 'tel' },
        ]}
        createSchema={studentCreateBody}
        updateSchema={studentUpdateBody}
        emptyValues={{
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          rollNumber: '',
          registrationNumber: '',
          programId: '',
          currentSectionId: '',
          admissionDate: '',
          dateOfBirth: '',
          address: '',
          guardianName: '',
          guardianPhone: '',
        }}
        toFormValues={(row) => ({
          firstName: row.user.firstName,
          lastName: row.user.lastName,
          email: row.user.email,
          phone: row.user.phone ?? '',
          rollNumber: row.rollNumber,
          registrationNumber: row.registrationNumber ?? '',
          programId: row.programId,
          currentSectionId: row.currentSectionId,
          admissionDate: toDateInput(row.admissionDate),
          dateOfBirth: toDateInput(row.dateOfBirth),
          address: row.address ?? '',
          guardianName: row.guardianName ?? '',
          guardianPhone: row.guardianPhone ?? '',
        })}
        onCreated={(result) => {
          const { student, temporaryPassword } = result as {
            student: Student;
            temporaryPassword: string;
          };
          setCredentials([{ email: student.user.email, temporaryPassword }]);
        }}
      />
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={(created) => {
            setImporting(false);
            setCredentials(created);
            void queryClient.invalidateQueries({ queryKey: ['/students'] });
          }}
        />
      )}
      {credentials.length > 0 && (
        <CredentialsDialog credentials={credentials} onClose={() => setCredentials([])} />
      )}
    </>
  );
}
