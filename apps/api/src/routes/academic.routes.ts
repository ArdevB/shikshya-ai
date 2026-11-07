import {
  academicYearBody,
  courseBody,
  courseListQuery,
  courseOfferingBody,
  courseOfferingListQuery,
  departmentBody,
  paginationQuery,
  programBody,
  programListQuery,
  sectionBody,
  sectionListQuery,
  semesterBody,
  semesterListQuery,
  type Role,
} from '@shikshya/shared';
import { Router } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ADMIN_ROLES, requireRole } from '../middleware/auth.js';
import { param, parseBody, parseQuery } from '../middleware/validate.js';
import * as academic from '../services/academic.service.js';

interface CrudService<Q, B> {
  list(query: Q): Promise<unknown>;
  get(id: string): Promise<unknown>;
  create(body: B): Promise<unknown>;
  update(id: string, body: B): Promise<unknown>;
  remove(id: string): Promise<unknown>;
}

/**
 * These resources all behave the same: by default any logged-in user may read them and only
 * admins may change them, unless other roles are given. Other rules live in each service.
 */
export function crudRouter<QS extends ZodTypeAny, BS extends ZodTypeAny>(
  service: CrudService<z.output<QS>, z.output<BS>>,
  querySchema: QS,
  bodySchema: BS,
  roles: { writers?: readonly Role[]; readers?: readonly Role[] } = {},
) {
  const router = Router();
  const adminOnly = requireRole(...(roles.writers ?? ADMIN_ROLES));
  if (roles.readers) router.use(requireRole(...roles.readers));

  router.get('/', async (req, res) => {
    res.json(await service.list(parseQuery(req, querySchema)));
  });
  router.get('/:id', async (req, res) => {
    res.json(await service.get(param(req, 'id')));
  });
  router.post('/', adminOnly, async (req, res) => {
    res.status(201).json(await service.create(parseBody(req, bodySchema)));
  });
  router.put('/:id', adminOnly, async (req, res) => {
    res.json(await service.update(param(req, 'id'), parseBody(req, bodySchema)));
  });
  router.delete('/:id', adminOnly, async (req, res) => {
    await service.remove(param(req, 'id'));
    res.status(204).end();
  });

  return router;
}

/** Listed one by one, so these routes can be counted along with all the others. */
export const academicMounts = (): [path: string, routes: Router][] => [
  ['/departments', crudRouter(academic.departments, paginationQuery, departmentBody)],
  ['/programs', crudRouter(academic.programs, programListQuery, programBody)],
  ['/academic-years', crudRouter(academic.academicYears, paginationQuery, academicYearBody)],
  ['/semesters', crudRouter(academic.semesters, semesterListQuery, semesterBody)],
  ['/sections', crudRouter(academic.sections, sectionListQuery, sectionBody)],
  ['/courses', crudRouter(academic.courses, courseListQuery, courseBody)],
  [
    '/course-offerings',
    crudRouter(academic.courseOfferings, courseOfferingListQuery, courseOfferingBody),
  ],
];
