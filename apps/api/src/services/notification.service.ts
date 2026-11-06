import type { Role } from '@prisma/client';
import {
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationType,
  type PaginationQuery,
} from '@shikshya/shared';
import { notificationEmailHtml, sendEmail } from '../lib/mail.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';
import { emitToUser } from '../lib/realtime.js';

export interface NotificationPayload {
  title: string;
  body: string;
  link?: string;
}

/**
 * Writes in-app notifications, pushes them to anyone connected, and emails those who have
 * not opted out. A missing preference row means enabled.
 */
export async function notify(
  userIds: string[],
  type: NotificationType,
  payload: NotificationPayload,
) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

  const optedOut = await prisma.notificationPreference.findMany({
    where: { userId: { in: unique }, type, enabled: false },
    select: { userId: true, channel: true },
  });
  const isOptedOut = (userId: string, channel: NotificationChannel) =>
    optedOut.some((p) => p.userId === userId && p.channel === channel);

  const inApp = unique.filter((id) => !isOptedOut(id, 'IN_APP'));
  if (inApp.length > 0) {
    const created = await prisma.notification.createManyAndReturn({
      data: inApp.map((userId) => ({
        userId,
        type,
        title: payload.title,
        body: payload.body,
        link: payload.link,
      })),
    });
    for (const notification of created) {
      emitToUser(notification.userId, 'notification', toView(notification));
    }
  }

  const emailTo = unique.filter((id) => !isOptedOut(id, 'EMAIL'));
  if (emailTo.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: emailTo }, isActive: true },
      select: { email: true },
    });
    const html = notificationEmailHtml(payload);
    // Not awaited: a slow mail server must not hold up the request that triggered this.
    void Promise.allSettled(
      users.map((user) => sendEmail({ to: user.email, subject: payload.title, html })),
    );
  }
}

/** Notifications are extras. If one fails, the payment or result behind it still stands. */
export async function notifySafely(run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    console.error('Could not send a notification', error);
  }
}

/** Each student, and the parents linked to them, with the right link for each. */
export async function notifyStudentsAndParents(
  studentIds: string[],
  type: NotificationType,
  payload: { title: string; body: string; path?: string },
) {
  const unique = [...new Set(studentIds)];
  if (unique.length === 0) return;
  const students = await prisma.student.findMany({
    where: { id: { in: unique } },
    select: {
      userId: true,
      parents: { select: { parent: { select: { userId: true } } } },
    },
  });
  const link = (base: string) => (payload.path ? `/${base}/${payload.path}` : `/${base}`);
  await notify(
    students.map((s) => s.userId),
    type,
    { title: payload.title, body: payload.body, link: link('student') },
  );
  await notify(
    students.flatMap((s) => s.parents.map((p) => p.parent.userId)),
    type,
    { title: payload.title, body: payload.body, link: link('parent') },
  );
}

const NOTICE_PATH: Partial<Record<Role, string>> = {
  SUPER_ADMIN: '/admin/notices',
  ADMIN: '/admin/notices',
  TEACHER: '/teacher/notices',
  STUDENT: '/student/notices',
  PARENT: '/parent/notices',
  ACCOUNTANT: '/finance/notices',
};

/** Works out who a notice reaches, the same way the notice list does, then tells them. */
export async function notifyNoticeAudience(notice: {
  id: string;
  title: string;
  audience: string;
  programId: string | null;
  sectionId: string | null;
  createdById: string;
}) {
  const where = (() => {
    switch (notice.audience) {
      case 'STUDENTS':
        return { role: 'STUDENT' as const };
      case 'TEACHERS':
        return { role: 'TEACHER' as const };
      case 'PARENTS':
        return { role: 'PARENT' as const };
      case 'PROGRAM': {
        const programId = notice.programId as string;
        return {
          OR: [
            { student: { programId } },
            { parent: { children: { some: { student: { programId } } } } },
            {
              teacher: {
                offerings: { some: { section: { semester: { programId } } } },
              },
            },
          ],
        };
      }
      case 'SECTION': {
        const sectionId = notice.sectionId as string;
        const enrolled = { enrollments: { some: { sectionId, status: 'ACTIVE' as const } } };
        return {
          OR: [
            { student: enrolled },
            { parent: { children: { some: { student: enrolled } } } },
            { teacher: { offerings: { some: { sectionId } } } },
          ],
        };
      }
      default:
        return {};
    }
  })();

  const users = await prisma.user.findMany({
    where: { ...where, isActive: true, id: { not: notice.createdById } },
    select: { id: true, role: true },
  });
  const byPath = new Map<string | undefined, string[]>();
  for (const user of users) {
    const path = NOTICE_PATH[user.role];
    byPath.set(path, [...(byPath.get(path) ?? []), user.id]);
  }
  for (const [link, ids] of byPath) {
    await notify(ids, 'NOTICE_PUBLISHED', {
      title: 'New notice',
      body: notice.title,
      link,
    });
  }
  await prisma.notice.update({ where: { id: notice.id }, data: { notifiedAt: new Date() } });
}

// ---------- The bell and the preferences page ----------

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

const toView = (row: NotificationRow) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  link: row.link,
  readAt: row.readAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export async function listNotifications(userId: string, query: PaginationQuery) {
  const where = { userId };
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      ...pageArgs(query),
      where,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
  ]);
  return paginated(rows.map(toView), total, query);
}

export async function unreadCount(userId: string) {
  return { count: await prisma.notification.count({ where: { userId, readAt: null } }) };
}

/** The userId in the filter means nobody can mark someone else's as read. */
export async function markRead(userId: string, id: string) {
  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getPreferences(userId: string) {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const enabled = (channel: NotificationChannel, type: string) =>
    rows.find((r) => r.channel === channel && r.type === type)?.enabled ?? true;
  return NOTIFICATION_TYPES.map((type) => ({
    type,
    email: enabled('EMAIL', type),
    inApp: enabled('IN_APP', type),
  }));
}

export async function setPreference(
  userId: string,
  body: { channel: NotificationChannel; type: NotificationType; enabled: boolean },
) {
  await prisma.notificationPreference.upsert({
    where: { userId_channel_type: { userId, channel: body.channel, type: body.type } },
    create: { userId, ...body },
    update: { enabled: body.enabled },
  });
  return getPreferences(userId);
}
