import {
  assignmentBody,
  assignmentListQuery,
  eventBody,
  eventListQuery,
  examBody,
  examListQuery,
  examSubjectBody,
  gradeBody,
  markBody,
  materialBody,
  materialListQuery,
  noticeBody,
  noticeListQuery,
  paginationQuery,
  roomBody,
  submissionBody,
  timeSlotBody,
  timeSlotListQuery,
  timetableEntryBody,
  timetableQuery,
} from '@shikshya/shared';
import { Router, type Request } from 'express';
import { saveAll, storage, uploadFiles } from '../lib/storage.js';
import { ADMIN_ROLES, currentUser, requireRole } from '../middleware/auth.js';
import { param, parseBody, parseQuery } from '../middleware/validate.js';
import * as assignments from '../services/assignment.service.js';
import * as dashboard from '../services/dashboard.service.js';
import * as exams from '../services/exam.service.js';
import { getSectionResults, getStudentResults } from '../services/grading.js';
import * as notices from '../services/notice.service.js';
import { assertCanAccessStudent, isAdmin } from '../services/scope.js';
import * as timetable from '../services/timetable.service.js';
import { forbidden } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { crudRouter } from './academic.routes.js';

const uploaded = (req: Request) => req.files as Express.Multer.File[] | undefined;

export function timetableRoutes() {
  const router = Router();
  const adminOnly = requireRole(...ADMIN_ROLES);

  router.get('/', async (req, res) => {
    res.json(await timetable.getTimetable(parseQuery(req, timetableQuery)));
  });
  router.post('/entries', adminOnly, async (req, res) => {
    res.status(201).json(await timetable.createEntry(parseBody(req, timetableEntryBody)));
  });
  router.delete('/entries/:id', adminOnly, async (req, res) => {
    await timetable.deleteEntry(param(req, 'id'));
    res.status(204).end();
  });
  return router;
}

export const roomRoutes = () => crudRouter(timetable.rooms, paginationQuery, roomBody);
export const timeSlotRoutes = () =>
  crudRouter(timetable.timeSlots, timeSlotListQuery, timeSlotBody);

export function examRoutes() {
  const router = Router();
  const adminOnly = requireRole(...ADMIN_ROLES);
  const staff = requireRole('TEACHER', ...ADMIN_ROLES);

  router.get('/', staff, async (req, res) => {
    res.json(await exams.listExams(currentUser(req), parseQuery(req, examListQuery)));
  });
  router.get('/:id', staff, async (req, res) => {
    res.json(await exams.getExam(param(req, 'id')));
  });
  router.post('/', adminOnly, async (req, res) => {
    res.status(201).json(await exams.createExam(parseBody(req, examBody)));
  });
  router.put('/:id', adminOnly, async (req, res) => {
    res.json(await exams.updateExam(param(req, 'id'), parseBody(req, examBody)));
  });
  router.delete('/:id', adminOnly, async (req, res) => {
    await exams.deleteExam(param(req, 'id'));
    res.status(204).end();
  });
  router.get('/:id/subjects', adminOnly, async (req, res) => {
    res.json(await exams.listSubjects(param(req, 'id')));
  });
  router.post('/:id/subjects', adminOnly, async (req, res) => {
    res.status(201).json(await exams.addSubject(param(req, 'id'), parseBody(req, examSubjectBody)));
  });
  router.post('/:id/publish', adminOnly, async (req, res) => {
    res.json(await exams.publishExam(currentUser(req), param(req, 'id')));
  });
  router.post('/:id/unlock', adminOnly, async (req, res) => {
    res.json(await exams.unlockExam(currentUser(req), param(req, 'id')));
  });
  return router;
}

export function examSubjectRoutes() {
  const router = Router();
  const adminOnly = requireRole(...ADMIN_ROLES);
  const staff = requireRole('TEACHER', ...ADMIN_ROLES);

  router.get('/mine', requireRole('TEACHER'), async (req, res) => {
    res.json(await exams.listSubjectsForTeacher(currentUser(req)));
  });
  router.put('/:id', adminOnly, async (req, res) => {
    res.json(await exams.updateSubject(param(req, 'id'), parseBody(req, examSubjectBody)));
  });
  router.delete('/:id', adminOnly, async (req, res) => {
    await exams.removeSubject(param(req, 'id'));
    res.status(204).end();
  });
  router.get('/:id/marks', staff, async (req, res) => {
    res.json(await exams.getMarkSheet(currentUser(req), param(req, 'id')));
  });
  router.put('/:id/marks/:studentId', requireRole('TEACHER'), async (req, res) => {
    res.json(
      await exams.saveMark(
        currentUser(req),
        param(req, 'id'),
        param(req, 'studentId'),
        parseBody(req, markBody),
      ),
    );
  });
  return router;
}

/** Everything under /students/:id that a student, their parent or their teacher may read. */
export function studentAcademicRoutes() {
  const router = Router();
  const family = requireRole('STUDENT', 'PARENT', 'TEACHER', ...ADMIN_ROLES);

  router.get('/:id/results', family, async (req, res) => {
    await assertCanAccessStudent(currentUser(req), param(req, 'id'));
    res.json(await getStudentResults(param(req, 'id')));
  });
  router.get('/:id/timetable', family, async (req, res) => {
    await assertCanAccessStudent(currentUser(req), param(req, 'id'));
    res.json(await timetable.getStudentTimetable(param(req, 'id')));
  });
  router.get('/:id/assignments', family, async (req, res) => {
    res.json(await assignments.listStudentAssignments(currentUser(req), param(req, 'id')));
  });
  router.get('/:id/materials', family, async (req, res) => {
    res.json(await assignments.listStudentMaterials(currentUser(req), param(req, 'id')));
  });
  return router;
}

export function sectionResultRoutes() {
  const router = Router();
  router.get('/:id/results', requireRole('TEACHER', ...ADMIN_ROLES), async (req, res) => {
    const user = currentUser(req);
    const sectionId = param(req, 'id');
    if (!isAdmin(user)) {
      const teaches = await prisma.courseOffering.findFirst({
        where: { sectionId, teacher: { userId: user.id } },
        select: { id: true },
      });
      if (!teaches) throw forbidden();
    }
    res.json(await getSectionResults(sectionId));
  });
  return router;
}

export function assignmentRoutes() {
  const router = Router();
  const teacher = requireRole('TEACHER');
  const staff = requireRole('TEACHER', ...ADMIN_ROLES);

  router.get('/', staff, async (req, res) => {
    res.json(
      await assignments.listTeacherAssignments(
        currentUser(req),
        parseQuery(req, assignmentListQuery),
      ),
    );
  });
  router.post('/', teacher, uploadFiles, async (req, res) => {
    const body = parseBody(req, assignmentBody);
    const created = await assignments.createAssignment(
      currentUser(req),
      body,
      await saveAll(uploaded(req)),
    );
    res.status(201).json(created);
  });
  router.put('/:id', teacher, uploadFiles, async (req, res) => {
    const body = parseBody(req, assignmentBody);
    res.json(
      await assignments.updateAssignment(
        currentUser(req),
        param(req, 'id'),
        body,
        await saveAll(uploaded(req)),
      ),
    );
  });
  router.delete('/:id', teacher, async (req, res) => {
    await assignments.deleteAssignment(currentUser(req), param(req, 'id'));
    res.status(204).end();
  });
  router.get('/:id/submissions', staff, async (req, res) => {
    res.json(await assignments.listSubmissions(currentUser(req), param(req, 'id')));
  });
  router.post('/:id/submission', requireRole('STUDENT'), uploadFiles, async (req, res) => {
    const { text } = parseBody(req, submissionBody);
    const files = await saveAll(uploaded(req));
    try {
      res
        .status(201)
        .json(
          await assignments.submitAssignment(currentUser(req), param(req, 'id'), { text, files }),
        );
    } catch (error) {
      // The submission was refused, so do not keep its files.
      await Promise.all(files.map((file) => storage.remove(file)));
      throw error;
    }
  });
  router.get('/:id/files/:fileId', async (req, res) => {
    const file = await assignments.assignmentFile(
      currentUser(req),
      param(req, 'id'),
      param(req, 'fileId'),
    );
    await storage.send(file, res);
  });
  return router;
}

export function submissionRoutes() {
  const router = Router();
  router.put('/:id/grade', requireRole('TEACHER'), async (req, res) => {
    res.json(
      await assignments.gradeSubmission(
        currentUser(req),
        param(req, 'id'),
        parseBody(req, gradeBody),
      ),
    );
  });
  router.get('/:id/files/:fileId', async (req, res) => {
    const file = await assignments.submissionFile(
      currentUser(req),
      param(req, 'id'),
      param(req, 'fileId'),
    );
    await storage.send(file, res);
  });
  return router;
}

export function materialRoutes() {
  const router = Router();
  const teacher = requireRole('TEACHER');

  router.get('/', requireRole('TEACHER', ...ADMIN_ROLES), async (req, res) => {
    res.json(
      await assignments.listTeacherMaterials(currentUser(req), parseQuery(req, materialListQuery)),
    );
  });
  router.post('/', teacher, uploadFiles, async (req, res) => {
    const body = parseBody(req, materialBody);
    res
      .status(201)
      .json(await assignments.createMaterial(currentUser(req), body, await saveAll(uploaded(req))));
  });
  router.delete('/:id', teacher, async (req, res) => {
    await assignments.deleteMaterial(currentUser(req), param(req, 'id'));
    res.status(204).end();
  });
  router.get('/:id/files/:fileId', async (req, res) => {
    const file = await assignments.materialFile(
      currentUser(req),
      param(req, 'id'),
      param(req, 'fileId'),
    );
    await storage.send(file, res);
  });
  return router;
}

export function noticeRoutes() {
  const router = Router();
  const authors = requireRole('TEACHER', ...ADMIN_ROLES);

  router.get('/', async (req, res) => {
    res.json(await notices.listNotices(currentUser(req), parseQuery(req, noticeListQuery)));
  });
  router.get('/unread-count', async (req, res) => {
    res.json(await notices.unreadNoticeCount(currentUser(req)));
  });
  router.get('/:id', async (req, res) => {
    res.json(await notices.getNotice(currentUser(req), param(req, 'id')));
  });
  router.post('/:id/read', async (req, res) => {
    await notices.markNoticeRead(currentUser(req), param(req, 'id'));
    res.status(204).end();
  });
  router.post('/', authors, async (req, res) => {
    res.status(201).json(await notices.createNotice(currentUser(req), parseBody(req, noticeBody)));
  });
  router.put('/:id', authors, async (req, res) => {
    res.json(
      await notices.updateNotice(currentUser(req), param(req, 'id'), parseBody(req, noticeBody)),
    );
  });
  router.delete('/:id', authors, async (req, res) => {
    await notices.deleteNotice(currentUser(req), param(req, 'id'));
    res.status(204).end();
  });
  return router;
}

export function eventRoutes() {
  const router = Router();
  const adminOnly = requireRole(...ADMIN_ROLES);

  router.get('/', async (req, res) => {
    res.json(await notices.listEvents(currentUser(req), parseQuery(req, eventListQuery)));
  });
  router.post('/', adminOnly, async (req, res) => {
    res.status(201).json(await notices.createEvent(currentUser(req), parseBody(req, eventBody)));
  });
  router.put('/:id', adminOnly, async (req, res) => {
    res.json(await notices.updateEvent(param(req, 'id'), parseBody(req, eventBody)));
  });
  router.delete('/:id', adminOnly, async (req, res) => {
    await notices.deleteEvent(param(req, 'id'));
    res.status(204).end();
  });
  return router;
}

/** One endpoint per dashboard card, each cached for 60 seconds by the service. */
export function dashboardRoutes() {
  const router = Router();
  const admin = requireRole(...ADMIN_ROLES);
  const teacher = requireRole('TEACHER');
  const family = requireRole('STUDENT', 'PARENT', 'TEACHER', ...ADMIN_ROLES);

  router.get('/admin/students-by-program', admin, async (_req, res) => {
    res.json(await dashboard.adminDashboard.studentsByProgram());
  });
  router.get('/admin/attendance-today', admin, async (_req, res) => {
    res.json(await dashboard.adminDashboard.attendanceToday());
  });
  router.get('/admin/low-attendance', admin, async (_req, res) => {
    res.json(await dashboard.adminDashboard.lowAttendance());
  });
  router.get('/admin/upcoming-exams', admin, async (_req, res) => {
    res.json(await dashboard.adminDashboard.upcomingExams());
  });
  router.get('/admin/attendance-trend', admin, async (_req, res) => {
    res.json(await dashboard.adminDashboard.attendanceTrend());
  });

  router.get('/teacher/today-classes', teacher, async (req, res) => {
    res.json(await dashboard.teacherDashboard.todayClasses(currentUser(req)));
  });
  router.get('/teacher/pending-attendance', teacher, async (req, res) => {
    res.json(await dashboard.teacherDashboard.pendingAttendance(currentUser(req)));
  });
  router.get('/teacher/ungraded-submissions', teacher, async (req, res) => {
    res.json(await dashboard.teacherDashboard.ungradedSubmissions(currentUser(req)));
  });
  router.get('/teacher/low-attendance', teacher, async (req, res) => {
    res.json(await dashboard.teacherDashboard.lowAttendance(currentUser(req)));
  });

  router.get('/students/:id/today', family, async (req, res) => {
    res.json(await dashboard.studentDashboard.today(currentUser(req), param(req, 'id')));
  });
  router.get('/students/:id/deadlines', family, async (req, res) => {
    res.json(await dashboard.studentDashboard.deadlines(currentUser(req), param(req, 'id')));
  });
  router.get('/students/:id/latest-result', family, async (req, res) => {
    res.json(await dashboard.studentDashboard.latestResult(currentUser(req), param(req, 'id')));
  });

  router.get('/recent-notices', async (req, res) => {
    res.json(await dashboard.recentNotices(currentUser(req)));
  });
  return router;
}
