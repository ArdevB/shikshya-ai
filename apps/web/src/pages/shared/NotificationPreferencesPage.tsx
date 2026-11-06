import {
  NOTIFICATION_LABELS,
  type NotificationChannel,
  type NotificationType,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ErrorState, LoadingRows } from '@/components/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';

interface Preference {
  type: NotificationType;
  email: boolean;
  inApp: boolean;
}

const KEY = ['notifications', 'preferences'];

export function NotificationPreferencesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<Preference[]>('/notifications/preferences'),
  });
  const save = useMutation({
    mutationFn: (body: {
      channel: NotificationChannel;
      type: NotificationType;
      enabled: boolean;
    }) => api.put<Preference[]>('/notifications/preferences', body),
    // Tick the box straight away, and put it back if the save fails.
    onMutate: async ({ channel, type, enabled }) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<Preference[]>(KEY);
      queryClient.setQueryData<Preference[]>(KEY, (current) =>
        current?.map((preference) =>
          preference.type === type
            ? { ...preference, [channel === 'EMAIL' ? 'email' : 'inApp']: enabled }
            : preference,
        ),
      );
      return { previous };
    },
    onError: (error, _body, context) => {
      queryClient.setQueryData(KEY, context?.previous);
      toast.error(error.message);
    },
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });

  return (
    <>
      <PageHeader title="Notification settings" description="Choose what reaches you, and how." />
      {query.isPending ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Card className="max-w-2xl">
          <CardContent className="pt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th scope="col" className="py-2 text-left font-semibold">
                    Notification
                  </th>
                  <th scope="col" className="w-16 py-2 text-center font-semibold">
                    Email
                  </th>
                  <th scope="col" className="w-16 py-2 text-center font-semibold">
                    In app
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((preference) => (
                  <tr key={preference.type} className="border-b last:border-0">
                    <td className="py-2 pr-2">{NOTIFICATION_LABELS[preference.type]}</td>
                    {(
                      [
                        ['EMAIL', preference.email, 'email'],
                        ['IN_APP', preference.inApp, 'in-app'],
                      ] as const
                    ).map(([channel, enabled, label]) => (
                      <td key={channel} className="text-center">
                        <label className="inline-flex size-11 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            className="size-5 accent-primary"
                            aria-label={`${label} for ${NOTIFICATION_LABELS[preference.type]}`}
                            checked={enabled}
                            onChange={(event) =>
                              save.mutate({
                                channel,
                                type: preference.type,
                                enabled: event.target.checked,
                              })
                            }
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
