import {
  parentCreateBody,
  parentLinkBody,
  parentListQuery,
  parentUpdateBody,
  studentCreateBody,
  studentListQuery,
  studentUpdateBody,
  teacherCreateBody,
  teacherListQuery,
  teacherUpdateBody,
} from '@shikshya/shared';
import { Router } from 'express';
import multer from 'multer';
import { ApiError, badRequest } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { ADMIN_ROLES, currentUser, requireRole } from '../middleware/auth.js';
import { param, parseBody, parseQuery } from '../middleware/validate.js';
import * as parents from '../services/parent.service.js';
import * as students from '../services/student.service.js';
import * as teachers from '../services/teacher.service.js';

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export function teacherRoutes() {
  const router = Router();
  router.use(requireRole(...ADMIN_ROLES));

  router.get('/', async (req, res) => {
    res.json(await teachers.listTeachers(parseQuery(req, teacherListQuery)));
  });
  router.get('/:id', async (req, res) => {
    res.json(await teachers.getTeacher(param(req, 'id')));
  });
  router.post('/', async (req, res) => {
    res.status(201).json(await teachers.createTeacher(parseBody(req, teacherCreateBody)));
  });
  router.put('/:id', async (req, res) => {
    res.json(await teachers.updateTeacher(param(req, 'id'), parseBody(req, teacherUpdateBody)));
  });
  router.delete('/:id', async (req, res) => {
    await teachers.deleteTeacher(param(req, 'id'));
    res.status(204).end();
  });
  return router;
}

export function studentRoutes() {
  const router = Router();
  const adminOnly = requireRole(...ADMIN_ROLES);

  router.get('/', adminOnly, async (req, res) => {
    res.json(await students.listStudents(parseQuery(req, studentListQuery)));
  });
  router.post('/', adminOnly, async (req, res) => {
    res.status(201).json(await students.createStudent(parseBody(req, studentCreateBody)));
  });
  router.post('/import', adminOnly, csvUpload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Attach a CSV file in the "file" field');
    const result = await students.importStudents(req.file.buffer.toString('utf8'));
    if (result.errors.length > 0) {
      const count = result.errors.length;
      throw new ApiError(
        422,
        'CSV_INVALID',
        `Nothing was imported. Fix the ${count === 1 ? 'problem' : `${count} problems`} below and try again.`,
        result.errors,
      );
    }
    res.status(201).json(result);
  });
  router.get('/:id', adminOnly, async (req, res) => {
    res.json(await students.getStudent(param(req, 'id')));
  });
  router.put('/:id', adminOnly, async (req, res) => {
    res.json(await students.updateStudent(param(req, 'id'), parseBody(req, studentUpdateBody)));
  });
  router.delete('/:id', adminOnly, async (req, res) => {
    await students.deleteStudent(param(req, 'id'));
    res.status(204).end();
  });
  return router;
}

export function parentRoutes() {
  const router = Router();

  // A parent's own children, for the child switcher. Declared before the admin-only rule.
  router.get('/me/children', requireRole('PARENT'), async (req, res) => {
    res.json(await parents.listOwnChildren(currentUser(req).id));
  });

  router.use(requireRole(...ADMIN_ROLES));
  router.get('/', async (req, res) => {
    res.json(await parents.listParents(parseQuery(req, parentListQuery)));
  });
  router.get('/:id', async (req, res) => {
    res.json(await parents.getParent(param(req, 'id')));
  });
  router.post('/', async (req, res) => {
    res.status(201).json(await parents.createParent(parseBody(req, parentCreateBody)));
  });
  router.put('/:id', async (req, res) => {
    res.json(await parents.updateParent(param(req, 'id'), parseBody(req, parentUpdateBody)));
  });
  router.delete('/:id', async (req, res) => {
    await parents.deleteParent(param(req, 'id'));
    res.status(204).end();
  });
  router.post('/:id/students', async (req, res) => {
    res.status(201).json(await parents.linkChild(param(req, 'id'), parseBody(req, parentLinkBody)));
  });
  router.delete('/:id/students/:studentId', async (req, res) => {
    await parents.unlinkChild(param(req, 'id'), param(req, 'studentId'));
    res.status(204).end();
  });
  return router;
}

/** Placeholder counts for the admin dashboard. Phase 2 replaces these with real cards. */
export function statsRoutes() {
  const router = Router();
  router.get('/overview', requireRole(...ADMIN_ROLES), async (_req, res) => {
    const [departments, programs, courses, sections, teachers, students, parents] =
      await Promise.all([
        prisma.department.count(),
        prisma.program.count(),
        prisma.course.count(),
        prisma.section.count(),
        prisma.teacher.count(),
        prisma.student.count(),
        prisma.parent.count(),
      ]);
    res.json({ departments, programs, courses, sections, teachers, students, parents });
  });
  return router;
}
