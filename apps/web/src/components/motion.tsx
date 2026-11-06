import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EASE_SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * A number that counts up to its value. Screen readers get the final value straight away,
 * rather than hearing every step.
 */
export function AnimatedNumber({
  value,
  format = (n) => String(Math.round(n)),
  className,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(reduceMotion ? value : 0);
  const previous = useRef(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setShown(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.9,
      ease: EASE_SPRING,
      onUpdate: setShown,
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduceMotion]);

  return (
    <span className={className}>
      <span aria-hidden className="tabular-nums">
        {format(shown)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/**
 * Counts up text like "3.62" or "80%", keeping its decimals and suffix.
 * Anything that is not a plain number is shown as it is.
 */
export function AnimatedValue({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) {
  const match = /^(\d+(?:\.(\d+))?)(%?)$/.exec(String(value));
  if (!match) return <span className={className}>{value}</span>;
  const decimals = match[2]?.length ?? 0;
  return (
    <AnimatedNumber
      className={className}
      value={Number(match[1])}
      format={(n) => `${n.toFixed(decimals)}${match[3]}`}
    />
  );
}

/** A ring that fills to a percentage, with an optional mark at a required level. */
export function ProgressRing({
  percent,
  label,
  tone = 'primary',
  markAt,
  size = 76,
  children,
}: {
  percent: number | null;
  label: string;
  tone?: 'primary' | 'accent';
  markAt?: number;
  size?: number;
  children?: ReactNode;
}) {
  const stroke = 7;
  const radius = 32 - stroke / 2;
  const fraction = Math.min(100, Math.max(0, percent ?? 0)) / 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" className="-rotate-90" aria-hidden width={size} height={size}>
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <motion.circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={tone === 'accent' ? 'stroke-accent' : 'stroke-primary'}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: fraction }}
          transition={{ duration: 1, ease: EASE_SPRING, delay: 0.1 }}
        />
        {markAt !== undefined && (
          <line
            x1="32"
            y1={32 - radius - stroke / 2 - 1}
            x2="32"
            y2={32 - radius + stroke / 2 + 1}
            strokeWidth={2}
            className="stroke-foreground/60"
            transform={`rotate(${(markAt / 100) * 360} 32 32)`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/**
 * A slim bar along the top of the page while something is loading or saving. It waits a moment
 * before appearing, so quick requests do not make it flicker. Background refreshes of data
 * already on screen do not count.
 */
export function TopProgressBar() {
  const fetching = useIsFetching({ predicate: (query) => query.state.data === undefined });
  const saving = useIsMutating();
  const busy = fetching + saving > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 140);
    return () => clearTimeout(timer);
  }, [busy]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          aria-hidden
          className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-brand"
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{ scaleX: 0.85, transition: { duration: 1.6, ease: EASE_SPRING } }}
          exit={{ scaleX: 1, opacity: 0, transition: { duration: 0.28 } }}
        />
      )}
    </AnimatePresence>
  );
}

/** Soft colour moving slowly behind content. Purely decorative. */
export function DriftingBlobs({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <div className="absolute -right-20 -top-24 size-80 animate-drift rounded-full bg-accent/40 blur-3xl" />
      <div
        className="absolute -bottom-28 left-1/4 size-72 animate-drift rounded-full bg-primary/40 blur-3xl"
        style={{ animationDelay: '-6s' }}
      />
    </div>
  );
}
