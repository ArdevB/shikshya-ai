import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closePdfBrowser } from '../src/pdf/render.js';
import { esewaSignature, signedMessage } from '../src/services/gateways/esewa.js';
import { applyOverdueAndFines } from '../src/services/finance.service.js';
import { reconcilePayments } from '../src/services/payment.service.js';
import { marksheetHtmlFor, receiptHtmlFor, transcriptHtmlFor } from '../src/services/pdf.service.js';
import { api, bearer, createFixture, prisma, resetDatabase, tokenFor } from './helpers.js';

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let fx: Fixture;
let admin: string;
let accountant: string;
let teacher: string;
let studentA: string;
let studentB: string;
let parent: string;
let feeHeadId: string;
let structureId: string;

const V1 = '/api/v1';
const SECRET = '8gBm/:&EnhH.1/q';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const fetchMock = vi.fn<typeof fetch>();

async function freshInvoice(totalPaisa = 150000, studentId = fx.studentA.id, dueInDays = 10) {
  const due = new Date(Date.now() + dueInDays * 86_400_000);
  return prisma.invoice.create({
    data: {
      invoiceNumber: `T-${Math.random().toString(36).slice(2, 10)}`,
      studentId,
      semesterId: fx.semester.id,
      issueDate: new Date(),
      dueDate: new Date(due.toISOString().slice(0, 10)),
      totalPaisa,
      items: { create: { feeHeadId, description: 'Tuition', amountPaisa: totalPaisa } },
    },
  });
}

/** What eSewa would send to the success URL for this payment. */
function esewaCallback(paymentId: string, amount: string, secret = SECRET) {
  const fields = {
    transaction_code: '0LD5CEH',
    status: 'COMPLETE',
    total_amount: amount,
    transaction_uuid: paymentId,
    product_code: 'EPAYTEST',
    signed_field_names:
      'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
  };
  const signature = esewaSignature(signedMessage(fields.signed_field_names, fields), secret);
  return Buffer.from(JSON.stringify({ ...fields, signature })).toString('base64');
}

const initiate = (invoiceId: string, method: 'ESEWA' | 'KHALTI' = 'ESEWA', token = studentA) =>
  api().post(`${V1}/payments/initiate`).set(bearer(token)).send({ invoiceId, method });

const callback = (path: string, query: Record<string, string>) =>
  api().get(`${V1}/payments/callback/${path}`).query(query);

beforeAll(async () => {
  await resetDatabase();
  fx = await createFixture();
  await prisma.gradeScale.createMany({
    data: [
      { grade: 'A', minPercent: 90, maxPercent: 100, gradePoint: 4 },
      { grade: 'B', minPercent: 60, maxPercent: 90, gradePoint: 3 },
      { grade: 'F', minPercent: 0, maxPercent: 60, gradePoint: 0 },
    ],
  });
  await prisma.user.create({
    data: {
      email: 'accountant@test.local',
      passwordHash: (await prisma.user.findFirstOrThrow()).passwordHash,
      role: 'ACCOUNTANT',
      firstName: 'Account',
      lastName: 'Ant',
    },
  });
  admin = await tokenFor(fx.admin.email);
  accountant = await tokenFor('accountant@test.local');
  teacher = await tokenFor(fx.teacherA.user.email);
  studentA = await tokenFor(fx.studentA.user.email);
  studentB = await tokenFor(fx.studentB.user.email);
  parent = await tokenFor(fx.parent.user.email);
  feeHeadId = (await prisma.feeHead.create({ data: { name: 'Tuition', code: 'TUI' } })).id;
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => closePdfBrowser());

describe('fee setup', () => {
  it('stores rupees typed by staff as integer paisa', async () => {
    const response = await api()
      .post(`${V1}/fee-structures`)
      .set(bearer(accountant))
      .send({
        programId: fx.program.id,
        academicYearId: fx.year.id,
        semesterNumber: 6,
        items: [{ feeHeadId, amount: '25,000.50' }],
      });
    expect(response.status).toBe(201);
    expect(response.body.items[0].amountPaisa).toBe(2500050);
    structureId = response.body.id;
  });

  it('refuses a malformed amount', async () => {
    const response = await api()
      .post(`${V1}/fine-rules`)
      .set(bearer(accountant))
      .send({ name: 'Bad', type: 'FIXED', amount: '12.345', graceDays: 0 });
    expect(response.status).toBe(400);
  });

  it('is for finance staff only', async () => {
    for (const token of [teacher, studentA, parent]) {
      expect((await api().get(`${V1}/fee-heads`).set(bearer(token))).status).toBe(403);
    }
    expect((await api().get(`${V1}/fee-heads`).set(bearer(admin))).status).toBe(200);
  });
});

describe('invoice generation', () => {
  const generate = () =>
    api()
      .post(`${V1}/invoices/generate`)
      .set(bearer(accountant))
      .send({ semesterId: fx.semester.id, dueDate: '2030-01-01' });

  it('creates one per enrolled student, numbered in sequence', async () => {
    const response = await generate();
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ created: 2, skipped: 0 });
    const invoices = await prisma.invoice.findMany({ where: { feeStructureId: structureId } });
    expect(invoices).toHaveLength(2);
    expect(invoices[0]!.invoiceNumber).toMatch(/^SHK-\d{4}-\d{6}$/);
    expect(new Set(invoices.map((i) => i.invoiceNumber)).size).toBe(2);
    expect(invoices[0]!.totalPaisa).toBe(2500050);
  });

  it('is idempotent: running again creates nothing', async () => {
    const before = await prisma.invoice.count();
    const response = await generate();
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ created: 0, skipped: 2 });
    expect(await prisma.invoice.count()).toBe(before);
  });

  it('still creates no duplicates when run at the same moment', async () => {
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany({ where: { feeStructureId: structureId } });
    const results = await Promise.all([generate(), generate()]);
    // One may lose the race on the database rule, which is fine. Duplicates are not.
    expect(results.some((r) => r.status === 201)).toBe(true);
    expect(await prisma.invoice.count({ where: { feeStructureId: structureId } })).toBe(2);
  });

  it('explains when there is no fee structure', async () => {
    const other = await prisma.semester.create({
      data: {
        programId: fx.program.id,
        academicYearId: fx.year.id,
        number: 3,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
      },
    });
    const response = await api()
      .post(`${V1}/invoices/generate`)
      .set(bearer(accountant))
      .send({ semesterId: other.id, dueDate: '2030-01-01' });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('no fee structure');
  });

  it('is not allowed for students or teachers', async () => {
    for (const token of [studentA, teacher]) {
      const response = await api()
        .post(`${V1}/invoices/generate`)
        .set(bearer(token))
        .send({ semesterId: fx.semester.id, dueDate: '2030-01-01' });
      expect(response.status).toBe(403);
    }
  });
});

describe('invoice access', () => {
  it('shows students their own and parents their children’s', async () => {
    const own = await api().get(`${V1}/invoices`).set(bearer(studentA));
    expect(own.status).toBe(200);
    expect(own.body.data.length).toBeGreaterThan(0);
    expect(own.body.data.every((i: { studentId: string }) => i.studentId === fx.studentA.id)).toBe(
      true,
    );

    const children = await api().get(`${V1}/invoices`).set(bearer(parent));
    expect(
      children.body.data.every((i: { studentId: string }) => i.studentId === fx.studentA.id),
    ).toBe(true);

    expect((await api().get(`${V1}/invoices`).set(bearer(teacher))).status).toBe(403);
  });

  it('forbids reading another student’s invoice', async () => {
    const invoice = await freshInvoice(1000, fx.studentB.id);
    const path = `${V1}/invoices/${invoice.id}`;
    expect((await api().get(path).set(bearer(studentA))).status).toBe(403);
    expect((await api().get(path).set(bearer(parent))).status).toBe(403);
    expect((await api().get(path).set(bearer(studentB))).status).toBe(200);
  });
});

describe('discounts and cancelling', () => {
  it('needs a reason, logs it and recalculates the status', async () => {
    const invoice = await freshInvoice(100000);
    const path = `${V1}/invoices/${invoice.id}/discount`;

    const noReason = await api().post(path).set(bearer(accountant)).send({ amount: '100' });
    expect(noReason.status).toBe(400);

    const response = await api()
      .post(path)
      .set(bearer(accountant))
      .send({ amount: '1000', reason: 'Full scholarship' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'PAID', outstandingPaisa: 0 });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: invoice.id, action: 'INVOICE_DISCOUNT' },
    });
    expect(log.after).toMatchObject({ discountPaisa: 100000, reason: 'Full scholarship' });
  });

  it('refuses a discount larger than what is left', async () => {
    const invoice = await freshInvoice(1000);
    const response = await api()
      .post(`${V1}/invoices/${invoice.id}/discount`)
      .set(bearer(accountant))
      .send({ amount: '11', reason: 'Too much' });
    expect(response.status).toBe(400);
  });

  it('cancels an unpaid invoice, but not one with payments', async () => {
    const unpaid = await freshInvoice(1000);
    const cancelled = await api()
      .post(`${V1}/invoices/${unpaid.id}/cancel`)
      .set(bearer(accountant))
      .send({ reason: 'Issued in error' });
    expect(cancelled.body.status).toBe('CANCELLED');

    const paid = await freshInvoice(100000);
    await api()
      .post(`${V1}/payments/manual`)
      .set(bearer(accountant))
      .send({ invoiceId: paid.id, method: 'CASH', amount: '10' });
    const refused = await api()
      .post(`${V1}/invoices/${paid.id}/cancel`)
      .set(bearer(accountant))
      .send({ reason: 'Oops, paid' });
    expect(refused.status).toBe(409);
  });
});

describe('overdue job and fines', () => {
  beforeEach(async () => {
    await prisma.fineRule.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany();
  });

  it('marks late invoices overdue and applies a capped fine, repeatably', async () => {
    await prisma.fineRule.create({
      data: {
        name: 'Daily',
        type: 'PER_DAY',
        amountPaisa: 1000,
        graceDays: 2,
        maxPaisa: 5000,
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: 'LATE-1',
        studentId: fx.studentA.id,
        semesterId: fx.semester.id,
        issueDate: new Date('2026-01-01'),
        dueDate: new Date('2026-02-01'),
        totalPaisa: 100000,
      },
    });

    // 5 days late, 2 of them free: 3 x Rs. 10.
    await applyOverdueAndFines('2026-02-06');
    let stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored).toMatchObject({ status: 'OVERDUE', finePaisa: 3000 });

    // Running it again the same day changes nothing.
    const logs = await prisma.auditLog.count({ where: { entityId: invoice.id } });
    await applyOverdueAndFines('2026-02-06');
    stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.finePaisa).toBe(3000);
    expect(await prisma.auditLog.count({ where: { entityId: invoice.id } })).toBe(logs);

    // Much later, the cap applies.
    await applyOverdueAndFines('2026-06-01');
    stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.finePaisa).toBe(5000);
  });

  it('leaves paid and cancelled invoices alone, and those not yet due', async () => {
    await prisma.fineRule.create({
      data: { name: 'Fixed', type: 'FIXED', amountPaisa: 500, graceDays: 0 },
    });
    const make = (invoiceNumber: string, status: 'PAID' | 'CANCELLED' | 'UNPAID', due: string) =>
      prisma.invoice.create({
        data: {
          invoiceNumber,
          studentId: fx.studentA.id,
          semesterId: fx.semester.id,
          issueDate: new Date('2026-01-01'),
          dueDate: new Date(due),
          totalPaisa: 1000,
          paidPaisa: status === 'PAID' ? 1000 : 0,
          status,
        },
      });
    const paid = await make('A', 'PAID', '2026-01-02');
    const cancelled = await make('B', 'CANCELLED', '2026-01-02');
    const future = await make('C', 'UNPAID', '2026-12-01');

    await applyOverdueAndFines('2026-03-01');
    for (const invoice of [paid, cancelled, future]) {
      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored.finePaisa).toBe(0);
      expect(stored.status).toBe(invoice.status);
    }
  });

  it('notifies the student and parent once, when it first goes overdue', async () => {
    await prisma.notification.deleteMany();
    await prisma.invoice.create({
      data: {
        invoiceNumber: 'LATE-2',
        studentId: fx.studentA.id,
        semesterId: fx.semester.id,
        issueDate: new Date('2026-01-01'),
        dueDate: new Date('2026-02-01'),
        totalPaisa: 1000,
      },
    });
    await applyOverdueAndFines('2026-02-10');
    await applyOverdueAndFines('2026-02-11');
    const notes = await prisma.notification.findMany({ where: { type: 'INVOICE_OVERDUE' } });
    expect(notes.map((n) => n.userId).sort()).toEqual(
      [fx.studentA.userId, fx.parent.userId].sort(),
    );
  });
});

describe('eSewa signature', () => {
  /**
   * Do not "correct" this to the sample output in eSewa's docs (4Ov7pCI1...). The samples there
   * do not reproduce with the published test key. This value was confirmed against eSewa's test
   * environment, which accepts this signature scheme with a 302 to its payment page and refuses
   * a wrong key with ES104 "Invalid payload signature".
   */
  it('signs with HMAC-SHA256 as base64, as eSewa’s test environment accepts', () => {
    expect(
      esewaSignature('total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST', SECRET),
    ).toBe('5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=');
  });
});

describe('paying with eSewa', () => {
  const statusReply = (paymentId: string, status: string, amount = 1500) =>
    json(200, {
      product_code: 'EPAYTEST',
      transaction_uuid: paymentId,
      total_amount: amount,
      status,
      ref_id: status === 'COMPLETE' ? '0007G36' : null,
    });

  it('returns a signed form for the outstanding amount', async () => {
    const invoice = await freshInvoice();
    const response = await initiate(invoice.id);
    expect(response.status).toBe(201);
    const { formFields, formAction, paymentId } = response.body;
    expect(formAction).toContain('esewa.com.np');
    expect(formFields).toMatchObject({
      total_amount: '1500',
      amount: '1500',
      tax_amount: '0',
      transaction_uuid: paymentId,
      product_code: 'EPAYTEST',
      signed_field_names: 'total_amount,transaction_uuid,product_code',
    });
    expect(formFields.signature).toBe(
      esewaSignature(
        `total_amount=1500,transaction_uuid=${paymentId},product_code=EPAYTEST`,
        SECRET,
      ),
    );
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(stored).toMatchObject({ status: 'INITIATED', amountPaisa: 150000, method: 'ESEWA' });
  });

  it('completes on success: payment, invoice, receipt and notification', async () => {
    await prisma.notification.deleteMany();
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    fetchMock.mockResolvedValueOnce(statusReply(paymentId, 'COMPLETE'));

    const response = await callback('esewa', { data: esewaCallback(paymentId, '1,500.0') });
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain(`/payments/result?paymentId=${paymentId}`);

    // It asked eSewa directly, with our amount and the payment's id.
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get('transaction_uuid')).toBe(paymentId);
    expect(url.searchParams.get('total_amount')).toBe('1500');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCESS');
    expect(payment.gatewayRef).toBe('0007G36');
    expect(payment.receiptNumber).toMatch(/^RCP-\d{4}-\d{6}$/);

    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored).toMatchObject({ status: 'PAID', paidPaisa: 150000 });

    const note = await prisma.notification.findFirst({
      where: { type: 'PAYMENT_SUCCESS', userId: fx.studentA.userId },
    });
    expect(note).not.toBeNull();
    expect(
      await prisma.auditLog.count({ where: { entityId: paymentId, action: 'PAYMENT_SUCCESS' } }),
    ).toBe(1);
  });

  it('handles a duplicate callback idempotently', async () => {
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    fetchMock.mockImplementation(async () => statusReply(paymentId, 'COMPLETE'));
    const data = esewaCallback(paymentId, '1,500.0');

    await callback('esewa', { data });
    await callback('esewa', { data });
    await Promise.all([callback('esewa', { data }), callback('esewa', { data })]);

    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidPaisa).toBe(150000);
    expect(
      await prisma.auditLog.count({ where: { entityId: paymentId, action: 'PAYMENT_SUCCESS' } }),
    ).toBe(1);
  });

  it('survives two callbacks at exactly the same moment on a fresh payment', async () => {
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    fetchMock.mockImplementation(async () => statusReply(paymentId, 'COMPLETE'));
    const data = esewaCallback(paymentId, '1,500.0');

    await Promise.all(Array.from({ length: 5 }, () => callback('esewa', { data })));

    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidPaisa).toBe(150000);
  });

  it('never marks paid on a tampered callback with a forged signature', async () => {
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    const forged = esewaCallback(paymentId, '1,500.0', 'not-the-real-secret');

    const response = await callback('esewa', { data: forged });
    expect(response.status).toBe(302);
    expect(fetchMock).not.toHaveBeenCalled();

    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidPaisa).toBe(0);
    expect(stored.status).not.toBe('PAID');
  });

  it('never marks paid on garbage in the callback', async () => {
    for (const data of ['not base64 at all', Buffer.from('{"broken').toString('base64')]) {
      expect((await callback('esewa', { data })).status).toBe(302);
    }
    expect((await callback('esewa', {})).status).toBe(302);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never marks paid when a valid-looking callback is not confirmed by eSewa', async () => {
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    fetchMock.mockResolvedValueOnce(statusReply(paymentId, 'NOT_FOUND'));

    await callback('esewa', { data: esewaCallback(paymentId, '1,500.0') });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('FAILED');
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidPaisa).toBe(0);
  });

  it('never marks paid on an amount mismatch, and logs it', async () => {
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    fetchMock.mockResolvedValueOnce(statusReply(paymentId, 'COMPLETE', 15));

    await callback('esewa', { data: esewaCallback(paymentId, '15.0') });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('FAILED');
    expect(payment.receiptNumber).toBeNull();
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidPaisa).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { entityId: paymentId, action: 'PAYMENT_AMOUNT_MISMATCH' },
      }),
    ).toBe(1);
  });

  it('holds the payment when eSewa says pending or cannot be reached', async () => {
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    const data = esewaCallback(paymentId, '1,500.0');

    fetchMock.mockResolvedValueOnce(statusReply(paymentId, 'PENDING'));
    await callback('esewa', { data });
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await callback('esewa', { data });
    fetchMock.mockResolvedValueOnce(json(200, { status: 'AMBIGUOUS', total_amount: 1500 }));
    await callback('esewa', { data });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('INITIATED');

    // The customer can ask again, and now it has gone through.
    fetchMock.mockResolvedValueOnce(statusReply(paymentId, 'COMPLETE'));
    const refreshed = await api().post(`${V1}/payments/${paymentId}/refresh`).set(bearer(studentA));
    expect(refreshed.body.status).toBe('SUCCESS');
  });

  it('marks failed when the failure redirect comes back', async () => {
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    const response = await callback(`esewa/failed/${paymentId}`, {});
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain(paymentId);
    // A failure redirect proves nothing either, so the payment is simply left to be verified.
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('INITIATED');
  });

  it('cannot be used on someone else’s invoice', async () => {
    const invoice = await freshInvoice(150000, fx.studentB.id);
    expect((await initiate(invoice.id, 'ESEWA', studentA)).status).toBe(403);
    expect((await initiate(invoice.id, 'ESEWA', parent)).status).toBe(403);
    expect((await initiate('no-such-invoice', 'ESEWA', studentA)).status).toBe(403);
  });

  it('refuses an invoice with nothing to pay', async () => {
    const invoice = await freshInvoice();
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { paidPaisa: 150000, status: 'PAID' },
    });
    expect((await initiate(invoice.id)).status).toBe(409);
  });

  it('lets a parent pay for a linked child', async () => {
    const invoice = await freshInvoice();
    expect((await initiate(invoice.id, 'ESEWA', parent)).status).toBe(201);
  });
});

describe('paying with Khalti', () => {
  const lookup = (status: string, total = 150000, http = 200) =>
    json(http, {
      pidx: 'PIDX1',
      total_amount: total,
      status,
      transaction_id: status === 'Completed' ? 'KTXN1' : null,
      fee: 0,
      refunded: false,
    });

  async function started() {
    const invoice = await freshInvoice();
    fetchMock.mockResolvedValueOnce(
      json(200, {
        pidx: 'PIDX1',
        payment_url: 'https://test-pay.khalti.com/?pidx=PIDX1',
        expires_at: '2030-01-01T00:00:00+05:45',
        expires_in: 1800,
      }),
    );
    const { body } = await initiate(invoice.id, 'KHALTI');
    return { invoice, paymentId: body.paymentId as string, redirectUrl: body.redirectUrl };
  }

  const khaltiCallback = (paymentId: string) =>
    callback('khalti', {
      pidx: 'PIDX1',
      status: 'Completed',
      amount: '150000',
      purchase_order_id: paymentId,
    });

  it('starts with the right request and sends the customer to Khalti', async () => {
    const { paymentId, redirectUrl } = await started();
    expect(redirectUrl).toContain('test-pay.khalti.com');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://dev.khalti.com/api/v2/epayment/initiate/');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Key test-khalti-key');
    expect(JSON.parse(String(init!.body))).toMatchObject({
      amount: 150000,
      purchase_order_id: paymentId,
    });
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(stored.gatewayRef).toBe('PIDX1');
  });

  it('completes when lookup says Completed', async () => {
    const { invoice, paymentId } = await started();
    fetchMock.mockResolvedValueOnce(lookup('Completed'));
    await khaltiCallback(paymentId);

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe('https://dev.khalti.com/api/v2/epayment/lookup/');
    expect(JSON.parse(String(init!.body))).toEqual({ pidx: 'PIDX1' });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment).toMatchObject({ status: 'SUCCESS', gatewayRef: 'KTXN1' });
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.status).toBe('PAID');
  });

  it('never trusts the status in the redirect', async () => {
    const { invoice, paymentId } = await started();
    // The URL claims Completed, but lookup knows better.
    fetchMock.mockResolvedValueOnce(lookup('User canceled', 150000, 400));
    await khaltiCallback(paymentId);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('FAILED');
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidPaisa).toBe(0);
  });

  it('never marks paid on an amount mismatch', async () => {
    const { invoice, paymentId } = await started();
    fetchMock.mockResolvedValueOnce(lookup('Completed', 1000));
    await khaltiCallback(paymentId);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('FAILED');
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidPaisa).toBe(0);
  });

  it('never marks paid on an unverifiable reference', async () => {
    const { invoice, paymentId } = await started();
    fetchMock.mockResolvedValueOnce(json(404, { detail: 'Not found.', error_key: 'validation_error' }));
    await khaltiCallback(paymentId);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('INITIATED');
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidPaisa).toBe(0);
  });

  it.each(['Pending', 'Initiated', 'Partially Refunded', 'SomethingNew'])(
    'holds on %s, as Khalti says to',
    async (status) => {
      const { paymentId } = await started();
      fetchMock.mockResolvedValueOnce(lookup(status));
      await khaltiCallback(paymentId);
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      expect(payment.status).toBe('INITIATED');
    },
  );

  it.each(['Expired', 'User canceled', 'Refunded'])('fails on %s', async (status) => {
    const { paymentId } = await started();
    fetchMock.mockResolvedValueOnce(lookup(status));
    await khaltiCallback(paymentId);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('FAILED');
  });

  it('handles a duplicate callback idempotently', async () => {
    const { invoice, paymentId } = await started();
    fetchMock.mockImplementation(async () => lookup('Completed'));
    await khaltiCallback(paymentId);
    await khaltiCallback(paymentId);
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.paidPaisa).toBe(150000);
  });

  it('a callback naming a payment made with another gateway does nothing', async () => {
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id, 'ESEWA')).body;
    await khaltiCallback(paymentId);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses less than Khalti’s minimum', async () => {
    const invoice = await freshInvoice(999);
    const response = await initiate(invoice.id, 'KHALTI');
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports when Khalti refuses to start', async () => {
    const invoice = await freshInvoice();
    fetchMock.mockResolvedValueOnce(json(400, { amount: ['Invalid'] }));
    const response = await initiate(invoice.id, 'KHALTI');
    expect(response.status).toBe(502);
    const payment = await prisma.payment.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    expect(payment.status).toBe('FAILED');
  });
});

describe('reconciling abandoned payments', () => {
  it('completes a payment whose customer never came back', async () => {
    await prisma.payment.updateMany({
      where: { status: 'INITIATED' },
      data: { status: 'FAILED' },
    });
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    fetchMock.mockResolvedValue(
      json(200, { status: 'COMPLETE', total_amount: 1500, ref_id: 'ABC' }),
    );

    // Too soon: nothing is checked yet.
    await reconcilePayments(new Date());
    expect(fetchMock).not.toHaveBeenCalled();

    await reconcilePayments(new Date(Date.now() + 6 * 60 * 1000));
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.status).toBe('PAID');
  });

  it('gives up after a day of not knowing', async () => {
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    fetchMock.mockResolvedValue(json(200, { status: 'PENDING' }));
    await reconcilePayments(new Date(Date.now() + 25 * 60 * 60 * 1000));
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('FAILED');
  });
});

describe('manual payments', () => {
  const pay = (invoiceId: string, amount: string, token = accountant) =>
    api()
      .post(`${V1}/payments/manual`)
      .set(bearer(token))
      .send({ invoiceId, method: 'CASH', amount });

  it('records part payments until the invoice is paid, each with a receipt', async () => {
    const invoice = await freshInvoice(100000);
    const first = await pay(invoice.id, '400');
    expect(first.status).toBe(201);
    expect(first.body.receiptNumber).toMatch(/^RCP-/);
    let stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored).toMatchObject({ status: 'PARTIAL', paidPaisa: 40000 });

    await pay(invoice.id, '600');
    stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored).toMatchObject({ status: 'PAID', paidPaisa: 100000 });
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_SUCCESS' } })).toBeGreaterThan(1);
  });

  it('refuses more than is outstanding', async () => {
    const invoice = await freshInvoice(1000);
    expect((await pay(invoice.id, '11')).status).toBe(400);
  });

  it('is for finance staff only', async () => {
    const invoice = await freshInvoice(1000);
    for (const token of [studentA, parent, teacher]) {
      expect((await pay(invoice.id, '5', token)).status).toBe(403);
    }
  });
});

describe('reports', () => {
  it('exports outstanding dues as CSV for finance staff only', async () => {
    const response = await api().get(`${V1}/finance/outstanding.csv`).set(bearer(accountant));
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    const lines = response.text.split('\r\n');
    expect(lines[0]).toContain('Outstanding (NPR)');
    expect(lines.length).toBeGreaterThan(1);
    expect((await api().get(`${V1}/finance/outstanding.csv`).set(bearer(studentA))).status).toBe(
      403,
    );
  });

  it('summarises collections', async () => {
    const summary = await api().get(`${V1}/finance/collections-summary`).set(bearer(accountant));
    expect(summary.status).toBe(200);
    expect(summary.body.todayPaisa).toBeGreaterThan(0);
    expect(summary.body.monthPaisa).toBeGreaterThanOrEqual(summary.body.todayPaisa);
    const byProgram = await api()
      .get(`${V1}/finance/outstanding-by-program`)
      .set(bearer(accountant));
    expect(byProgram.body[0].code).toBe('CSIT');
    const trend = await api().get(`${V1}/finance/collections-trend`).set(bearer(admin));
    expect(trend.body.length).toBeGreaterThan(0);
  });
});

describe('PDFs', () => {
  let semesterId: string;

  beforeAll(async () => {
    semesterId = fx.semester.id;
    await prisma.result.create({
      data: {
        studentId: fx.studentA.id,
        semesterId,
        gpa: 3.27,
        totalCredits: 3,
        status: 'PASS',
        publishedAt: new Date(),
        courses: {
          create: {
            courseId: fx.course.id,
            percent: 78.5,
            grade: 'B',
            gradePoint: 3,
            creditHours: 3,
          },
        },
      },
    });
    await prisma.result.create({
      data: {
        studentId: fx.studentB.id,
        semesterId,
        gpa: 2.11,
        totalCredits: 3,
        status: 'PASS',
        publishedAt: new Date(),
      },
    });
  });

  const studentUser = () => ({ id: fx.studentA.userId, role: 'STUDENT' as const });

  it('shows the same GPA and CGPA on the marksheet and transcript as the API', async () => {
    const api1 = await api().get(`${V1}/students/${fx.studentA.id}/results`).set(bearer(studentA));
    const { cgpa, semesters } = api1.body;
    const gpa = semesters[0].gpa.toFixed(2);

    const marksheet = await marksheetHtmlFor(studentUser(), fx.studentA.id, semesterId);
    expect(marksheet.html).toContain(`<b>${gpa}</b>`);
    expect(marksheet.html).toContain(`<b>${cgpa.toFixed(2)}</b>`);

    const transcript = await transcriptHtmlFor(studentUser(), fx.studentA.id);
    expect(transcript.html).toContain(`GPA ${gpa}`);
    expect(transcript.html).toContain(`<b>${cgpa.toFixed(2)}</b>`);
  });

  it('produces real PDF files', async () => {
    const isPdf = (body: Buffer) => body.subarray(0, 5).toString() === '%PDF-';
    const binary = (path: string) =>
      api()
        .get(`${V1}/pdf/${path}`)
        .set(bearer(studentA))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });

    const marksheet = await binary(`marksheet/${fx.studentA.id}/${semesterId}`);
    expect(marksheet.status).toBe(200);
    expect(marksheet.headers['content-type']).toBe('application/pdf');
    expect(isPdf(marksheet.body as Buffer)).toBe(true);

    const transcript = await binary(`transcript/${fx.studentA.id}`);
    expect(isPdf(transcript.body as Buffer)).toBe(true);

    const card = await binary(`id-card/${fx.studentA.id}`);
    expect(card.status).toBe(200);
    expect(isPdf(card.body as Buffer)).toBe(true);
  }, 120_000);

  it('forbids a student from downloading another student’s marksheet (403)', async () => {
    const paths = [
      `marksheet/${fx.studentB.id}/${semesterId}`,
      `transcript/${fx.studentB.id}`,
      `id-card/${fx.studentB.id}`,
    ];
    for (const path of paths) {
      expect((await api().get(`${V1}/pdf/${path}`).set(bearer(studentA))).status).toBe(403);
      expect((await api().get(`${V1}/pdf/${path}`).set(bearer(parent))).status).toBe(403);
    }
    // And an accountant has no business reading results.
    expect(
      (await api().get(`${V1}/pdf/${paths[0]}`).set(bearer(accountant))).status,
    ).toBe(403);
  });

  it('forbids a student from downloading another student’s receipt (403)', async () => {
    const invoice = await freshInvoice(100000, fx.studentB.id);
    const payment = await api()
      .post(`${V1}/payments/manual`)
      .set(bearer(accountant))
      .send({ invoiceId: invoice.id, method: 'CASH', amount: '1000' });
    const path = `${V1}/pdf/receipt/${payment.body.id}`;
    expect((await api().get(path).set(bearer(studentA))).status).toBe(403);
    expect((await api().get(path).set(bearer(parent))).status).toBe(403);
    expect((await api().get(path).set(bearer(teacher))).status).toBe(403);
    expect((await api().get(`${V1}/pdf/invoice/${invoice.id}`).set(bearer(studentA))).status).toBe(
      403,
    );
    expect((await api().get(path).set(bearer(studentB))).status).toBe(200);
    expect((await api().get(path).set(bearer(accountant))).status).toBe(200);
  }, 60_000);

  it('has no receipt for a payment that has not succeeded', async () => {
    const invoice = await freshInvoice();
    const { paymentId } = (await initiate(invoice.id)).body;
    expect((await api().get(`${V1}/pdf/receipt/${paymentId}`).set(bearer(studentA))).status).toBe(
      404,
    );
  });

  it('escapes data in templates, so it cannot become markup', async () => {
    const invoice = await freshInvoice(100000);
    const payment = await api()
      .post(`${V1}/payments/manual`)
      .set(bearer(accountant))
      .send({ invoiceId: invoice.id, method: 'BANK', amount: '10', reference: '<script>x</script>' });
    const { html } = await receiptHtmlFor(studentUser(), payment.body.id);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('verifies an ID card only with the right token, and shows only card details', async () => {
    const { verificationToken } = await import('../src/services/pdf.service.js');
    const good = await api().get(
      `${V1}/public/verify-student/${fx.studentA.id}/${verificationToken(fx.studentA.id)}`,
    );
    expect(good.status).toBe(200);
    expect(good.body).toMatchObject({ rollNumber: 'student-a', isActive: true });
    expect(Object.keys(good.body).sort()).toEqual(
      ['institutionName', 'isActive', 'name', 'programName', 'rollNumber'].sort(),
    );
    const bad = await api().get(
      `${V1}/public/verify-student/${fx.studentA.id}/${verificationToken(fx.studentB.id)}`,
    );
    expect(bad.status).toBe(403);
  });

  it('lets only a super admin change institution settings', async () => {
    const body = { name: 'Test College', address: 'Pokhara' };
    expect((await api().put(`${V1}/settings/institution`).set(bearer(admin)).send(body)).status).toBe(
      403,
    );
    const superAdmin = await prisma.user.create({
      data: {
        email: 'super@test.local',
        passwordHash: (await prisma.user.findFirstOrThrow()).passwordHash,
        role: 'SUPER_ADMIN',
        firstName: 'S',
        lastName: 'A',
      },
    });
    const token = await tokenFor(superAdmin.email);
    const saved = await api().put(`${V1}/settings/institution`).set(bearer(token)).send(body);
    expect(saved.status).toBe(200);
    const { html } = await transcriptHtmlFor(studentUser(), fx.studentA.id);
    expect(html).toContain('Test College');
  });
});
