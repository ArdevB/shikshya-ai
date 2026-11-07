import { expect, test } from '@playwright/test';
import { Api, choose, chooseValue, expectPdf, logIn } from './helpers.js';

/**
 * The main journeys through the app, in a real browser against the real API and a real database,
 * with the demo data. Only Gemini and Khalti are stand-ins: see apps/api/test/e2e-server.ts.
 */
interface Paged<T> {
  data: T[];
}
interface Offering {
  id: string;
  courseId: string;
  sectionId: string;
  teacherId: string;
  section: { semesterId: string };
  teacher: { user: { email: string } };
}

const ADMIN = 'admin@shikshya.test';
const TEACHER = 'teacher1@shikshya.test';

test('Visitor sees the public homepage and can go to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Log in' }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test('The security headers do not break any page', async ({ browser }) => {
  const visits: [string, string[]][] = [
    [ADMIN, ['/admin', '/admin/students', '/admin/timetable', '/admin/at-risk']],
    [TEACHER, ['/teacher', '/teacher/attendance', '/teacher/quizzes']],
    ['student01@shikshya.test', ['/student', '/student/fees', '/student/results', '/assistant']],
  ];
  for (const [email, paths] of visits) {
    const page = await logIn(browser, email);
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text())) problems.push(message.text());
    });
    for (const path of paths) {
      await page.goto(path);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
    }
    expect(problems, `on the pages for ${email}`).toEqual([]);
  }
});

test('Live notifications connect', async ({ browser }) => {
  const page = await logIn(browser, ADMIN);
  const connected = page.waitForResponse((response) => response.url().includes('/socket.io/'));
  await page.goto('/admin');
  expect((await connected).ok()).toBe(true);
});

test('Someone already logged in goes from the homepage to their dashboard', async ({ browser }) => {
  const page = await logIn(browser, ADMIN);
  await page.goto('/');
  await expect(page).toHaveURL(/\/admin/);
});

test('Admin sets up a course offering and assigns a teacher', async ({ browser }) => {
  const admin = await Api.as(ADMIN);
  const [existing] = (await admin.get<Paged<Offering>>('course-offerings?pageSize=1')).data;
  if (!existing) throw new Error('The demo data should have course offerings');
  const { programId } = await admin.get<{ programId: string }>(`courses/${existing.courseId}`);
  // A course nobody teaches yet, so the assignment cannot already exist.
  await admin.send('post', 'courses', {
    programId,
    code: 'CSC999',
    title: 'Browser Testing',
    creditHours: 3,
    semesterNumber: 6,
  });

  const page = await logIn(browser, ADMIN);
  await page.goto('/admin/offerings');
  await page.getByRole('button', { name: 'Add assignment' }).click();
  const dialog = page.getByRole('dialog');
  await choose(dialog.getByLabel('Course'), 'CSC999');
  await chooseValue(dialog.getByLabel('Section'), existing.sectionId);
  await chooseValue(dialog.getByLabel('Teacher'), existing.teacherId);
  await dialog.locator('button[type="submit"]').click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: /CSC999 Browser Testing/ })).toBeVisible();

  // The teacher really does have the class now.
  const teacher = await admin.get<{ user: { email: string } }>(`teachers/${existing.teacherId}`);
  const teacherPage = await logIn(browser, teacher.user.email);
  await teacherPage.goto('/teacher/classes');
  await expect(teacherPage.getByText('CSC999').first()).toBeVisible();
});

test('Teacher takes attendance and enters marks', async ({ browser }) => {
  const page = await logIn(browser, TEACHER);

  await page.goto('/teacher/attendance');
  // A date with no session in the seed data, so this saves a new one.
  await page.getByLabel('Date').fill('2026-01-05');
  const classes = page.getByLabel('Class');
  await expect(classes.locator('option').nth(1)).toBeAttached();
  await classes.selectOption({ index: 1 });
  const firstRow = page.getByRole('radiogroup').first();
  await expect(firstRow).toBeVisible();
  await firstRow.getByRole('radio', { name: /absent/i }).click();
  await expect(firstRow.getByRole('radio', { name: /absent/i })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Attendance saved')).toBeVisible();

  // It is still there when the page comes back.
  await page.reload();
  await expect(
    page
      .getByRole('radiogroup')
      .first()
      .getByRole('radio', { name: /absent/i }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible();

  await page.goto('/teacher/marks');
  const papers = page.getByLabel('Paper');
  const openPaper = papers.locator('option:not(:has-text("published"))').nth(1);
  await expect(openPaper).toBeAttached();
  await papers.selectOption((await openPaper.getAttribute('value')) ?? '');
  const firstMark = page
    .getByRole('textbox', { name: /^Marks for/ })
    .or(page.getByRole('spinbutton', { name: /^Marks for/ }))
    .first();
  await firstMark.fill('18');
  await firstMark.blur();
  await expect(page.getByLabel('Saved').first()).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByRole('textbox', { name: /^Marks for/ })
      .or(page.getByRole('spinbutton', { name: /^Marks for/ }))
      .first(),
  ).toHaveValue('18');
});

test('Admin publishes results and a student views the marksheet PDF', async ({ browser }) => {
  const admin = await Api.as(ADMIN);
  const teacher = await Api.as(TEACHER);

  // A small exam with all its marks in, because publishing is refused while any are missing.
  const subjects =
    await teacher.get<{ courseOffering: { id: string; section: { semesterId?: string } } }[]>(
      'exam-subjects/mine',
    );
  const offeringId = subjects[0]?.courseOffering.id ?? '';
  const offering = await admin.get<Offering>(`course-offerings/${offeringId}`);
  const exam = await admin.send<{ id: string }>('post', 'exams', {
    semesterId: offering.section.semesterId,
    name: 'Browser Test Exam',
    type: 'FINAL',
    startDate: '2026-03-01',
    endDate: '2026-03-02',
  });
  const subject = await admin.send<{ id: string }>('post', `exams/${exam.id}/subjects`, {
    courseOfferingId: offeringId,
    fullMarks: 100,
    passMarks: 40,
  });
  const sheet = await teacher.get<{ rows: { studentId: string }[] }>(
    `exam-subjects/${subject.id}/marks`,
  );
  for (const row of sheet.rows) {
    await teacher.send('put', `exam-subjects/${subject.id}/marks/${row.studentId}`, {
      marksObtained: 75,
      isAbsent: false,
    });
  }

  const page = await logIn(browser, ADMIN);
  await page.goto(`/admin/exams/${exam.id}`);
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published. Results are now visible.')).toBeVisible();

  const student = await admin.get<{ user: { email: string } }>(
    `students/${sheet.rows[0]?.studentId}`,
  );
  const studentPage = await logIn(browser, student.user.email);
  await studentPage.goto('/student/results');
  const downloading = studentPage.waitForEvent('download');
  await studentPage.getByRole('button', { name: 'Marksheet' }).first().click();
  await expectPdf(await downloading);
});

test('Student pays an invoice through the gateway and gets a receipt', async ({ browser }) => {
  const page = await logIn(browser, 'student02@shikshya.test');
  await page.goto('/student/fees');

  await page.getByRole('button', { name: 'Pay now' }).first().click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Pay with Khalti/ })
    .click();

  // Off to the gateway and back again, then the payment is confirmed with the gateway directly.
  await page.waitForURL(/\/payments\/result\?paymentId=/);
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download receipt' }).click();
  await expectPdf(await downloading);
});

test('Student asks the assistant about attendance and sees their own figures', async ({
  browser,
}) => {
  const email = 'student03@shikshya.test';
  const page = await logIn(browser, email);
  await page.goto('/assistant');
  await page.locator('#assistant-message').fill('What is my attendance like?');
  await page.getByRole('button', { name: 'Send' }).click();

  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(conversation.getByText(/Your attendance is/)).toBeVisible();
  await expect(conversation.getByText('Checked attendance')).toBeVisible();

  // The figures in the reply are that student's, as the normal attendance page has them.
  const student = await Api.as(email);
  const me = await student.get<{ studentId: string }>('auth/me');
  const summary = await student.get<{ courses: { courseCode: string; percentage: number }[] }>(
    `students/${me.studentId}/attendance-summary`,
  );
  const first = summary.courses[0];
  await expect(
    conversation.getByText(new RegExp(`${first?.courseCode}: ${first?.percentage}%`)),
  ).toBeVisible();
});
