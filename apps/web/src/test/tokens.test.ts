import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read directly from disk: Vitest empties CSS imports, even raw ones.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/** Reads a colour token such as --primary-strong out of index.css. */
function token(name: string): [number, number, number] {
  const match = new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+)`).exec(css);
  if (!match) throw new Error(`No token called ${name}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

const luminance = ([r, g, b]: [number, number, number]) => {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** The WCAG contrast ratio between two tokens. */
const contrast = (a: string, b: string) => {
  const [lighter, darker] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
};

describe('colour tokens', () => {
  it('keep the brand colours the project asked for', () => {
    expect(token('primary')).toEqual([5, 147, 198]);
    expect(token('accent')).toEqual([216, 57, 149]);
    expect(token('background')).toEqual([252, 255, 255]);
  });

  it.each([
    ['foreground', 'background', 'body text'],
    ['muted-foreground', 'background', 'secondary text'],
    ['muted-foreground', 'muted', 'text on muted tracks'],
    ['primary-dark', 'background', 'links'],
    ['primary-dark', 'primary-soft', 'active navigation and badges'],
    ['accent-dark', 'background', 'small pink text'],
    ['accent-dark', 'accent-soft', 'warning badges'],
    ['primary-foreground', 'primary-strong', 'primary buttons'],
    ['primary-foreground', 'accent-strong', 'accent buttons and absent marks'],
    ['primary-foreground', 'primary-dark', 'the start of the brand gradient'],
    ['primary-foreground', 'destructive', 'delete buttons'],
  ])('%s on %s is readable for %s', (text, surface) => {
    expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('use the same curve for animation everywhere', () => {
    expect(css).toContain('--ease-spring: cubic-bezier(0.22, 1, 0.36, 1)');
  });

  it('honour a request for less motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation-iteration-count: 1 !important');
  });
});
