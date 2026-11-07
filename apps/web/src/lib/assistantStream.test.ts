import { describe, expect, it } from 'vitest';
import { parseEvents } from './assistantStream';

const event = (text: string) => `data: ${JSON.stringify({ type: 'text', text })}\n\n`;

describe('parseEvents', () => {
  it('reads complete events', () => {
    const { events, rest } = parseEvents(event('Hello') + event(' there'));
    expect(events).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' there' },
    ]);
    expect(rest).toBe('');
  });

  it('keeps a half-arrived event for next time', () => {
    const whole = event('Hello');
    const first = parseEvents(whole.slice(0, 12));
    expect(first.events).toEqual([]);
    expect(first.rest).toBe(whole.slice(0, 12));

    const second = parseEvents(first.rest + whole.slice(12));
    expect(second.events).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(second.rest).toBe('');
  });

  it('copes with text that itself contains blank lines', () => {
    const { events } = parseEvents(event('One\n\nTwo'));
    expect(events).toEqual([{ type: 'text', text: 'One\n\nTwo' }]);
  });

  it('ignores anything that is not an event', () => {
    expect(parseEvents(': keep-alive\n\n').events).toEqual([]);
  });
});
