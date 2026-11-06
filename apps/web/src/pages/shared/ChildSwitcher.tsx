import { useQuery } from '@tanstack/react-query';
import { UsersRound } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { OwnChild } from '@/lib/types';

interface ActiveChild {
  selectedId: string | null;
  select: (id: string) => void;
}

const ActiveChildContext = createContext<ActiveChild | null>(null);

/** Remembers the chosen child while a parent moves between pages. */
export function ActiveChildProvider({ children }: { children: ReactNode }) {
  const [selectedId, select] = useState<string | null>(null);
  const { user } = useAuth();
  useEffect(() => select(null), [user?.id]);
  return (
    <ActiveChildContext.Provider value={{ selectedId, select }}>
      {children}
    </ActiveChildContext.Provider>
  );
}

export function useActiveChild() {
  const context = useContext(ActiveChildContext);
  if (!context) throw new Error('useActiveChild must be used inside ActiveChildProvider');

  const query = useQuery({
    queryKey: ['my-children'],
    queryFn: () => api.get<OwnChild[]>('/parents/me/children'),
  });
  const list = query.data ?? [];
  const activeId = context.selectedId ?? list[0]?.student.id ?? null;

  return {
    activeId,
    active: list.find((child) => child.student.id === activeId),
    status: query,
    children: list.length > 1 && (
      <div role="tablist" aria-label="Choose a child" className="mb-4 flex flex-wrap gap-2">
        {list.map(({ student }) => (
          <Button
            key={student.id}
            role="tab"
            aria-selected={student.id === activeId}
            variant={student.id === activeId ? 'default' : 'outline'}
            onClick={() => context.select(student.id)}
          >
            {student.user.firstName}
          </Button>
        ))}
      </div>
    ),
  };
}

/** The switcher itself, plus the loading, error and "no children" states every page needs. */
export function ChildSwitcher({
  status,
  children,
}: {
  status: ReturnType<typeof useActiveChild>['status'];
  children: ReactNode;
}) {
  if (status.isPending) return <LoadingRows rows={4} />;
  if (status.isError) {
    return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  }
  if (status.data.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title="No children linked yet"
        description="Please ask your college to link your child to this account."
      />
    );
  }
  return <>{children}</>;
}
