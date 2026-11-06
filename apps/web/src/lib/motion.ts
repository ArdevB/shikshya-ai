import type { Transition, Variants } from 'motion/react';

/** The same curve as --ease-spring in index.css, so CSS and JS animation feel alike. */
export const EASE_SPRING = [0.22, 1, 0.36, 1] as const;

/** For things that slide between positions, such as the active navigation pill. */
export const SLIDE: Transition = { type: 'spring', stiffness: 460, damping: 36, mass: 0.8 };

/** How a page arrives. Short, because people navigate often and should never wait for it. */
export const PAGE_ENTER = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: EASE_SPRING },
} as const;

export const staggerParent = (stagger = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const riseChild: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_SPRING } },
};
