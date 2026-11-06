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
          strong: token('primary-strong'),
          dark: token('primary-dark'),
          soft: token('primary-soft'),
        },
        accent: {
          DEFAULT: token('accent'),
          foreground: token('accent-foreground'),
          strong: token('accent-strong'),
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
        '2xl': 'calc(var(--radius) + 0.25rem)',
        xl: 'var(--radius)',
        lg: 'calc(var(--radius) - 0.125rem)',
        md: 'calc(var(--radius) - 0.25rem)',
        sm: 'calc(var(--radius) - 0.375rem)',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(11 43 58 / 0.04), 0 10px 28px -16px rgb(11 43 58 / 0.14)',
        lifted: '0 2px 4px rgb(11 43 58 / 0.05), 0 18px 38px -18px rgb(11 43 58 / 0.24)',
        'glow-primary': '0 8px 20px -10px rgb(var(--primary) / 0.75)',
        'glow-accent': '0 8px 20px -10px rgb(var(--accent) / 0.75)',
      },
      backgroundImage: {
        'gradient-brand':
          'linear-gradient(120deg, rgb(var(--primary-dark)), rgb(var(--primary-strong)) 45%, rgb(var(--accent-strong)))',
        'gradient-soft':
          'linear-gradient(135deg, rgb(var(--primary-soft)), rgb(var(--accent-soft)))',
      },
      transitionTimingFunction: {
        spring: 'var(--ease-spring)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'none' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '70%': { opacity: '1', transform: 'scale(1.12)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(36px, -28px) scale(1.08)' },
          '66%': { transform: 'translate(-24px, 22px) scale(0.95)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '20%': { transform: 'rotate(14deg)' },
          '40%': { transform: 'rotate(-12deg)' },
          '60%': { transform: 'rotate(8deg)' },
          '80%': { transform: 'rotate(-5deg)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        'spin-reverse': { to: { transform: 'rotate(-360deg)' } },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '100%': { transform: 'scale(1.7)', opacity: '0' },
        },
      },
      animation: {
        rise: 'rise 0.5s var(--ease-spring) backwards',
        pop: 'pop 0.35s var(--ease-spring) backwards',
        float: 'float 5s ease-in-out infinite',
        drift: 'drift 16s ease-in-out infinite',
        wiggle: 'wiggle 0.7s ease-in-out',
        shake: 'shake 0.45s ease-in-out',
        shimmer: 'shimmer 1.6s linear infinite',
        'spin-slow': 'spin-slow 28s linear infinite',
        'spin-reverse': 'spin-reverse 28s linear infinite',
        'pulse-ring': 'pulse-ring 1.8s var(--ease-spring) infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
