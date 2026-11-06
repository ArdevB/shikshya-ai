import { motion } from 'motion/react';
import { useId, useRef, type KeyboardEvent } from 'react';
import { SLIDE } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A row of tabs with a highlight that slides to the chosen one. Follows the ARIA tabs pattern:
 * one tab stop, then the arrow keys, Home and End move between tabs.
 */
export function SegmentedTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  stretch = false,
  className,
}: {
  label: string;
  tabs: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Share the full width equally, for phones. */
  stretch?: boolean;
  className?: string;
}) {
  const highlightId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const tab = tabs[next];
    if (tab) onChange(tab.value);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1',
        stretch && 'flex w-full',
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              'relative min-h-9 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors duration-200',
              stretch && 'flex-1 px-1',
              selected ? 'text-primary-dark' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {selected && (
              <motion.span
                layoutId={highlightId}
                transition={SLIDE}
                className="absolute inset-0 rounded-lg bg-card shadow-sm"
              />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
