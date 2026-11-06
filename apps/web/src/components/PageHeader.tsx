import { useEffect, type ReactNode } from 'react';

/** Keeps the browser tab's title in step with the page, for tabs, history and screen readers. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Shikshya`;
  }, [title]);
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  usePageTitle(title);
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
