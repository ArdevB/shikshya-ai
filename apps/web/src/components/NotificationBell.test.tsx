import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './NotificationBell';

const mocks = vi.hoisted(() => ({
  unread: 0,
  listeners: {} as Record<string, (payload: unknown) => void>,
}));

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: (event: string, listener: (payload: unknown) => void) => {
      mocks.listeners[event] = listener;
    },
    connect: () => undefined,
    close: () => undefined,
  }),
}));

vi.mock('@/lib/api', () => ({
  getAccessToken: () => 'token',
  refreshSession: () => Promise.resolve(),
  api: {
    post: () => Promise.resolve(),
    get: (path: string) =>
      Promise.resolve(path.includes('unread-count') ? { count: mocks.unread } : { data: [] }),
  },
}));

function renderBell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** A notification arrives from the server, and the unread count goes up with it. */
async function arrives(unreadAfter: number) {
  mocks.unread = unreadAfter;
  await act(async () => {
    mocks.listeners.notification?.({ title: 'New notice', body: 'Library hours extended' });
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: new RegExp(`${unreadAfter} unread`) })).toBeVisible(),
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    mocks.unread = 0;
    mocks.listeners = {};
  });

  it('shows one bell however many notifications arrive', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = renderBell();
    await waitFor(() => expect(mocks.listeners.notification).toBeDefined());

    // Starting from nothing unread, the number received and the unread count match every time,
    // which is what used to leave an old bell behind.
    for (const unread of [1, 2, 3]) {
      await arrives(unread);
      expect(container.querySelectorAll('button svg')).toHaveLength(1);
    }

    const duplicateKeys = consoleError.mock.calls.filter((call) =>
      String(call[0]).includes('same key'),
    );
    expect(duplicateKeys).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('shows the unread count on the bell', async () => {
    mocks.unread = 12;
    renderBell();
    expect(await screen.findByText('9+')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications, 12 unread' })).toBeVisible();
  });
});
