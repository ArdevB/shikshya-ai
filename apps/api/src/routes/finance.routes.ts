import {
  cancelInvoiceBody,
  discountBody,
  feeHeadBody,
  feeStructureBody,
  fineRuleBody,
  generateInvoicesBody,
  initiatePaymentBody,
  institutionSettingsBody,
  invoiceListQuery,
  manualInvoiceBody,
  manualPaymentBody,
  notificationPreferenceBody,
  paginationQuery,
  paymentListQuery,
  studentPhotoBody,
} from '@shikshya/shared';
import { Router, type Response } from 'express';
import { env } from '../config/env.js';
import { ADMIN_ROLES, currentUser, requireRole } from '../middleware/auth.js';
import { param, parseBody, parseQuery } from '../middleware/validate.js';
import * as finance from '../services/finance.service.js';
import { handleCallback } from '../services/payment.service.js';
import * as payments from '../services/payment.service.js';
import * as notifications from '../services/notification.service.js';
import * as pdf from '../services/pdf.service.js';
import { crudRouter } from './academic.routes.js';

const FINANCE_ROLES = ['ACCOUNTANT', ...ADMIN_ROLES] as const;
const staffOnly = () => requireRole(...FINANCE_ROLES);

export const feeHeadRoutes = () =>
  crudRouter(finance.feeHeads, paginationQuery, feeHeadBody, {
    writers: FINANCE_ROLES,
    readers: FINANCE_ROLES,
  });
export const feeStructureRoutes = () =>
  crudRouter(finance.feeStructures, paginationQuery, feeStructureBody, {
    writers: FINANCE_ROLES,
    readers: FINANCE_ROLES,
  });
export const fineRuleRoutes = () =>
  crudRouter(finance.fineRules, paginationQuery, fineRuleBody, {
    writers: FINANCE_ROLES,
    readers: FINANCE_ROLES,
  });

export function invoiceRoutes() {
  const router = Router();
  const family = requireRole('STUDENT', 'PARENT', ...FINANCE_ROLES);

  router.get('/', family, async (req, res) => {
    res.json(await finance.listInvoices(currentUser(req), parseQuery(req, invoiceListQuery)));
  });
  router.post('/generate', staffOnly(), async (req, res) => {
    res
      .status(201)
      .json(await finance.generateInvoices(currentUser(req), parseBody(req, generateInvoicesBody)));
  });
  router.post('/', staffOnly(), async (req, res) => {
    res
      .status(201)
      .json(await finance.createManualInvoice(currentUser(req), parseBody(req, manualInvoiceBody)));
  });
  router.get('/:id', family, async (req, res) => {
    res.json(await finance.getInvoice(currentUser(req), param(req, 'id')));
  });
  router.post('/:id/discount', staffOnly(), async (req, res) => {
    res.json(
      await finance.applyDiscount(currentUser(req), param(req, 'id'), parseBody(req, discountBody)),
    );
  });
  router.post('/:id/cancel', staffOnly(), async (req, res) => {
    const { reason } = parseBody(req, cancelInvoiceBody);
    res.json(await finance.cancelInvoice(currentUser(req), param(req, 'id'), reason));
  });
  return router;
}

/**
 * Where a gateway sends the browser back to. There is no login here, because the redirect
 * comes from outside, and nothing here trusts the query string: see handleCallback.
 * Mounted before the login check.
 */
export function paymentCallbackRoutes() {
  const router = Router();
  const backToSite = (res: Response, paymentId: string | null) =>
    res.redirect(`${env.WEB_ORIGIN}/payments/result${paymentId ? `?paymentId=${paymentId}` : ''}`);

  router.get('/esewa', async (req, res) => {
    const { paymentId } = await handleCallback('ESEWA', req.query);
    backToSite(res, paymentId);
  });
  router.get('/khalti', async (req, res) => {
    const { paymentId } = await handleCallback('KHALTI', req.query);
    backToSite(res, paymentId);
  });
  // eSewa's failure redirect carries no data, so the failure URL itself names the payment.
  router.get('/esewa/failed/:paymentId', async (req, res) => {
    const { paymentId } = await handleCallback('ESEWA', {
      data: undefined,
      ...req.query,
    });
    backToSite(res, paymentId ?? param(req, 'paymentId'));
  });
  router.get('/khalti/failed/:paymentId', (req, res) => {
    backToSite(res, param(req, 'paymentId'));
  });
  return router;
}

export function paymentRoutes() {
  const router = Router();
  const family = requireRole('STUDENT', 'PARENT', ...FINANCE_ROLES);

  router.post('/initiate', requireRole('STUDENT', 'PARENT'), async (req, res) => {
    res
      .status(201)
      .json(await payments.initiatePayment(currentUser(req), parseBody(req, initiatePaymentBody)));
  });
  router.post('/manual', staffOnly(), async (req, res) => {
    res
      .status(201)
      .json(
        await payments.recordManualPayment(currentUser(req), parseBody(req, manualPaymentBody)),
      );
  });
  router.get('/', family, async (req, res) => {
    res.json(await payments.listPayments(currentUser(req), parseQuery(req, paymentListQuery)));
  });
  router.get('/:id', family, async (req, res) => {
    res.json(await payments.getPayment(currentUser(req), param(req, 'id')));
  });
  router.post('/:id/refresh', family, async (req, res) => {
    res.json(await payments.refreshPayment(currentUser(req), param(req, 'id')));
  });
  return router;
}

export function financeReportRoutes() {
  const router = Router();
  router.use(staffOnly());

  router.get('/outstanding.csv', async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="outstanding-dues.csv"');
    res.send(await finance.outstandingCsv());
  });
  router.get('/collections-summary', async (_req, res) => {
    res.json(await payments.collectionsSummary());
  });
  router.get('/outstanding-by-program', async (_req, res) => {
    res.json(await payments.outstandingByProgram());
  });
  router.get('/collections-trend', async (_req, res) => {
    res.json(await payments.collectionsTrend());
  });
  return router;
}

const sendPdf = (res: Response, file: { filename: string; pdf: Buffer }) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.pdf);
};

/** Each PDF is built through the same access-checked functions as the data behind it. */
export function pdfRoutes() {
  const router = Router();
  router.get('/receipt/:paymentId', async (req, res) => {
    sendPdf(res, await pdf.receiptPdf(currentUser(req), param(req, 'paymentId')));
  });
  router.get('/invoice/:invoiceId', async (req, res) => {
    sendPdf(res, await pdf.invoicePdf(currentUser(req), param(req, 'invoiceId')));
  });
  router.get('/marksheet/:studentId/:semesterId', async (req, res) => {
    sendPdf(
      res,
      await pdf.marksheetPdf(currentUser(req), param(req, 'studentId'), param(req, 'semesterId')),
    );
  });
  router.get('/transcript/:studentId', async (req, res) => {
    sendPdf(res, await pdf.transcriptPdf(currentUser(req), param(req, 'studentId')));
  });
  router.get('/id-card/:studentId', async (req, res) => {
    sendPdf(res, await pdf.idCardPdf(currentUser(req), param(req, 'studentId')));
  });
  return router;
}

export function settingsRoutes() {
  const router = Router();
  router.get('/institution', async (_req, res) => {
    res.json(await pdf.getInstitution());
  });
  router.put('/institution', requireRole('SUPER_ADMIN'), async (req, res) => {
    res.json(await pdf.saveInstitution(parseBody(req, institutionSettingsBody)));
  });
  return router;
}

export function studentPhotoRoutes() {
  const router = Router();
  router.put('/:id/photo', requireRole(...ADMIN_ROLES), async (req, res) => {
    const { photoDataUrl } = parseBody(req, studentPhotoBody);
    await pdf.setStudentPhoto(param(req, 'id'), photoDataUrl);
    res.status(204).end();
  });
  return router;
}

/** The page a QR code on an ID card opens. Public, and protected by its token. */
export function publicRoutes() {
  const router = Router();
  router.get('/verify-student/:id/:token', async (req, res) => {
    res.json(await pdf.verifyStudent(param(req, 'id'), param(req, 'token')));
  });
  return router;
}

export function notificationRoutes() {
  const router = Router();
  router.get('/', async (req, res) => {
    res.json(
      await notifications.listNotifications(currentUser(req).id, parseQuery(req, paginationQuery)),
    );
  });
  router.get('/unread-count', async (req, res) => {
    res.json(await notifications.unreadCount(currentUser(req).id));
  });
  router.post('/read-all', async (req, res) => {
    await notifications.markAllRead(currentUser(req).id);
    res.status(204).end();
  });
  router.get('/preferences', async (req, res) => {
    res.json(await notifications.getPreferences(currentUser(req).id));
  });
  router.put('/preferences', async (req, res) => {
    res.json(
      await notifications.setPreference(
        currentUser(req).id,
        parseBody(req, notificationPreferenceBody),
      ),
    );
  });
  router.post('/:id/read', async (req, res) => {
    await notifications.markRead(currentUser(req).id, param(req, 'id'));
    res.status(204).end();
  });
  return router;
}
