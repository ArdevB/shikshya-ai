import type { InstitutionSettingsBody, PaymentView } from '@shikshya/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { forbidden, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import type { CurrentUser } from '../middleware/auth.js';
import { renderPdf } from '../pdf/render.js';
import { idCardHtml, marksheetHtml, transcriptHtml } from '../pdf/templates/academic.js';
import { invoiceHtml, receiptHtml } from '../pdf/templates/finance.js';
import type { Institution } from '../pdf/templates/layout.js';
import { getInvoice } from './finance.service.js';
import { getStudentResults } from './grading.js';
import { getPayment } from './payment.service.js';
import { assertCanAccessStudent } from './scope.js';

const DEFAULT_INSTITUTION: Institution = {
  name: 'Shikshya College',
  address: 'Kathmandu, Nepal',
  phone: '',
  email: '',
  principalName: '',
  logoDataUrl: null,
};

export async function getInstitution(): Promise<Institution> {
  return (await prisma.institutionSettings.findUnique({ where: { id: 'default' } })) ?? DEFAULT_INSTITUTION;
}

export function saveInstitution(body: InstitutionSettingsBody) {
  return prisma.institutionSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...body },
    update: body,
  });
}

/**
 * The invoice and receipt functions check access by loading through getInvoice and getPayment,
 * the same functions behind the API's own views, so a PDF can never show more than the API.
 */
export async function invoicePdf(user: CurrentUser, invoiceId: string) {
  const invoice = await getInvoice(user, invoiceId);
  return {
    filename: `invoice-${invoice.invoiceNumber}.pdf`,
    pdf: await renderPdf(invoiceHtml(await getInstitution(), invoice)),
  };
}

export async function receiptHtmlFor(user: CurrentUser, paymentId: string) {
  const payment: PaymentView = await getPayment(user, paymentId);
  if (payment.status !== 'SUCCESS' || !payment.receiptNumber) {
    throw notFound('Receipt');
  }
  const invoice = await getInvoice(user, payment.invoiceId);
  return {
    filename: `receipt-${payment.receiptNumber}.pdf`,
    html: receiptHtml(await getInstitution(), payment, invoice),
  };
}

export async function receiptPdf(user: CurrentUser, paymentId: string) {
  const { filename, html } = await receiptHtmlFor(user, paymentId);
  return { filename, pdf: await renderPdf(html) };
}

/** Built from the same function as GET /students/:id/results, so the numbers always agree. */
export async function marksheetHtmlFor(user: CurrentUser, studentId: string, semesterId: string) {
  await assertCanAccessStudent(user, studentId);
  const results = await getStudentResults(studentId);
  const semester = results.semesters.find((s) => s.semesterId === semesterId);
  if (!semester) throw notFound('Published result');
  return {
    filename: `marksheet-${results.rollNumber}-sem${semester.semesterNumber}.pdf`,
    html: marksheetHtml(await getInstitution(), results, semester),
  };
}

export async function marksheetPdf(user: CurrentUser, studentId: string, semesterId: string) {
  const { filename, html } = await marksheetHtmlFor(user, studentId, semesterId);
  return { filename, pdf: await renderPdf(html) };
}

export async function transcriptHtmlFor(user: CurrentUser, studentId: string) {
  await assertCanAccessStudent(user, studentId);
  const results = await getStudentResults(studentId);
  if (results.semesters.length === 0) throw notFound('Published result');
  return {
    filename: `transcript-${results.rollNumber}.pdf`,
    html: transcriptHtml(await getInstitution(), results),
  };
}

export async function transcriptPdf(user: CurrentUser, studentId: string) {
  const { filename, html } = await transcriptHtmlFor(user, studentId);
  return { filename, pdf: await renderPdf(html) };
}

// ---------- ID cards and their QR codes ----------

/** Unguessable, so the public verification page cannot be used to list students. */
export const verificationToken = (studentId: string) =>
  createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`verify-student:${studentId}`)
    .digest('base64url')
    .slice(0, 24);

export const verificationUrl = (studentId: string) =>
  `${env.WEB_ORIGIN}/verify/${studentId}/${verificationToken(studentId)}`;

export async function idCardPdf(user: CurrentUser, studentId: string) {
  await assertCanAccessStudent(user, studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      rollNumber: true,
      program: { select: { name: true } },
      user: { select: { firstName: true, lastName: true, avatarUrl: true } },
    },
  });
  if (!student) throw notFound('Student');

  const html = idCardHtml(
    await getInstitution(),
    {
      name: `${student.user.firstName} ${student.user.lastName}`,
      rollNumber: student.rollNumber,
      programName: student.program.name,
      photoDataUrl: student.user.avatarUrl,
    },
    await QRCode.toDataURL(verificationUrl(studentId), { margin: 0, width: 240 }),
  );
  return {
    filename: `id-card-${student.rollNumber}.pdf`,
    pdf: await renderPdf(html, { width: '85.6mm', height: '54mm' }),
  };
}

/** The public page behind the QR code. It shows only what is printed on the card itself. */
export async function verifyStudent(studentId: string, token: string) {
  const expected = Buffer.from(verificationToken(studentId));
  const given = Buffer.from(token);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw forbidden('This verification link is not valid');
  }
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      rollNumber: true,
      program: { select: { name: true } },
      user: { select: { firstName: true, lastName: true, isActive: true } },
    },
  });
  if (!student) throw notFound('Student');
  const institution = await getInstitution();
  return {
    name: `${student.user.firstName} ${student.user.lastName}`,
    rollNumber: student.rollNumber,
    programName: student.program.name,
    institutionName: institution.name,
    isActive: student.user.isActive,
  };
}

export async function setStudentPhoto(studentId: string, photoDataUrl: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw notFound('Student');
  await prisma.user.update({ where: { id: student.userId }, data: { avatarUrl: photoDataUrl } });
}
