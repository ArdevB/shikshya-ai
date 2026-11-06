import animate from 'tailwindcss-animate';
import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        heading: ['"Space Grotesk Variable"', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        card: { DEFAULT: token('card'), foreground: token('foreground') },
        popover: { DEFAULT: token('card'), foreground: token('foreground') },
        primary: {
          DEFAULT: token('primary'),
          foreground: token('primary-foreground'),
          dark: token('primary-dark'),
          soft: token('primary-soft'),
        },
        accent: {
          DEFAULT: token('accent'),
          foreground: token('accent-foreground'),
          dark: token('accent-dark'),
          soft: token('accent-soft'),
        },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('primary-foreground') },
        border: token('border'),
        input: token('border'),
        ring: token('primary'),
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
