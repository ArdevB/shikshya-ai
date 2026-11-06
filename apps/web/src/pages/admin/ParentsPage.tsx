import { zodResolver } from '@hookform/resolvers/zod';
import {
  parentCreateBody,
  parentLinkBody,
  parentUpdateBody,
  type ParentLinkBody,
} from '@shikshya/shared';
import type { Paginated } from '@shikshya/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Unlink, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CredentialsDialog, type Credential } from '@/components/CredentialsDialog';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { ResourceManager } from '@/components/ResourceManager';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { api, queryString } from '@/lib/api';
import { personName, type Parent, type Student } from '@/lib/types';

function LinkChildrenDialog({ parent, onClose }: { parent: Parent; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ParentLinkBody>({
    resolver: zodResolver(parentLinkBody),
    defaultValues: { studentId: '', relation: '' },
  });

  // The list can be long, so the admin narrows it down by searching first.
  const students = useQuery({
    queryKey: ['/students', 'search', search],
    queryFn: () => api.get<Paginated<Student>>(`/students${queryString({ search, pageSize: 50 })}`),
  });

  const current = useQuery({
    queryKey: ['/parents', 'detail', parent.id],
    queryFn: () => api.get<Parent>(`/parents/${parent.id}`),
    initialData: parent,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/parents'] });

  const link = handleSubmit(async (values) => {
    try {
      await api.post(`/parents/${parent.id}/students`, values);
      toast.success('Linked');
      reset();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not link');
    }
  });

  const unlink = async (studentId: string) => {
    try {
      await api.delete(`/parents/${parent.id}/students/${studentId}`);
      toast.success('Unlinked');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not unlink');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Children of {personName(parent.user)}</DialogTitle>
          <DialogDescription>A parent can only see the children linked here.</DialogDescription>
        </div>

        {current.data.children.length === 0 ? (
          <p className="text-sm text-muted-foreground">No children linked yet.</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {current.data.children.map(({ student, relation }) => (
              <li key={student.id} className="flex items-center justify-between gap-2 p-3">
                <span>
                  {personName(student.user)}
                  <span className="block text-muted-foreground">
                    {student.rollNumber}, {relation}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Unlink ${personName(student.user)}`}
                  onClick={() => void unlink(student.id)}
                >
                  <Unlink />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={(event) => void link(event)} className="space-y-3 border-t pt-4" noValidate>
          <FormField label="Find a student">
            <Input
              type="search"
              placeholder="Name or roll number"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Student" error={errors.studentId?.message}>
            <Select {...register('studentId')}>
              <option value="">Choose…</option>
              {students.data?.data.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.rollNumber} {personName(student.user)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Relation" error={errors.relation?.message}>
            <Input placeholder="Mother" {...register('relation')} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Link child
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ParentsPage() {
  const [search, setSearch] = useState('');
  const [credential, setCredential] = useState<Credential | null>(null);
  const [linking, setLinking] = useState<Parent | null>(null);

  return (
    <>
      <PageHeader title="Parents" description="Parent accounts and the children they can see." />
      <ResourceManager<Parent>
        path="/parents"
        noun="parent"
        icon={UsersRound}
        filters={{ search }}
        toolbar={
          <div className="sm:max-w-xs">
            <FormField label="Search">
              <Input
                type="search"
                placeholder="Name or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </FormField>
          </div>
        }
        rowKey={(row) => row.id}
        rowLabel={(row) => personName(row.user)}
        columns={[
          { header: 'Name', cell: (row) => personName(row.user) },
          { header: 'Email', cell: (row) => row.user.email },
          {
            header: 'Children',
            cell: (row) =>
              row.children.length === 0
                ? 'None'
                : row.children.map((c) => personName(c.student.user)).join(', '),
          },
        ]}
        rowActions={(row) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Manage children of ${personName(row.user)}`}
            onClick={() => setLinking(row)}
          >
            <Link2 />
          </Button>
        )}
        fields={[
          { name: 'firstName', label: 'First name' },
          { name: 'lastName', label: 'Last name' },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'phone', label: 'Phone (optional)', type: 'tel' },
        ]}
        createSchema={parentCreateBody}
        updateSchema={parentUpdateBody}
        emptyValues={{ firstName: '', lastName: '', email: '', phone: '' }}
        toFormValues={(row) => ({
          firstName: row.user.firstName,
          lastName: row.user.lastName,
          email: row.user.email,
          phone: row.user.phone ?? '',
        })}
        onCreated={(result) => {
          const { parent, temporaryPassword } = result as {
            parent: Parent;
            temporaryPassword: string;
          };
          setCredential({ email: parent.user.email, temporaryPassword });
        }}
      />
      {linking && <LinkChildrenDialog parent={linking} onClose={() => setLinking(null)} />}
      {credential && (
        <CredentialsDialog credentials={[credential]} onClose={() => setCredential(null)} />
      )}
    </>
  );
}
