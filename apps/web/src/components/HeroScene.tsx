import {
  BellRing,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { ProgressRing } from '@/components/motion';
import { EASE_SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** A small icon travelling around an orbit, kept upright by turning against its parent. */
function Orbiter({
  icon: Icon,
  angle,
  radius,
  reverse = false,
}: {
  icon: LucideIcon;
  angle: number;
  radius: string;
  reverse?: boolean;
}) {
  return (
    <div
      className="absolute left-1/2 top-1/2 size-0"
      style={{ transform: `rotate(${angle}deg) translateY(calc(-1 * ${radius}))` }}
    >
      <div style={{ transform: `rotate(${-angle}deg)` }}>
        <div className={reverse ? 'animate-spin-slow' : 'animate-spin-reverse'}>
          <div className="flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-white text-primary-dark shadow-lifted">
            <Icon className="size-5" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A small piece of the product, floating gently. It arrives after a delay, then keeps moving. */
function FloatingCard({
  className,
  delay,
  floatDelay,
  children,
}: {
  className: string;
  delay: number;
  floatDelay: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={cn('absolute', className)}
      initial={{ opacity: 0, scale: 0.7, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: EASE_SPRING }}
    >
      <div
        className="animate-float rounded-2xl bg-white p-3 text-foreground shadow-lifted"
        style={{ animationDelay: floatDelay }}
      >
        {children}
      </div>
    </motion.div>
  );
}

const BARS = [38, 62, 48, 78, 92];

/**
 * The login page's motion graphic: what Shikshya does, shown rather than described. Everything
 * in it is decorative, with made-up figures, so it is hidden from screen readers. It is
 * transforms and opacity only, which browsers can animate without repainting.
 */
export function HeroScene() {
  return (
    <div aria-hidden className="relative mx-auto h-72 w-full max-w-lg select-none xl:h-80">
      <div className="absolute inset-0 m-auto size-[17rem]">
        {/* The two orbits turn in opposite directions. */}
        <div className="absolute inset-0 animate-spin-slow rounded-full border-2 border-dashed border-white/30">
          <Orbiter icon={GraduationCap} angle={20} radius="8.5rem" />
          <Orbiter icon={Wallet} angle={150} radius="8.5rem" />
          <Orbiter icon={BellRing} angle={265} radius="8.5rem" />
        </div>
        <div className="absolute inset-10 animate-spin-reverse rounded-full border-2 border-white/20">
          <Orbiter icon={CalendarCheck} angle={70} radius="6rem" reverse />
          <Orbiter icon={ClipboardCheck} angle={230} radius="6rem" reverse />
        </div>

        <motion.div
          className="absolute inset-0 m-auto flex size-20 items-center justify-center"
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.1 }}
        >
          <span className="absolute inset-0 animate-pulse-ring rounded-3xl bg-white/40" />
          <span className="relative flex size-20 items-center justify-center rounded-3xl bg-white shadow-lifted">
            <BookOpen className="size-10 text-accent" />
          </span>
        </motion.div>
      </div>

      <FloatingCard className="left-0 top-2" delay={0.5} floatDelay="0s">
        <div className="flex items-center gap-2.5">
          <ProgressRing percent={92} label="Attendance" size={44}>
            <span className="text-[10px] font-bold">92%</span>
          </ProgressRing>
          <div>
            <p className="text-xs font-semibold">Attendance</p>
            <p className="text-[11px] text-muted-foreground">This week</p>
          </div>
        </div>
      </FloatingCard>

      <FloatingCard className="right-0 top-6" delay={0.75} floatDelay="-1.6s">
        <p className="text-xs font-semibold">GPA by semester</p>
        <div className="mt-2 flex h-10 items-end gap-1">
          {BARS.map((height, index) => (
            <motion.div
              key={height}
              className="w-3 origin-bottom rounded-t bg-primary"
              style={{ height: `${height}%` }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.6, delay: 1 + index * 0.08, ease: EASE_SPRING }}
            />
          ))}
        </div>
      </FloatingCard>

      <FloatingCard className="bottom-4 left-2" delay={1} floatDelay="-3s">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
          <div>
            <p className="text-xs font-semibold">Fees paid</p>
            <p className="text-[11px] text-muted-foreground">Receipt ready</p>
          </div>
        </div>
      </FloatingCard>

      <FloatingCard className="bottom-0 right-3" delay={1.25} floatDelay="-4.2s">
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft">
            <BellRing className="size-4 text-accent-dark" />
          </span>
          <div>
            <p className="text-xs font-semibold">Results published</p>
            <p className="text-[11px] text-muted-foreground">Just now</p>
          </div>
        </div>
      </FloatingCard>
    </div>
  );
}
