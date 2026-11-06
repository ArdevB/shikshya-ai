import {
  attendanceSessionBody,
  attendanceSessionListQuery,
  attendanceSessionUpdateBody,
} from '@shikshya/shared';
import { Router } from 'express';
import { ADMIN_ROLES, currentUser, requireRole } from '../middleware/auth.js';
import { param, parseBody, parseQuery } from '../middleware/validate.js';
import * as attendance from '../services/attendance.service.js';

export function attendanceRoutes() {
  const router = Router();
  const teacherOrAdmin = requireRole('TEACHER', ...ADMIN_ROLES);

  router.post('/sessions', requireRole('TEACHER'), async (req, res) => {
    const session = await attendance.createSession(
      currentUser(req),
      parseBody(req, attendanceSessionBody),
    );
    res.status(201).json(session);
  });

  router.put('/sessions/:id', teacherOrAdmin, async (req, res) => {
    res.json(
      await attendance.updateSession(
        currentUser(req),
        param(req, 'id'),
        parseBody(req, attendanceSessionUpdateBody),
      ),
    );
  });

  router.get('/sessions', teacherOrAdmin, async (req, res) => {
    res.json(
      await attendance.listSessions(currentUser(req), parseQuery(req, attendanceSessionListQuery)),
    );
  });

  router.get('/sessions/:id', teacherOrAdmin, async (req, res) => {
    res.json(await attendance.getSession(currentUser(req), param(req, 'id')));
  });

  return router;
}

/** Mounted at /students, ahead of the admin-only student routes. */
export function studentAttendanceRoutes() {
  const router = Router();
  router.get(
    '/:id/attendance-summary',
    requireRole('STUDENT', 'PARENT', 'TEACHER', ...ADMIN_ROLES),
    async (req, res) => {
      res.json(await attendance.getStudentSummary(currentUser(req), param(req, 'id')));
    },
  );
  return router;
}

export function offeringAttendanceRoutes() {
  const router = Router();
  const teacherOrAdmin = requireRole('TEACHER', ...ADMIN_ROLES);

  router.get('/:id/attendance-report', teacherOrAdmin, async (req, res) => {
    res.json(await attendance.getOfferingReport(currentUser(req), param(req, 'id')));
  });
  router.get('/:id/roster', teacherOrAdmin, async (req, res) => {
    res.json(await attendance.getOfferingRoster(currentUser(req), param(req, 'id')));
  });
  return router;
}
