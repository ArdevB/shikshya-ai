import {
  noticeBody,
  type Audience,
  type NoticeView,
  type Paginated,
  MAX_PAGE_SIZE,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/auth/AuthContext';
import { ADMIN_ROLES } from '@/auth/roles';
import { Pagination } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { Markdown } from '@/components/Markdown';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog, ResourceForm, type FormFieldConfig } from '@/components/ResourceManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { sectionLabel, type CourseOffering, type Program, type Section } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';
import { cn, formatDateTime, toDateTimeInput } from '@/lib/utils';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL: 'Everyone',
  STUDENTS: 'Students',
  TEACHERS: 'Teachers',
  PARENTS: 'Parents',
  PROGRAM: 'A program',
  SECTION: 'A section',
};

/** Local datetime inputs are converted so the server always receives a full ISO time. */
const toIso = (value: unknown) =>
  typeof value === 'string' && value ? new Date(value).toISOString() : undefined;

export function NoticesPage() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const canAuthor = isAdmin || user.role === 'TEACHER';

  const [page, setPage] = useState(1);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<NoticeView | null>(null);
  const [deleting, setDeleting] = useState<NoticeView | null>(null);

  const query = useQuery({
    queryKey: ['notices', 'list', page],
    queryFn: () => api.get<Paginated<NoticeView>>(`/notices?page=${page}`),
  });

  // Only admins can target any program or section, so nobody else needs these lists.
  const programs = useOptions<Program>(
    '/programs',
    (p) => ({ value: p.id, label: p.name }),
    {},
    isAdmin,
  );
  const sections = useOptions<Section>(
    '/sections',
    (s) => ({ value: s.id, label: sectionLabel(s) }),
    {},
    isAdmin,
  );
  // Teachers may only address sections they teach.
  const ownOfferings = useQuery({
    queryKey: ['/course-offerings', 'mine', user.teacherId],
    enabled: user.role === 'TEACHER',
    queryFn: () =>
      api.get<Paginated<CourseOffering>>(
        `/course-offerings?teacherId=${user.teacherId}&pageSize=${MAX_PAGE_SIZE}`,
      ),
  });
  const ownSections = [
    ...new Map(ownOfferings.data?.data.map((o) => [o.section.id, o.section])).values(),
  ].map((s) => ({ value: s.id, label: sectionLabel(s) }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notices'] });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notices/${id}/read`),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/notices/${id}`),
    onSuccess: async () => {
      setDeleting(null);
      toast.success('Deleted');
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const fields: FormFieldConfig[] = [
    { name: 'title', label: 'Title' },
    { name: 'body', label: 'Message', type: 'textarea', hint: 'You can use markdown.' },
    ...(isAdmin
      ? ([
          {
            name: 'audience',
            label: 'Who should see this',
            type: 'select',
            options: Object.entries(AUDIENCE_LABEL).map(([value, label]) => ({ value, label })),
          },
          {
            name: 'programId',
            label: 'Program (if for a program)',
            type: 'select',
            options: programs,
          },
          {
            name: 'sectionId',
            label: 'Section (if for a section)',
            type: 'select',
            options: sections,
          },
          { name: 'isPinned', label: 'Pin to the top', type: 'checkbox' },
          { name: 'publishAt', label: 'Publish at (optional)', type: 'datetime-local' },
        ] satisfies FormFieldConfig[])
      : ([
          { name: 'sectionId', label: 'Section', type: 'select', options: ownSections },
        ] satisfies FormFieldConfig[])),
    { name: 'expiresAt', label: 'Expires at (optional)', type: 'datetime-local' },
  ];

  const toBody = (values: Record<string, unknown>) => ({
    ...values,
    publishAt: toIso(values.publishAt),
    expiresAt: toIso(values.expiresAt),
    // A teacher's form has no audience choice: it is always a section.
    audience: isAdmin ? values.audience : 'SECTION',
  });

  const emptyValues = {
    title: '',
    body: '',
    audience: isAdmin ? 'ALL' : 'SECTION',
    programId: '',
    sectionId: '',
    isPinned: false,
    publishAt: '',
    expiresAt: '',
  };

  return (
    <>
      <PageHeader
        title="Notices"
        actions={
          canAuthor && (
            <Button onClick={() => setComposing(true)}>
              <Plus /> New notice
            </Button>
          )
        }
      />

      {query.isPending ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState icon={Bell} title="No notices" description="New notices will appear here." />
      ) : (
        <div className="space-y-3">
          {query.data.data.map((notice) => (
            <Card key={notice.id} className={cn(!notice.isRead && 'border-l-4 border-l-accent')}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 font-semibold leading-snug">
                      {notice.isPinned && (
                        <Pin className="size-4 text-accent-dark" aria-label="Pinned" />
                      )}
                      {notice.title}
                      {!notice.isRead && <Badge variant="warning">New</Badge>}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {notice.authorName}, {formatDateTime(notice.publishAt)}
                      {canAuthor && `, to ${AUDIENCE_LABEL[notice.audience].toLowerCase()}`}
                    </p>
                  </div>
                  {(isAdmin || notice.createdById === user.id) && (
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${notice.title}`}
                        onClick={() => setEditing(notice)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${notice.title}`}
                        onClick={() => setDeleting(notice)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                <Markdown>{notice.body}</Markdown>
                {!notice.isRead && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(notice.id)}
                  >
                    Mark as read
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          <Pagination
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            total={query.data.meta.total}
            onPageChange={setPage}
          />
        </div>
      )}

      {composing && (
        <ResourceForm
          title="New notice"
          fields={fields}
          schema={noticeBody}
          preprocess={toBody}
          defaultValues={emptyValues}
          submitLabel="Publish"
          isEditing={false}
          onClose={() => setComposing(false)}
          onSubmit={async (values) => {
            await api.post('/notices', values);
            toast.success('Notice published');
            await invalidate();
          }}
        />
      )}
      {editing && (
        <ResourceForm
          title="Edit notice"
          fields={fields}
          schema={noticeBody}
          preprocess={toBody}
          defaultValues={{
            title: editing.title,
            body: editing.body,
            audience: editing.audience,
            programId: editing.programId ?? '',
            sectionId: editing.sectionId ?? '',
            isPinned: editing.isPinned,
            publishAt: toDateTimeInput(editing.publishAt),
            expiresAt: toDateTimeInput(editing.expiresAt),
          }}
          submitLabel="Save changes"
          isEditing
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await api.put(`/notices/${editing.id}`, values);
            toast.success('Saved');
            await invalidate();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.title}?`}
          description="It will disappear for everyone. This cannot be undone."
          confirmLabel="Delete"
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      )}
    </>
  );
}
