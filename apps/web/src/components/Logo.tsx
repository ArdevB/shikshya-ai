import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M8 10.5c2.8-1.4 5.5-1.4 8 0v12c-2.5-1.4-5.2-1.4-8 0z" className="fill-background" />
      <path d="M24 10.5c-2.8-1.4-5.5-1.4-8 0v12c2.5-1.4 5.2-1.4 8 0z" className="fill-accent" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="font-heading text-xl font-bold">Shikshya</span>
    </span>
  );
}
