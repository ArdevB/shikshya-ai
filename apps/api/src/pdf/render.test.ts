import { afterAll, describe, expect, it, vi } from 'vitest';
import { closePdfBrowser, PDF_BROWSER_IDLE_MS, renderPdf } from './render.js';

afterAll(() => closePdfBrowser());

describe('the PDF browser', () => {
  it('closes itself when idle, and starts again for the next PDF', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');

    const first = await renderPdf('<p>First</p>');
    expect(first.subarray(0, 5).toString()).toBe('%PDF-');

    const closing = timers.mock.calls.find(([, delay]) => delay === PDF_BROWSER_IDLE_MS)?.[0];
    expect(closing).toBeTypeOf('function');
    timers.mockRestore();
    (closing as () => void)();

    const second = await renderPdf('<p>Second</p>');
    expect(second.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
