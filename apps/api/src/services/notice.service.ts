import type { Prisma } from '@prisma/client';
import type {
  Audience,
  EventBody,
  EventView,
  NoticeBody,
  NoticeView,
  PaginationQuery,
} from '@shikshya/shared';
import { forbidden, notFound } from '../lib/errors.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';
import type { CurrentUser } from '../middleware/auth.js';
import { notifyNoticeAudience, notifySafely } from './notification.service.js';
import { isAdmin } from './scope.js';

/** The conditions under which a notice or event reaches this user. Empty means "everything". */
async function audienceConditions(user: CurrentUser) {
  if (isAdmin(user)) return null;

  const scoped = (audiences: Audience[], programIds: string[], sectionIds: string[]) => [
    { audience: { in: audiences } },
    { audience: 'PROGRAM' as const, programId: { in: programIds } },
    { audience: 'SECTION' as const, sectionId: { in: sectionIds } },
  ];

  const unique = (values: string[]) => [...new Set(values)];

  switch (user.role) {
    case 'STUDENT': {
      const student = await prisma.student.findUnique({
        where: { userId: user.id },
        select: {
          programId: true,
          enrollments: { where: { status: 'ACTIVE' }, select: { sectionId: true } },
        },
      });
      return scoped(
        ['ALL', 'STUDENTS'],
        student ? [student.programId] : [],
        student?.enrollments.map((e) => e.sectionId) ?? [],
      );
    }
    case 'PARENT': {
      const children = await prisma.parentStudent.findMany({
        where: { parent: { userId: user.id } },
        select: {
          student: {
            select: {
              programId: true,
              enrollments: { where: { status: 'ACTIVE' }, select: { sectionId: true } },
            },
          },
        },
      });
      return scoped(
        ['ALL', 'PARENTS'],
        unique(children.map((c) => c.student.programId)),
        unique(children.flatMap((c) => c.student.enrollments.map((e) => e.sectionId))),
      );
    }
    case 'TEACHER': {
      const offerings = await prisma.courseOffering.findMany({
        where: { teacher: { userId: user.id } },
        select: {
          sectionId: true,
          section: { select: { semester: { select: { programId: true } } } },
        },
      });
      return scoped(
        ['ALL', 'TEACHERS'],
        unique(offerings.map((o) => o.section.semester.programId)),
        unique(offerings.map((o) => o.sectionId)),
      );
    }
    default:
      return scoped(['ALL'], [], []);
  }
}

/** Teachers may only address sections they teach. Admins may address anyone. */
async function assertMayTarget(
  user: CurrentUser,
  target: { audience: Audience; sectionId?: string },
) {
  if (isAdmin(user)) return;
  if (user.role !== 'TEACHER' || target.audience !== 'SECTION' || !target.sectionId) {
    throw forbidden('Teachers can only send notices to sections they teach');
  }
  const teaches = await prisma.courseOffering.findFirst({
    where: { sectionId: target.sectionId, teacher: { userId: user.id } },
    select: { id: true },
  });
  if (!teaches) throw forbidden('Teachers can only send notices to sections they teach');
}

/** Drops targets that do not apply, so an "ALL" notice cannot carry a stray section. */
const targetFields = (body: { audience: Audience; programId?: string; sectionId?: string }) => ({
  audience: body.audience,
  programId: body.audience === 'PROGRAM' ? body.programId : null,
  sectionId: body.audience === 'SECTION' ? body.sectionId : null,
});

// ---------- Notices ----------

const noticeInclude = (userId: string) =>
  ({
    createdBy: { select: { firstName: true, lastName: true } },
    reads: { where: { userId }, select: { userId: true } },
  }) as const;

type NoticeRow = Prisma.NoticeGetPayload<{ include: ReturnType<typeof noticeInclude> }>;

const toNoticeView = (row: NoticeRow): NoticeView => ({
  id: row.id,
  title: row.title,
  body: row.body,
  audience: row.audience,
  programId: row.programId,
  sectionId: row.sectionId,
  isPinned: row.isPinned,
  publishAt: row.publishAt.toISOString(),
  expiresAt: row.expiresAt?.toISOString() ?? null,
  createdById: row.createdById,
  authorName: `${row.createdBy.firstName} ${row.createdBy.lastName}`,
  isRead: row.reads.length > 0,
});

async function visibleNoticeWhere(
  user: CurrentUser,
  now = new Date(),
): Promise<Prisma.NoticeWhereInput> {
  const conditions = await audienceConditions(user);
  // Admins also see scheduled and expired notices, to manage them. Teachers see their own too.
  if (!conditions) return {};
  return {
    OR: [
      {
        AND: [
          { OR: conditions },
          { publishAt: { lte: now } },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      { createdById: user.id },
    ],
  };
}

export async function listNotices(
  user: CurrentUser,
  query: PaginationQuery & { unreadOnly?: boolean },
) {
  const visible = await visibleNoticeWhere(user);
  const where: Prisma.NoticeWhereInput = query.unreadOnly
    ? { AND: [visible, { reads: { none: { userId: user.id } } }] }
    : visible;
  const [rows, total] = await Promise.all([
    prisma.notice.findMany({
      ...pageArgs(query),
      where,
      include: noticeInclude(user.id),
      orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
    }),
    prisma.notice.count({ where }),
  ]);
  return paginated(rows.map(toNoticeView), total, query);
}

export async function unreadNoticeCount(user: CurrentUser) {
  const visible = await visibleNoticeWhere(user);
  const count = await prisma.notice.count({
    where: { AND: [visible, { reads: { none: { userId: user.id } } }] },
  });
  return { count };
}

export async function getNotice(user: CurrentUser, id: string) {
  const visible = await visibleNoticeWhere(user);
  const row = await prisma.notice.findFirst({
    where: { AND: [visible, { id }] },
    include: noticeInclude(user.id),
  });
  // A notice this user cannot see looks the same as one that does not exist.
  if (!row) throw notFound('Notice');
  return toNoticeView(row);
}

export async function markNoticeRead(user: CurrentUser, id: string) {
  await getNotice(user, id);
  await prisma.noticeRead.upsert({
    where: { noticeId_userId: { noticeId: id, userId: user.id } },
    create: { noticeId: id, userId: user.id },
    update: {},
  });
}

export async function createNotice(user: CurrentUser, body: NoticeBody) {
  await assertMayTarget(user, body);
  const row = await prisma.notice.create({
    data: {
      title: body.title,
      body: body.body,
      ...targetFields(body),
      isPinned: body.isPinned,
      publishAt: body.publishAt ? new Date(body.publishAt) : new Date(),
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      createdById: user.id,
    },
    include: noticeInclude(user.id),
  });
  // A notice scheduled for later is announced by the scheduled job when its time comes.
  if (row.publishAt <= new Date()) await notifySafely(() => notifyNoticeAudience(row));
  return toNoticeView(row);
}

async function assertMayEditNotice(user: CurrentUser, id: string) {
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) throw notFound('Notice');
  if (!isAdmin(user) && notice.createdById !== user.id) throw forbidden();
}

export async function updateNotice(user: CurrentUser, id: string, body: NoticeBody) {
  await assertMayEditNotice(user, id);
  await assertMayTarget(user, body);
  const row = await prisma.notice.update({
    where: { id },
    data: {
      title: body.title,
      body: body.body,
      ...targetFields(body),
      isPinned: body.isPinned,
      publishAt: body.publishAt ? new Date(body.publishAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
    include: noticeInclude(user.id),
  });
  return toNoticeView(row);
}

export async function deleteNotice(user: CurrentUser, id: string) {
  await assertMayEditNotice(user, id);
  await prisma.notice.delete({ where: { id } });
}

// ---------- Events ----------

const toEventView = (row: Prisma.EventGetPayload<object>): EventView => ({
  id: row.id,
  title: row.title,
  description: row.description,
  startAt: row.startAt.toISOString(),
  endAt: row.endAt.toISOString(),
  location: row.location,
  audience: row.audience,
  programId: row.programId,
  sectionId: row.sectionId,
});

/** Events overlapping the given range, for the month calendar. */
export async function listEvents(user: CurrentUser, query: { from: string; to: string }) {
  const conditions = await audienceConditions(user);
  const rows = await prisma.event.findMany({
    where: {
      startAt: { lte: new Date(query.to) },
      endAt: { gte: new Date(query.from) },
      ...(conditions ? { OR: conditions } : {}),
    },
    orderBy: { startAt: 'asc' },
  });
  return rows.map(toEventView);
}

const eventData = (body: EventBody) => ({
  title: body.title,
  description: body.description ?? null,
  startAt: new Date(body.startAt),
  endAt: new Date(body.endAt),
  location: body.location ?? null,
  ...targetFields(body),
});

export async function createEvent(user: CurrentUser, body: EventBody) {
  return toEventView(
    await prisma.event.create({ data: { ...eventData(body), createdById: user.id } }),
  );
}

export async function updateEvent(id: string, body: EventBody) {
  return toEventView(await prisma.event.update({ where: { id }, data: eventData(body) }));
}

export const deleteEvent = (id: string) => prisma.event.delete({ where: { id } });
