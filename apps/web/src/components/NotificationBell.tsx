import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { NotificationView, Paginated } from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, getAccessToken, refreshSession } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

const LIST_KEY = ['notifications'];

/**
 * Listens for notifications pushed by the server for as long as the user is logged in.
 * Returns a number that goes up with each one, which sets the bell ringing.
 */
function useLiveNotifications() {
  const queryClient = useQueryClient();
  const [received, setReceived] = useState(0);
  useEffect(() => {
    const socket = io({
      // A function, so a reconnect uses the current token rather than an expired one.
      auth: (send) => send({ token: getAccessToken() }),
    });
    socket.on('notification', (notification: NotificationView) => {
      toast(notification.title, { description: notification.body });
      setReceived((count) => count + 1);
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      // A new notice also changes the unread count in the sidebar.
      void queryClient.invalidateQueries({ queryKey: ['notices'] });
    });
    // The server refuses an expired token, so get a new one and try again shortly.
    let retry: ReturnType<typeof setTimeout> | undefined;
    socket.on('connect_error', () => {
      retry = setTimeout(() => {
        refreshSession()
          .then(() => socket.connect())
          .catch(() => undefined);
      }, 5000);
    });
    return () => {
      clearTimeout(retry);
      socket.close();
    };
  }, [queryClient]);
  return received;
}

export function NotificationBell() {
  const received = useLiveNotifications();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const unread = useQuery({
    queryKey: [...LIST_KEY, 'unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
  });
  const list = useQuery({
    queryKey: [...LIST_KEY, 'latest'],
    queryFn: () => api.get<Paginated<NotificationView>>('/notifications?pageSize=8'),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: LIST_KEY });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: refresh,
  });
  const open = useMutation({
    mutationFn: (notification: NotificationView) =>
      api.post(`/notifications/${notification.id}/read`),
    onSuccess: refresh,
  });

  const count = unread.data?.count ?? 0;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        >
          {/* A new key restarts an animation: the bell rings for each arrival and the badge pops.
              Siblings must not share a key, or React leaves the old bell on screen, so these
              two numbers get different prefixes in case they are ever equal. */}
          <Bell
            key={`bell-${received}`}
            className={cn('origin-top [&]:size-5', received > 0 && 'animate-wiggle')}
          />
          {count > 0 && (
            <span
              key={`count-${count}`}
              className="absolute right-1 top-1 flex min-w-4 animate-pop items-center justify-center rounded-full bg-accent-strong px-1 text-[10px] font-bold leading-4 text-accent-foreground"
            >
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="menu-content w-[calc(100vw-2rem)] max-w-sm overflow-hidden"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-heading font-semibold">Notifications</p>
            {count > 0 && (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() => markAll.mutate()}
              >
                Mark all as read
              </Button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.data?.data.length ? (
              list.data.data.map((notification) => (
                <DropdownMenu.Item
                  key={notification.id}
                  className={cn(
                    'cursor-pointer border-b px-4 py-3 text-sm outline-none transition-colors last:border-0 data-[highlighted]:bg-primary-soft',
                    !notification.readAt && 'border-l-4 border-l-accent bg-accent-soft/30',
                  )}
                  onSelect={() => {
                    if (!notification.readAt) open.mutate(notification);
                    if (notification.link) navigate(notification.link);
                  }}
                >
                  <p className="font-medium">{notification.title}</p>
                  <p className="text-muted-foreground">{notification.body}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(notification.createdAt)}
                  </p>
                </DropdownMenu.Item>
              ))
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">
                You have no notifications.
              </p>
            )}
          </div>
          <div className="border-t px-4 py-2.5 text-right">
            <DropdownMenu.Item asChild className="outline-none">
              <Link
                to="/notifications/preferences"
                className="text-sm font-medium text-primary-dark hover:underline"
              >
                Notification settings
              </Link>
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
