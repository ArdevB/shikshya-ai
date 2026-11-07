import type { Prisma } from '@prisma/client';
import {
  deriveInvoiceStatus,
  formatNpr,
  KHALTI_MIN_PAISA,
  outstandingPaisa,
  type InitiatePaymentBody,
  type InitiatePaymentResult,
  type ManualPaymentBody,
  type PaginationQuery,
  type PaymentStatus,
  type PaymentView,
} from '@shikshya/shared';
import { env } from '../config/env.js';
import { writeAudit } from '../lib/audit.js';
import { cached, clearCache } from '../lib/cache.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { nextNumber } from '../lib/numbering.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';
import { addDays, todayInNepal } from '../lib/time.js';
import type { CurrentUser } from '../middleware/auth.js';
import { gatewayFor, isGatewayName } from './gateways/index.js';
import type { VerifyResult } from './gateways/types.js';
import { notifySafely, notifyStudentsAndParents } from './notification.service.js';
import { canAccessFinance, isFinanceStaff } from './scope.js';
import { logger } from '../lib/logger.js';

const paymentInclude = {
  invoice: {
    select: {
      invoiceNumber: true,
      studentId: true,
      student: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  },
} as const;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

function toView(row: PaymentRow): PaymentView {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice.invoiceNumber,
    amountPaisa: row.amountPaisa,
    method: row.method,
    status: row.status,
    gatewayRef: row.gatewayRef,
    receiptNumber: row.receiptNumber,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    studentName: `${row.invoice.student.user.firstName} ${row.invoice.student.user.lastName}`,
  };
}

/** Where gateways send the browser. The API is the first stop, so it can verify the payment. */
export const callbackUrls = (method: string, paymentId: string) => ({
  successUrl: `${env.API_PUBLIC_URL}/api/v1/payments/callback/${method.toLowerCase()}`,
  failureUrl: `${env.API_PUBLIC_URL}/api/v1/payments/callback/${method.toLowerCase()}/failed/${paymentId}`,
});

/** Always the whole outstanding amount, so the amount is decided here and not by the browser. */
export async function initiatePayment(
  user: CurrentUser,
  body: InitiatePaymentBody,
): Promise<InitiatePaymentResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: body.invoiceId },
    include: {
      student: {
        select: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } },
      },
    },
  });
  if (!invoice) throw forbidden();
  if (!(await canAccessFinance(user, invoice.studentId))) throw forbidden();
  if (invoice.status === 'CANCELLED') throw conflict('This invoice has been cancelled');

  const amountPaisa = outstandingPaisa(invoice);
  if (amountPaisa === 0) throw conflict('This invoice has already been paid');
  if (body.method === 'KHALTI' && amountPaisa < KHALTI_MIN_PAISA) {
    throw badRequest(`Khalti needs at least ${formatNpr(KHALTI_MIN_PAISA)}. Please use eSewa.`);
  }

  const payment = await prisma.payment.create({
    data: { invoiceId: invoice.id, amountPaisa, method: body.method, status: 'INITIATED' },
  });

  const studentUser = invoice.student.user;
  try {
    const output = await gatewayFor(body.method).initiate({
      paymentId: payment.id,
      amountPaisa,
      purchaseName: `Invoice ${invoice.invoiceNumber}`,
      ...callbackUrls(body.method, payment.id),
      websiteUrl: env.WEB_ORIGIN,
      customer: {
        name: `${studentUser.firstName} ${studentUser.lastName}`,
        email: studentUser.email,
        phone: studentUser.phone,
      },
    });
    if (output.gatewayRef) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { gatewayRef: output.gatewayRef },
      });
    }
    await writeAudit({
      actorId: user.id,
      action: 'PAYMENT_INITIATE',
      entity: 'Payment',
      entityId: payment.id,
      after: { invoiceId: invoice.id, amountPaisa, method: body.method },
    });
    return {
      paymentId: payment.id,
      redirectUrl: output.redirectUrl,
      formAction: output.formAction,
      formFields: output.formFields,
    };
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    throw error;
  }
}

/**
 * Applies what the gateway said. Moving a payment out of INITIATED is an atomic update on that
 * status, so duplicate or simultaneous callbacks find nothing to change and do nothing. An
 * invoice can only be credited once per payment.
 */
async function applyVerification(paymentId: string, result: VerifyResult) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: true },
  });
  if (!payment || payment.status !== 'INITIATED') return;

  const rawPayload = result.raw as Prisma.InputJsonValue;

  if (result.state === 'PENDING') {
    await prisma.payment.updateMany({
      where: { id: paymentId, status: 'INITIATED' },
      data: { gatewayPayload: rawPayload },
    });
    return;
  }

  // The amount must match exactly. A mismatch may be fraud, and service must stop.
  const amountMismatch = result.state === 'SUCCESS' && result.amountPaisa !== payment.amountPaisa;

  if (result.state === 'FAILED' || amountMismatch) {
    const changed = await prisma.payment.updateMany({
      where: { id: paymentId, status: 'INITIATED' },
      data: { status: 'FAILED', gatewayRef: result.gatewayRef, gatewayPayload: rawPayload },
    });
    if (changed.count > 0) {
      await writeAudit({
        actorId: null,
        action: amountMismatch ? 'PAYMENT_AMOUNT_MISMATCH' : 'PAYMENT_FAILED',
        entity: 'Payment',
        entityId: paymentId,
        after: { expected: payment.amountPaisa, reported: result.amountPaisa },
      });
    }
    return;
  }

  const settled = await prisma.$transaction(async (tx) => {
    const claim = await tx.payment.updateMany({
      where: { id: paymentId, status: 'INITIATED' },
      data: { status: 'SUCCESS' },
    });
    if (claim.count === 0) return false;
    await creditInvoice(tx, {
      paymentId,
      invoiceId: payment.invoiceId,
      amountPaisa: payment.amountPaisa,
      gatewayRef: result.gatewayRef,
      gatewayPayload: rawPayload,
      actorId: null,
    });
    return true;
  });

  if (settled) {
    clearCache(FINANCE_CACHE);
    await notifySafely(() =>
      notifyStudentsAndParents([payment.invoice.studentId], 'PAYMENT_SUCCESS', {
        title: 'Payment received',
        body: `We received ${formatNpr(payment.amountPaisa)} for invoice ${payment.invoice.invoiceNumber}.`,
        path: 'fees',
      }),
    );
  }
}

/** Adds the money to the invoice, numbers the receipt and logs it, all in the same transaction. */
async function creditInvoice(
  tx: Prisma.TransactionClient,
  input: {
    paymentId: string;
    invoiceId: string;
    amountPaisa: number;
    gatewayRef: string | null;
    gatewayPayload?: Prisma.InputJsonValue;
    actorId: string | null;
  },
) {
  const today = todayInNepal();
  const receiptNumber = await nextNumber(tx, 'RCP', Number(today.slice(0, 4)));
  await tx.payment.update({
    where: { id: input.paymentId },
    data: {
      receiptNumber,
      paidAt: new Date(),
      gatewayRef: input.gatewayRef,
      gatewayPayload: input.gatewayPayload,
    },
  });
  const invoice = await tx.invoice.update({
    where: { id: input.invoiceId },
    data: { paidPaisa: { increment: input.amountPaisa } },
  });
  const status = deriveInvoiceStatus(
    { ...invoice, dueDate: invoice.dueDate.toISOString().slice(0, 10) },
    today,
  );
  await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
  await writeAudit(
    {
      actorId: input.actorId,
      action: 'PAYMENT_SUCCESS',
      entity: 'Payment',
      entityId: input.paymentId,
      after: {
        invoiceId: input.invoiceId,
        amountPaisa: input.amountPaisa,
        receiptNumber,
        invoiceStatus: status,
      },
    },
    tx,
  );
}

/**
 * Handles a browser coming back from a gateway. Anyone can call this URL with anything in it,
 * so the query string only tells us which payment to look at. The answer always comes from
 * asking the gateway directly.
 */
export async function handleCallback(method: string, params: Record<string, unknown>) {
  if (!isGatewayName(method)) throw notFound('Gateway');
  const gateway = gatewayFor(method);

  const paymentId = gateway.identifyCallback(params);
  if (!paymentId) return { paymentId: null };

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.method !== method) return { paymentId: null };

  if (payment.status === 'INITIATED') {
    try {
      await applyVerification(payment.id, await gateway.verify(payment));
    } catch (error) {
      // The customer is mid-redirect, so they get our result page, not a raw error. The
      // payment stays INITIATED, and the reconciliation job checks it again.
      logger.error({ err: error, paymentId: payment.id }, 'Could not verify payment');
    }
  }
  return { paymentId: payment.id };
}

/** Rechecks a payment on request, for when the customer never made it back to the site. */
export async function refreshPayment(user: CurrentUser, id: string) {
  const payment = await getPaymentRow(user, id);
  if (payment.status === 'INITIATED' && isGatewayName(payment.method)) {
    await applyVerification(payment.id, await gatewayFor(payment.method).verify(payment));
  }
  return toView(await prisma.payment.findUniqueOrThrow({ where: { id }, include: paymentInclude }));
}

const RECONCILE_AFTER_MS = 5 * 60 * 1000;
const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Catches payments whose customer closed the browser before coming back. eSewa recommends the
 * status check after five minutes. A payment still unknown after a day is treated as failed.
 */
export async function reconcilePayments(now = new Date()) {
  const open = await prisma.payment.findMany({
    where: {
      status: 'INITIATED',
      method: { in: ['ESEWA', 'KHALTI'] },
      createdAt: { lt: new Date(now.getTime() - RECONCILE_AFTER_MS) },
    },
  });
  for (const payment of open) {
    if (!isGatewayName(payment.method)) continue;
    try {
      await applyVerification(payment.id, await gatewayFor(payment.method).verify(payment));
    } catch (error) {
      logger.error({ err: error, paymentId: payment.id }, 'Could not verify payment');
    }
    const expired = now.getTime() - payment.createdAt.getTime() > GIVE_UP_AFTER_MS;
    if (expired) {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: 'INITIATED' },
        data: { status: 'FAILED' },
      });
    }
  }
  return { checked: open.length };
}

/** Cash or bank payments recorded by the accounts office. */
export async function recordManualPayment(user: CurrentUser, body: ManualPaymentBody) {
  const invoice = await prisma.invoice.findUnique({ where: { id: body.invoiceId } });
  if (!invoice) throw notFound('Invoice');
  if (invoice.status === 'CANCELLED') throw conflict('This invoice has been cancelled');
  const owed = outstandingPaisa(invoice);
  if (body.amount > owed) {
    throw badRequest(`This is more than the ${formatNpr(owed)} outstanding`, [
      { path: 'amount', message: `More than the ${formatNpr(owed)} outstanding` },
    ]);
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        invoiceId: body.invoiceId,
        amountPaisa: body.amount,
        method: body.method,
        status: 'SUCCESS',
        recordedById: user.id,
      },
    });
    await creditInvoice(tx, {
      paymentId: created.id,
      invoiceId: body.invoiceId,
      amountPaisa: body.amount,
      gatewayRef: body.reference ?? null,
      actorId: user.id,
    });
    return tx.payment.findUniqueOrThrow({
      where: { id: created.id },
      include: paymentInclude,
    });
  });

  clearCache(FINANCE_CACHE);
  await notifySafely(() =>
    notifyStudentsAndParents([invoice.studentId], 'PAYMENT_SUCCESS', {
      title: 'Payment received',
      body: `We received ${formatNpr(body.amount)} for invoice ${invoice.invoiceNumber}.`,
      path: 'fees',
    }),
  );
  return toView(payment);
}

async function getPaymentRow(user: CurrentUser, id: string) {
  const payment = await prisma.payment.findUnique({ where: { id }, include: paymentInclude });
  if (!payment) {
    if (!isFinanceStaff(user)) throw forbidden();
    throw notFound('Payment');
  }
  if (!(await canAccessFinance(user, payment.invoice.studentId))) throw forbidden();
  return payment;
}

export const getPayment = async (user: CurrentUser, id: string) =>
  toView(await getPaymentRow(user, id));

export async function listPayments(
  user: CurrentUser,
  query: PaginationQuery & { invoiceId?: string; status?: string },
) {
  const scope: Prisma.PaymentWhereInput = isFinanceStaff(user)
    ? {}
    : user.role === 'STUDENT'
      ? { invoice: { student: { userId: user.id } } }
      : user.role === 'PARENT'
        ? { invoice: { student: { parents: { some: { parent: { userId: user.id } } } } } }
        : { id: 'none' };
  const where: Prisma.PaymentWhereInput = {
    AND: [
      scope,
      {
        invoiceId: query.invoiceId,
        status: query.status ? (query.status as PaymentStatus) : undefined,
      },
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      ...pageArgs(query),
      where,
      include: paymentInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payment.count({ where }),
  ]);
  return paginated(rows.map(toView), total, query);
}

// ---------- Accountant dashboard ----------
// paidAt is stored as UTC with no time zone. To get the Nepal calendar day it has to be read as UTC
// first and then converted: a single AT TIME ZONE would treat it as already being Nepal time.

const TREND_DAYS = 30;

/** Read often, and costly once there are years of payments. A new payment clears these. */
const FINANCE_CACHE = 'finance:';

export const collectionsSummary = () => cached(`${FINANCE_CACHE}summary`, loadCollectionsSummary);
export const outstandingByProgram = () =>
  cached(`${FINANCE_CACHE}outstanding`, loadOutstandingByProgram);
export const collectionsTrend = () => cached(`${FINANCE_CACHE}trend`, loadCollectionsTrend);

async function loadCollectionsSummary() {
  const today = todayInNepal();
  const rows = await prisma.$queryRaw<{ today: bigint | null; month: bigint | null }[]>`
    SELECT
      SUM(CASE WHEN ("paidAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kathmandu')::date = ${today}::date
          THEN "amountPaisa" ELSE 0 END) AS today,
      SUM(CASE WHEN date_trunc('month', "paidAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kathmandu') = date_trunc('month', ${today}::date)
          THEN "amountPaisa" ELSE 0 END) AS month
    FROM "Payment" WHERE status = 'SUCCESS'
  `;
  return {
    todayPaisa: Number(rows[0]?.today ?? 0),
    monthPaisa: Number(rows[0]?.month ?? 0),
  };
}

async function loadOutstandingByProgram() {
  const rows = await prisma.$queryRaw<
    { code: string; name: string; outstanding: bigint; invoices: bigint }[]
  >`
    SELECT p.code, p.name,
      SUM(GREATEST(0, i."totalPaisa" + i."finePaisa" - i."discountPaisa" - i."paidPaisa")) AS outstanding,
      COUNT(*) AS invoices
    FROM "Invoice" i
    JOIN "Semester" s ON s.id = i."semesterId"
    JOIN "Program" p ON p.id = s."programId"
    WHERE i.status NOT IN ('PAID', 'CANCELLED')
    GROUP BY p.code, p.name
    ORDER BY p.code
  `;
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    outstandingPaisa: Number(row.outstanding),
    invoices: Number(row.invoices),
  }));
}

/** Every one of the last 30 days, with nothing-collected days as zero, so time reads true. */
async function loadCollectionsTrend() {
  const from = addDays(todayInNepal(), 1 - TREND_DAYS);
  const rows = await prisma.$queryRaw<{ date: Date; total: bigint }[]>`
    SELECT ("paidAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kathmandu')::date AS date,
      SUM("amountPaisa") AS total
    FROM "Payment"
    WHERE status = 'SUCCESS'
      AND ("paidAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kathmandu')::date >= ${from}::date
    GROUP BY 1
  `;
  const totals = new Map(
    rows.map((row) => [row.date.toISOString().slice(0, 10), Number(row.total)]),
  );
  return Array.from({ length: TREND_DAYS }, (_, index) => {
    const date = addDays(from, index);
    return { date, totalPaisa: totals.get(date) ?? 0 };
  });
}
