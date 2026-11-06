import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { applyOverdueAndFines } from '../services/finance.service.js';
import {
  notifyNoticeAudience,
  notifySafely,
  notifyStudentsAndParents,
} from '../services/notification.service.js';
import { reconcilePayments } from '../services/payment.service.js';

const TIME_ZONE = 'Asia/Kathmandu';

/** Reminds students who have not handed in, once, when an assignment is within 24 hours. */
export async function sendDueReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const assignments = await prisma.assignment.findMany({
    where: { dueAt: { gt: now, lte: soon }, dueReminderSentAt: null },
    include: {
      submissions: { select: { studentId: true } },
      courseOffering: {
        select: {
          course: { select: { code: true } },
          section: {
            select: { enrollments: { where: { status: 'ACTIVE' }, select: { studentId: true } } },
          },
        },
      },
    },
  });
  for (const assignment of assignments) {
    const submitted = new Set(assignment.submissions.map((s) => s.studentId));
    const waiting = assignment.courseOffering.section.enrollments
      .map((e) => e.studentId)
      .filter((id) => !submitted.has(id));
    await notifySafely(() =>
      notifyStudentsAndParents(waiting, 'ASSIGNMENT_DUE_SOON', {
        title: 'Assignment due soon',
        body: `${assignment.courseOffering.course.code}: "${assignment.title}" is due within 24 hours.`,
        path: 'assignments',
      }),
    );
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { dueReminderSentAt: now },
    });
  }
  return { reminded: assignments.length };
}

/** Sends the notification for notices scheduled for later, once their time arrives. */
export async function sendScheduledNotices(now = new Date()) {
  const due = await prisma.notice.findMany({
    where: {
      notifiedAt: null,
      publishAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  for (const notice of due) {
    await notifySafely(() => notifyNoticeAudience(notice));
  }
  return { sent: due.length };
}

function run(name: string, job: () => Promise<unknown>) {
  return () => {
    job().catch((error: unknown) => console.error(`Scheduled job "${name}" failed`, error));
  };
}

export function startScheduler() {
  cron.schedule('10 0 * * *', run('overdue invoices', applyOverdueAndFines), {
    timezone: TIME_ZONE,
  });
  cron.schedule('0 * * * *', run('due reminders', sendDueReminders), { timezone: TIME_ZONE });
  cron.schedule('*/15 * * * *', run('reconcile payments', reconcilePayments), {
    timezone: TIME_ZONE,
  });
  cron.schedule('*/5 * * * *', run('scheduled notices', sendScheduledNotices), {
    timezone: TIME_ZONE,
  });
}
