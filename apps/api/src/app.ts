import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { academicRoutes } from './routes/academic.routes.js';
import {
  assistantRoutes,
  policyRoutes,
  quizRoutes,
  riskRoutes,
  timetableGeneratorRoutes,
} from './routes/ai.routes.js';
import {
  attendanceRoutes,
  offeringAttendanceRoutes,
  studentAttendanceRoutes,
} from './routes/attendance.routes.js';
import { authRoutes } from './routes/auth.routes.js';
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
} from './routes/academics.routes.js';
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
} from './routes/finance.routes.js';
import { parentRoutes, statsRoutes, studentRoutes, teacherRoutes } from './routes/people.routes.js';

/** Builds the Express app without listening, so tests can drive it directly. */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  const api = Router();
  api.use('/auth', authRoutes());
  api.use('/payments/callback', paymentCallbackRoutes());
  api.use('/public', publicRoutes());

  // Everything below here requires a logged-in user.
  api.use(requireAuth);
  api.use(academicRoutes());
  api.use('/teachers', teacherRoutes());
  api.use('/students', studentAttendanceRoutes());
  api.use('/students', studentAcademicRoutes());
  api.use('/students', studentPhotoRoutes());
  api.use('/students', studentRoutes());
  api.use('/parents', parentRoutes());
  api.use('/attendance', attendanceRoutes());
  api.use('/offerings', offeringAttendanceRoutes());
  api.use('/stats', statsRoutes());
  api.use('/rooms', roomRoutes());
  api.use('/time-slots', timeSlotRoutes());
  api.use('/timetable', timetableRoutes());
  api.use('/exams', examRoutes());
  api.use('/exam-subjects', examSubjectRoutes());
  api.use('/sections', sectionResultRoutes());
  api.use('/assignments', assignmentRoutes());
  api.use('/submissions', submissionRoutes());
  api.use('/materials', materialRoutes());
  api.use('/notices', noticeRoutes());
  api.use('/events', eventRoutes());
  api.use('/dashboard', dashboardRoutes());
  api.use('/fee-heads', feeHeadRoutes());
  api.use('/fee-structures', feeStructureRoutes());
  api.use('/fine-rules', fineRuleRoutes());
  api.use('/invoices', invoiceRoutes());
  api.use('/payments', paymentRoutes());
  api.use('/finance', financeReportRoutes());
  api.use('/pdf', pdfRoutes());
  api.use('/settings', settingsRoutes());
  api.use('/notifications', notificationRoutes());
  api.use('/assistant', assistantRoutes());
  api.use('/policies', policyRoutes());
  api.use('/risk', riskRoutes());
  api.use('/quizzes', quizRoutes());
  api.use('/timetable-generator', timetableGeneratorRoutes());

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
