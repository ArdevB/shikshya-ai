import type { Prisma } from '@prisma/client';
import {
  calculateFine,
  csvCell,
  daysBetween,
  deriveInvoiceStatus,
  formatNpr,
  outstandingPaisa,
  type DiscountBody,
  type FeeHeadBody,
  type FeeStructureBody,
  type FineRuleBody,
  type GenerateInvoicesBody,
  type InvoiceStatus,
  type InvoiceView,
  type ManualInvoiceBody,
  type PaginationQuery,
} from '@shikshya/shared';
import { writeAudit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { nextNumber } from '../lib/numbering.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';
import { dateFromIso, todayInNepal } from '../lib/time.js';
import type { CurrentUser } from '../middleware/auth.js';
import { notifySafely, notifyStudentsAndParents } from './notification.service.js';
import { canAccessFinance, isFinanceStaff } from './scope.js';

const iso = (date: Date) => date.toISOString().slice(0, 10);

// ---------- Fee heads, structures and fine rules ----------

export const feeHeads = {
  list: async (query: PaginationQuery) => {
    const [rows, total] = await Promise.all([
      prisma.feeHead.findMany({ ...pageArgs(query), orderBy: { name: 'asc' } }),
      prisma.feeHead.count(),
    ]);
    return paginated(rows, total, query);
  },
  get: (id: string) => prisma.feeHead.findUniqueOrThrow({ where: { id } }),
  create: (data: FeeHeadBody) => prisma.feeHead.create({ data }),
  update: (id: string, data: FeeHeadBody) => prisma.feeHead.update({ where: { id }, data }),
  remove: (id: string) => prisma.feeHead.delete({ where: { id } }),
};

const structureInclude = {
  program: { select: { id: true, name: true, code: true } },
  academicYear: { select: { id: true, name: true } },
  items: { include: { feeHead: { select: { id: true, name: true, code: true } } } },
} as const;

const itemRows = (body: FeeStructureBody) =>
  body.items.map((item) => ({ feeHeadId: item.feeHeadId, amountPaisa: item.amount }));

export const feeStructures = {
  list: async (query: PaginationQuery) => {
    const [rows, total] = await Promise.all([
      prisma.feeStructure.findMany({
        ...pageArgs(query),
        include: structureInclude,
        orderBy: [{ program: { code: 'asc' } }, { semesterNumber: 'asc' }],
      }),
      prisma.feeStructure.count(),
    ]);
    return paginated(rows, total, query);
  },
  get: (id: string) =>
    prisma.feeStructure.findUniqueOrThrow({ where: { id }, include: structureInclude }),
  create: (body: FeeStructureBody) =>
    prisma.feeStructure.create({
      data: {
        programId: body.programId,
        academicYearId: body.academicYearId,
        semesterNumber: body.semesterNumber,
        items: { create: itemRows(body) },
      },
      include: structureInclude,
    }),
  /** Invoices keep their own copies of the amounts, so editing this does not change them. */
  update: (id: string, body: FeeStructureBody) =>
    prisma.$transaction(async (tx) => {
      await tx.feeStructureItem.deleteMany({ where: { feeStructureId: id } });
      return tx.feeStructure.update({
        where: { id },
        data: {
          programId: body.programId,
          academicYearId: body.academicYearId,
          semesterNumber: body.semesterNumber,
          items: { create: itemRows(body) },
        },
        include: structureInclude,
      });
    }),
  remove: (id: string) => prisma.feeStructure.delete({ where: { id } }),
};

const fineRuleData = (body: FineRuleBody) => ({
  name: body.name,
  type: body.type,
  amountPaisa: body.amount,
  graceDays: body.graceDays,
  maxPaisa: body.max ?? null,
});

export const fineRules = {
  list: async (query: PaginationQuery) => {
    const [rows, total] = await Promise.all([
      prisma.fineRule.findMany({ ...pageArgs(query), orderBy: { name: 'asc' } }),
      prisma.fineRule.count(),
    ]);
    return paginated(rows, total, query);
  },
  get: (id: string) => prisma.fineRule.findUniqueOrThrow({ where: { id } }),
  create: (body: FineRuleBody) => prisma.fineRule.create({ data: fineRuleData(body) }),
  update: (id: string, body: FineRuleBody) =>
    prisma.fineRule.update({ where: { id }, data: fineRuleData(body) }),
  remove: (id: string) => prisma.fineRule.delete({ where: { id } }),
};

// ---------- Invoices ----------

const invoiceInclude = {
  student: {
    select: {
      id: true,
      rollNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  semester: { select: { number: true, program: { select: { code: true } } } },
  items: { include: { feeHead: { select: { name: true } } } },
} as const;

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export function toInvoiceView(row: InvoiceRow): InvoiceView {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    studentId: row.studentId,
    studentName: `${row.student.user.firstName} ${row.student.user.lastName}`,
    rollNumber: row.student.rollNumber,
    semesterNumber: row.semester.number,
    programCode: row.semester.program.code,
    issueDate: row.issueDate.toISOString(),
    dueDate: row.dueDate.toISOString(),
    status: row.status,
    totalPaisa: row.totalPaisa,
    paidPaisa: row.paidPaisa,
    finePaisa: row.finePaisa,
    discountPaisa: row.discountPaisa,
    outstandingPaisa: outstandingPaisa(row),
    items: row.items.map((item) => ({
      id: item.id,
      feeHeadName: item.feeHead.name,
      description: item.description,
      amountPaisa: item.amountPaisa,
    })),
  };
}

/** Students see their own, parents their children's, finance staff everyone's. */
async function visibleInvoices(user: CurrentUser): Promise<Prisma.InvoiceWhereInput> {
  if (isFinanceStaff(user)) return {};
  if (user.role === 'STUDENT') return { student: { userId: user.id } };
  if (user.role === 'PARENT') {
    return { student: { parents: { some: { parent: { userId: user.id } } } } };
  }
  throw forbidden();
}

export async function listInvoices(
  user: CurrentUser,
  query: PaginationQuery & {
    status?: string;
    studentId?: string;
    semesterId?: string;
    search?: string;
  },
) {
  const where: Prisma.InvoiceWhereInput = {
    AND: [
      await visibleInvoices(user),
      {
        status: query.status ? (query.status as InvoiceStatus) : undefined,
        studentId: query.studentId,
        semesterId: query.semesterId,
        ...(query.search
          ? {
              OR: [
                { invoiceNumber: { contains: query.search, mode: 'insensitive' as const } },
                {
                  student: {
                    rollNumber: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
                {
                  student: {
                    user: { firstName: { contains: query.search, mode: 'insensitive' as const } },
                  },
                },
                {
                  student: {
                    user: { lastName: { contains: query.search, mode: 'insensitive' as const } },
                  },
                },
              ],
            }
          : {}),
      },
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      ...pageArgs(query),
      where,
      include: invoiceInclude,
      orderBy: [{ issueDate: 'desc' }, { invoiceNumber: 'desc' }],
    }),
    prisma.invoice.count({ where }),
  ]);
  return paginated(rows.map(toInvoiceView), total, query);
}

export async function getInvoice(user: CurrentUser, id: string) {
  const row = await prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
  // Check access first, so an id cannot be probed.
  if (!row) {
    if (!isFinanceStaff(user)) throw forbidden();
    throw notFound('Invoice');
  }
  if (!(await canAccessFinance(user, row.studentId))) throw forbidden();
  return toInvoiceView(row);
}

const invoiceNotice = (invoice: { invoiceNumber: string; totalPaisa: number; dueDate: Date }) => ({
  title: 'New invoice',
  body: `Invoice ${invoice.invoiceNumber} for ${formatNpr(invoice.totalPaisa)} is due on ${iso(invoice.dueDate)}.`,
  path: 'fees',
});

/**
 * Creates one invoice per enrolled student from the semester's fee structure. A student who
 * already has an invoice from this structure is skipped, in the code and by a database rule,
 * so running this twice, or twice at the same moment, creates no duplicates.
 */
export async function generateInvoices(user: CurrentUser, body: GenerateInvoicesBody) {
  const semester = await prisma.semester.findUnique({ where: { id: body.semesterId } });
  if (!semester) throw notFound('Semester');

  const structure = await prisma.feeStructure.findUnique({
    where: {
      programId_semesterNumber_academicYearId: {
        programId: semester.programId,
        semesterNumber: semester.number,
        academicYearId: semester.academicYearId,
      },
    },
    include: { items: { include: { feeHead: true } } },
  });
  if (!structure) {
    throw badRequest('There is no fee structure for this program, semester and academic year');
  }
  if (structure.items.length === 0) throw badRequest('This fee structure has no fees in it');

  const enrollments = await prisma.enrollment.findMany({
    where: { status: 'ACTIVE', section: { semesterId: semester.id } },
    select: { studentId: true },
  });
  const existing = await prisma.invoice.findMany({
    where: { feeStructureId: structure.id },
    select: { studentId: true },
  });
  const invoiced = new Set(existing.map((invoice) => invoice.studentId));
  const toCreate = [...new Set(enrollments.map((e) => e.studentId))].filter(
    (id) => !invoiced.has(id),
  );

  const totalPaisa = structure.items.reduce((sum, item) => sum + item.amountPaisa, 0);
  const today = todayInNepal();
  const dueDate = dateFromIso(body.dueDate);

  const created = await prisma.$transaction(
    async (tx) => {
      const invoices = [];
      for (const studentId of toCreate) {
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: await nextNumber(tx, 'SHK', Number(today.slice(0, 4))),
            studentId,
            semesterId: semester.id,
            feeStructureId: structure.id,
            issueDate: dateFromIso(today),
            dueDate,
            totalPaisa,
            items: {
              create: structure.items.map((item) => ({
                feeHeadId: item.feeHeadId,
                description: item.feeHead.name,
                amountPaisa: item.amountPaisa,
              })),
            },
          },
        });
        await writeAudit(
          {
            actorId: user.id,
            action: 'INVOICE_GENERATE',
            entity: 'Invoice',
            entityId: invoice.id,
            after: { studentId, totalPaisa },
          },
          tx,
        );
        invoices.push(invoice);
      }
      return invoices;
    },
    { timeout: 120_000 },
  );

  await notifySafely(async () => {
    for (const invoice of created) {
      await notifyStudentsAndParents(
        [invoice.studentId],
        'INVOICE_ISSUED',
        invoiceNotice(invoice),
      );
    }
  });

  return { created: created.length, skipped: invoiced.size };
}

export async function createManualInvoice(user: CurrentUser, body: ManualInvoiceBody) {
  const today = todayInNepal();
  const totalPaisa = body.items.reduce((sum, item) => sum + item.amount, 0);
  const created = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: await nextNumber(tx, 'SHK', Number(today.slice(0, 4))),
        studentId: body.studentId,
        semesterId: body.semesterId,
        issueDate: dateFromIso(today),
        dueDate: dateFromIso(body.dueDate),
        totalPaisa,
        items: {
          create: body.items.map((item) => ({
            feeHeadId: item.feeHeadId,
            description: item.description,
            amountPaisa: item.amount,
          })),
        },
      },
      include: invoiceInclude,
    });
    await writeAudit(
      {
        actorId: user.id,
        action: 'INVOICE_CREATE',
        entity: 'Invoice',
        entityId: invoice.id,
        after: { studentId: body.studentId, totalPaisa },
      },
      tx,
    );
    return invoice;
  });
  await notifySafely(() =>
    notifyStudentsAndParents([created.studentId], 'INVOICE_ISSUED', invoiceNotice(created)),
  );
  return toInvoiceView(created);
}

/** Applies a new set of amounts, recalculating the status from them. */
async function saveAmounts(
  tx: Prisma.TransactionClient,
  invoice: Prisma.InvoiceGetPayload<object>,
  change: Partial<Pick<typeof invoice, 'discountPaisa' | 'finePaisa' | 'paidPaisa'>>,
) {
  const next = { ...invoice, ...change };
  const status = deriveInvoiceStatus({ ...next, dueDate: iso(next.dueDate) }, todayInNepal());
  return tx.invoice.update({
    where: { id: invoice.id },
    data: { ...change, status },
    include: invoiceInclude,
  });
}

/** A discount or scholarship replaces any earlier one, and needs a reason in the audit log. */
export async function applyDiscount(user: CurrentUser, id: string, body: DiscountBody) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw notFound('Invoice');
  if (invoice.status === 'CANCELLED') throw conflict('This invoice has been cancelled');
  if (body.amount > invoice.totalPaisa + invoice.finePaisa - invoice.paidPaisa) {
    throw badRequest('The discount is more than what is left to pay', [
      { path: 'amount', message: 'More than what is left to pay' },
    ]);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const row = await saveAmounts(tx, invoice, { discountPaisa: body.amount });
    await writeAudit(
      {
        actorId: user.id,
        action: 'INVOICE_DISCOUNT',
        entity: 'Invoice',
        entityId: id,
        before: { discountPaisa: invoice.discountPaisa },
        after: { discountPaisa: body.amount, reason: body.reason },
      },
      tx,
    );
    return row;
  });
  return toInvoiceView(updated);
}

export async function cancelInvoice(user: CurrentUser, id: string, reason: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw notFound('Invoice');
  if (invoice.paidPaisa > 0) {
    throw conflict('This invoice has payments on it, so it cannot be cancelled');
  }
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.invoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: invoiceInclude,
    });
    await writeAudit(
      {
        actorId: user.id,
        action: 'INVOICE_CANCEL',
        entity: 'Invoice',
        entityId: id,
        before: { status: invoice.status },
        after: { status: 'CANCELLED', reason },
      },
      tx,
    );
    return row;
  });
  return toInvoiceView(updated);
}

// ---------- The daily job ----------

/**
 * Marks late invoices overdue and sets their fines. A fine is recalculated from the due date
 * each time rather than added to, so running the job twice in a day changes nothing.
 */
export async function applyOverdueAndFines(today = todayInNepal()) {
  const [invoices, rules] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { lt: dateFromIso(today) } },
    }),
    prisma.fineRule.findMany(),
  ]);

  let becameOverdue = 0;
  for (const invoice of invoices) {
    const daysLate = daysBetween(iso(invoice.dueDate), today);
    const finePaisa = rules.reduce(
      (sum, rule) =>
        sum +
        calculateFine(
          {
            type: rule.type,
            amountPaisa: rule.amountPaisa,
            graceDays: rule.graceDays,
            maxPaisa: rule.maxPaisa,
          },
          daysLate,
        ),
      0,
    );
    const status = deriveInvoiceStatus(
      { ...invoice, finePaisa, dueDate: iso(invoice.dueDate) },
      today,
    );
    if (finePaisa === invoice.finePaisa && status === invoice.status) continue;

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id: invoice.id }, data: { finePaisa, status } });
      await writeAudit(
        {
          actorId: null,
          action: 'INVOICE_OVERDUE_JOB',
          entity: 'Invoice',
          entityId: invoice.id,
          before: { finePaisa: invoice.finePaisa, status: invoice.status },
          after: { finePaisa, status },
        },
        tx,
      );
    });

    if (status === 'OVERDUE' && invoice.status !== 'OVERDUE') {
      becameOverdue += 1;
      await notifySafely(() =>
        notifyStudentsAndParents([invoice.studentId], 'INVOICE_OVERDUE', {
          title: 'Invoice overdue',
          body: `Invoice ${invoice.invoiceNumber} is overdue. Please pay it as soon as you can.`,
          path: 'fees',
        }),
      );
    }
  }
  return { checked: invoices.length, becameOverdue };
}

// ---------- Reports ----------

export async function outstandingCsv() {
  const invoices = await prisma.invoice.findMany({
    where: { status: { notIn: ['PAID', 'CANCELLED'] } },
    include: invoiceInclude,
    orderBy: { dueDate: 'asc' },
  });
  const header = [
    'Invoice',
    'Roll number',
    'Student',
    'Program',
    'Semester',
    'Due date',
    'Status',
    'Total (NPR)',
    'Fine (NPR)',
    'Discount (NPR)',
    'Paid (NPR)',
    'Outstanding (NPR)',
  ];
  const rupees = (paisa: number) => (paisa / 100).toFixed(2);
  const rows = invoices.map(toInvoiceView).map((invoice) => [
    invoice.invoiceNumber,
    invoice.rollNumber,
    invoice.studentName,
    invoice.programCode,
    invoice.semesterNumber,
    invoice.dueDate.slice(0, 10),
    invoice.status,
    rupees(invoice.totalPaisa),
    rupees(invoice.finePaisa),
    rupees(invoice.discountPaisa),
    rupees(invoice.paidPaisa),
    rupees(invoice.outstandingPaisa),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
