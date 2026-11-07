import type { Router } from 'express';
import {
  assistantRoutes,
  policyRoutes,
  quizRoutes,
  riskRoutes,
  timetableGeneratorRoutes,
} from './ai.routes.js';
import { academicMounts } from './academic.routes.js';
import {
  assignmentRoutes,
  dashboardRoutes,
  eventRoutes,
  examRoutes,
  examSubjectRoutes,
  materialRoutes,
  noticeRoutes,
  roomRoutes,
  sectionResultRoutes,
  studentAcademicRoutes,
  submissionRoutes,
  timeSlotRoutes,
  timetableRoutes,
} from './academics.routes.js';
import {
  attendanceRoutes,
  offeringAttendanceRoutes,
  studentAttendanceRoutes,
} from './attendance.routes.js';
import { authRoutes } from './auth.routes.js';
import {
  feeHeadRoutes,
  feeStructureRoutes,
  financeReportRoutes,
  fineRuleRoutes,
  invoiceRoutes,
  notificationRoutes,
  paymentCallbackRoutes,
  paymentRoutes,
  pdfRoutes,
  publicRoutes,
  settingsRoutes,
  studentPhotoRoutes,
} from './finance.routes.js';
import { parentRoutes, statsRoutes, studentRoutes, teacherRoutes } from './people.routes.js';

/** A group of routes and the path it sits under, relative to /api/v1. */
export type Mount = [path: string, routes: Router];

/** Reachable without logging in. Each of these protects itself some other way. */
export const publicMounts = (): Mount[] => [
  ['/auth', authRoutes()],
  ['/payments/callback', paymentCallbackRoutes()],
  ['/public', publicRoutes()],
];

/**
 * Everything here needs a logged-in user. The order matters where paths overlap: several groups
 * sit under /students, and the first route to match wins.
 */
export const protectedMounts = (): Mount[] => [
  ...academicMounts(),
  ['/teachers', teacherRoutes()],
  ['/students', studentAttendanceRoutes()],
  ['/students', studentAcademicRoutes()],
  ['/students', studentPhotoRoutes()],
  ['/students', studentRoutes()],
  ['/parents', parentRoutes()],
  ['/attendance', attendanceRoutes()],
  ['/offerings', offeringAttendanceRoutes()],
  ['/stats', statsRoutes()],
  ['/rooms', roomRoutes()],
  ['/time-slots', timeSlotRoutes()],
  ['/timetable', timetableRoutes()],
  ['/exams', examRoutes()],
  ['/exam-subjects', examSubjectRoutes()],
  ['/sections', sectionResultRoutes()],
  ['/assignments', assignmentRoutes()],
  ['/submissions', submissionRoutes()],
  ['/materials', materialRoutes()],
  ['/notices', noticeRoutes()],
  ['/events', eventRoutes()],
  ['/dashboard', dashboardRoutes()],
  ['/fee-heads', feeHeadRoutes()],
  ['/fee-structures', feeStructureRoutes()],
  ['/fine-rules', fineRuleRoutes()],
  ['/invoices', invoiceRoutes()],
  ['/payments', paymentRoutes()],
  ['/finance', financeReportRoutes()],
  ['/pdf', pdfRoutes()],
  ['/settings', settingsRoutes()],
  ['/notifications', notificationRoutes()],
  ['/assistant', assistantRoutes()],
  ['/policies', policyRoutes()],
  ['/risk', riskRoutes()],
  ['/quizzes', quizRoutes()],
  ['/timetable-generator', timetableGeneratorRoutes()],
];

export interface RouteInfo {
  method: string;
  /** Relative to /api/v1, with parameters left as :id. */
  path: string;
  access: 'public' | 'protected';
}

/** The part of Express's router this needs. Express does not publish a type for it. */
interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

function routesIn(mounts: Mount[], access: RouteInfo['access']): RouteInfo[] {
  return mounts.flatMap(([prefix, router]) =>
    (router.stack as RouterLayer[]).flatMap(({ route }) =>
      route
        ? Object.keys(route.methods).map((method) => ({
            method: method.toUpperCase(),
            path: `${prefix}${route.path === '/' && prefix ? '' : route.path}`,
            access,
          }))
        : [],
    ),
  );
}

/**
 * Every route the API has, read from the routers themselves. The permission test and the API
 * documentation both start from this, so a new route cannot be missed by either.
 */
export const listRoutes = (): RouteInfo[] => [
  ...routesIn(publicMounts(), 'public'),
  ...routesIn(protectedMounts(), 'protected'),
];
