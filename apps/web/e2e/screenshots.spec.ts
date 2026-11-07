import { expect, type Page, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Api, choose, logIn } from './helpers.js';

/**
 * Takes the pictures in the README and user manual. Only runs when asked: `pnpm docs:screenshots`.
 * The at-risk and timetable pages need the real AI service: see docs/deployment.md.
 */
const folder = fileURLToPath(new URL('../../../docs/screenshots/', import.meta.url));

const shot = async (page: Page, name: string, options: { fullPage?: boolean } = {}) => {
  // Lets entrance animations finish, and the live clock in charts settle.
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(folder, `${name}.png`), ...options });
};

const visit = async (page: Page, path: string, name: string) => {
  await page.goto(path);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForLoadState('networkidle');
  await shot(page, name);
};

test.describe('screenshots', () => {
  test.skip(!process.env.SCREENSHOTS, 'Only when taking pictures for the documentation');
  test.setTimeout(180_000);

  test.beforeAll(() => {
    mkdirSync(folder, { recursive: true });
  });

  test('public pages', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await shot(page, 'home');
    await shot(page, 'home-full', { fullPage: true });
    await page.goto('/login');
    await page.getByLabel('Email').waitFor();
    await shot(page, 'login');
  });

  test('admin', async ({ browser }) => {
    const admin = await Api.as('admin@shikshya.test');
    await admin.send('post', 'risk/recompute', {});

    const page = await logIn(browser, 'admin@shikshya.test');
    await visit(page, '/admin', 'admin-dashboard');
    await visit(page, '/admin/students', 'admin-students');
    await visit(page, '/admin/offerings', 'admin-offerings');
    await visit(page, '/admin/exams', 'admin-exams');
    await visit(page, '/admin/policies', 'admin-rules');
    await visit(page, '/admin/at-risk', 'admin-at-risk');

    await page.goto('/admin/timetable-generator');
    const semester = page.getByRole('combobox').first();
    await choose(semester, /Semester 6|Sem 6/);
    await page.getByRole('button', { name: 'Generate' }).click();
    // This figure only appears once there is a timetable to show.
    const placed = page.getByText('Classes placed', { exact: true });
    await expect(placed).toBeVisible({ timeout: 60_000 });
    await placed.scrollIntoViewIfNeeded();
    await shot(page, 'admin-timetable-generator');
  });

  test('teacher', async ({ browser }) => {
    const page = await logIn(browser, 'teacher1@shikshya.test');
    await visit(page, '/teacher', 'teacher-dashboard');
    await visit(page, '/teacher/at-risk', 'teacher-at-risk');
    await visit(page, '/teacher/quizzes', 'teacher-quizzes');

    await page.goto('/teacher/marks');
    const papers = page.getByLabel('Paper');
    const openPaper = papers.locator('option:not(:has-text("published"))').nth(1);
    await expect(openPaper).toBeAttached();
    await papers.selectOption((await openPaper.getAttribute('value')) ?? '');
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await page.waitForLoadState('networkidle');
    await shot(page, 'teacher-marks');

    await page.goto('/teacher/attendance');
    const classes = page.getByLabel('Class');
    await expect(classes.locator('option').nth(1)).toBeAttached();
    await classes.selectOption({ index: 1 });
    await page.getByRole('radiogroup').first().waitFor();
    await page.waitForLoadState('networkidle');
    await shot(page, 'teacher-attendance');
    await page.close();

    // Attendance is mostly taken on a phone, so the manual shows that too.
    const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const phone = await context.newPage();
    await phone.goto('/login');
    await phone.getByLabel('Email').fill('teacher1@shikshya.test');
    await phone.getByLabel('Password', { exact: true }).fill('Shikshya@123');
    await phone.getByRole('button', { name: 'Log in' }).click();
    await phone.waitForURL((url) => !url.pathname.endsWith('/login'));
    await phone.goto('/teacher/attendance');
    const phoneClasses = phone.getByLabel('Class');
    await expect(phoneClasses.locator('option').nth(1)).toBeAttached();
    await phoneClasses.selectOption({ index: 1 });
    await phone.getByRole('radiogroup').first().waitFor();
    await shot(phone, 'teacher-attendance-phone');
    await context.close();
  });

  test('student', async ({ browser }) => {
    const page = await logIn(browser, 'student01@shikshya.test');
    await visit(page, '/student', 'student-dashboard');
    await visit(page, '/student/timetable', 'student-timetable');
    await visit(page, '/student/attendance', 'student-attendance');
    await visit(page, '/student/results', 'student-results');
    await visit(page, '/student/fees', 'student-fees');
    await visit(page, '/student/quizzes', 'student-quizzes');

    await page.goto('/assistant');
    await page.locator('#assistant-message').fill('What is my attendance like?');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByText(/Your attendance is/).waitFor();
    await shot(page, 'student-assistant');
  });

  test('parent', async ({ browser }) => {
    const page = await logIn(browser, 'parent1@shikshya.test');
    await visit(page, '/parent', 'parent-dashboard');
    await visit(page, '/parent/fees', 'parent-fees');
  });

  test('accountant', async ({ browser }) => {
    const page = await logIn(browser, 'accountant@shikshya.test');
    await visit(page, '/finance', 'finance-dashboard');
    await visit(page, '/finance/invoices', 'finance-invoices');
    await visit(page, '/finance/setup', 'finance-setup');
  });
});
