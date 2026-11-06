import { createRequire } from 'node:module';
import type { Browser } from 'puppeteer';
import { env } from '../config/env.js';

/** One browser, started on first use, because starting Chrome for every PDF is slow. */
let browser: Promise<Browser> | null = null;

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
  const current = browser;
  browser = null;
  await (await current)?.close();
}

export type PdfPageSize = { format: 'A4' } | { width: string; height: string };

export async function renderPdf(html: string, size: PdfPageSize = { format: 'A4' }) {
  const page = await (await getBrowser()).newPage();
  try {
    // Templates are static HTML. With scripts off, nothing in the data can ever run.
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'load' });
    const bytes = await page.pdf({ ...size, printBackground: true });
    return Buffer.from(bytes);
  } finally {
    await page.close();
  }
}
