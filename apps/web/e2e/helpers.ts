import { expect, type APIRequestContext, type Browser, type Download, type Locator, type Page, request } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { API_URL, PASSWORD } from './settings.js';

/** A fresh browser session, logged in through the real form, as someone would. */
export async function logIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
  return page;
}

/** Chooses from a list by part of its text, once that option has loaded. */
export async function choose(select: Locator, text: string | RegExp) {
  const option = select.locator('option', { hasText: text }).first();
  await expect(option).toBeAttached();
  const value = await option.getAttribute('value');
  await select.selectOption(value ?? '');
}

/** Chooses from a list by the id behind an option, once that option has loaded. */
export async function chooseValue(select: Locator, value: string) {
  await expect(select.locator(`option[value="${value}"]`)).toBeAttached();
  await select.selectOption(value);
}

export async function expectPdf(download: Download) {
  const path = await download.path();
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
}

/** For setting up data around the part being tested, as that person, through the real API. */
export class Api {
  private constructor(
    private readonly context: APIRequestContext,
    private readonly token: string,
  ) {}

  static async as(email: string) {
    const context = await request.newContext({ baseURL: `${API_URL}/api/v1/` });
    const response = await context.post('auth/login', { data: { email, password: PASSWORD } });
    expect(response.status(), `logging in as ${email}`).toBe(200);
    const { accessToken } = (await response.json()) as { accessToken: string };
    return new Api(context, accessToken);
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  async get<T>(path: string): Promise<T> {
    const response = await this.context.get(path, { headers: this.headers() });
    expect(response.ok(), `GET ${path}: ${await response.text()}`).toBe(true);
    return (await response.json()) as T;
  }

  async send<T>(method: 'post' | 'put', path: string, data: unknown): Promise<T> {
    const response = await this.context[method](path, { headers: this.headers(), data });
    expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
    return (await response.json()) as T;
  }
}
