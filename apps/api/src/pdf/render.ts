import { createRequire } from 'node:module';
import type { Browser } from 'puppeteer';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * One browser, started on first use, because starting Chrome for every PDF is slow. It closes after
 * a minute with nothing to do, because it holds hundreds of MB and small hosting plans have 512.
 */
export const PDF_BROWSER_IDLE_MS = 60_000;

let browser: Promise<Browser> | null = null;
let rendering = 0;
let idleTimer: NodeJS.Timeout | undefined;

function loadPuppeteer() {
  // Loaded on first use, because it is heavy, and with require rather than import: under
  // `tsx watch` on Windows, importing Puppeteer's ES module build freezes the whole process.
  const require = createRequire(import.meta.url);
  return (require('puppeteer') as typeof import('puppeteer')).default;
}

function getBrowser() {
  browser ??= loadPuppeteer().launch({
    // Containers usually need PUPPETEER_ARGS=--no-sandbox.
    args: env.PUPPETEER_ARGS ? env.PUPPETEER_ARGS.split(' ') : [],
  });
  return browser;
}

export async function closePdfBrowser() {
  clearTimeout(idleTimer);
  const current = browser;
  browser = null;
  await (await current)?.close();
}

export type PdfPageSize = { format: 'A4' } | { width: string; height: string };

function closeWhenIdle() {
  clearTimeout(idleTimer);
  if (rendering > 0) return;
  idleTimer = setTimeout(() => {
    closePdfBrowser().catch((error: unknown) => {
      logger.warn({ err: error }, 'Could not close the PDF browser');
    });
  }, PDF_BROWSER_IDLE_MS);
  // Waiting to close Chrome should not keep the process alive.
  idleTimer.unref();
}

export async function renderPdf(html: string, size: PdfPageSize = { format: 'A4' }) {
  clearTimeout(idleTimer);
  rendering += 1;
  const page = await (await getBrowser()).newPage();
  try {
    // Templates are static HTML. With scripts off, nothing in the data can ever run.
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'load' });
    const bytes = await page.pdf({ ...size, printBackground: true });
    return Buffer.from(bytes);
  } finally {
    await page.close();
    rendering -= 1;
    closeWhenIdle();
  }
}
