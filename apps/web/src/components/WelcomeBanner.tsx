import { GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePageTitle } from '@/components/PageHeader';
import { DriftingBlobs } from '@/components/motion';

const NEPAL = 'Asia/Kathmandu';

function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: NEPAL }).format(
      now,
    ),
  );
  if (hour < 12) return 'Good morning';
  return hour < 17 ? 'Good afternoon' : 'Good evening';
}

const today = () =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: NEPAL,
  }).format(new Date());

/** The top of every dashboard. Its colours are dark enough for white text at any point. */
export function WelcomeBanner({
  firstName,
  description,
  actions,
}: {
  firstName: string;
  description?: string;
  actions?: ReactNode;
}) {
  usePageTitle('Dashboard');
  return (
    <div className="relative mb-6 animate-rise overflow-hidden rounded-[1.5rem] bg-gradient-brand p-6 text-primary-foreground shadow-lifted md:p-8">
      <DriftingBlobs className="opacity-60" />
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 hidden sm:block">
        <div className="size-56 animate-spin-slow rounded-full border-2 border-dashed border-white/25" />
      </div>
      <GraduationCap
        aria-hidden
        className="pointer-events-none absolute right-8 top-1/2 hidden size-24 -translate-y-1/2 text-white/15 sm:block"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium">{today()}</p>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">
            {greeting()}, {firstName}
          </h1>
          {description && <p className="mt-1 max-w-xl text-sm">{description}</p>}
        </div>
        {actions && <div className="relative flex flex-wrap gap-2 text-foreground">{actions}</div>}
      </div>
    </div>
  );
}
