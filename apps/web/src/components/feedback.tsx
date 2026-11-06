import { AlertCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <div className="relative">
        <span
          aria-hidden
          className="absolute inset-0 animate-pulse-ring rounded-2xl bg-primary/40"
        />
        <LogoMark className="relative size-12" />
      </div>
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-14" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

/** What a page shows while its code arrives. Shaped like a page, so little shifts afterwards. */
export function PageSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2">
        <div className="skeleton h-8 w-56" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="skeleton h-28" />
        <div className="skeleton h-28" style={{ animationDelay: '80ms' }} />
        <div className="skeleton h-28" style={{ animationDelay: '160ms' }} />
      </div>
      <div className="skeleton h-64" style={{ animationDelay: '240ms' }} />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex animate-rise flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 px-6 py-14 text-center">
      <div className="mb-2 flex size-16 animate-float items-center justify-center rounded-2xl bg-gradient-soft">
        <Icon className="size-8 text-primary-dark" aria-hidden />
      </div>
      <p className="font-heading font-semibold">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div
      role="alert"
      className="flex animate-shake flex-col items-center gap-2 rounded-2xl border border-destructive/40 bg-card px-6 py-10 text-center"
    >
      <AlertCircle className="size-7 text-destructive" aria-hidden />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
