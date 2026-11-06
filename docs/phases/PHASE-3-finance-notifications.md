# Phase 3 — Fees, Payments, PDFs & Notifications

**Goal:** admins define fees and issue invoices; students and parents pay online with eSewa or Khalti; the system generates marksheets, receipts and ID cards as PDFs; users get email and in-app notifications.

Prerequisite: Phase 2 acceptance criteria pass. Read `CLAUDE.md` first. All money is integer paisa.

---

## 1. Data models (Prisma)

```
FeeHead        id, name ("Tuition", "Exam", "Library", "Lab"), code
FeeStructure   id, programId, semesterNumber, academicYearId, items (FeeStructureItem[])
FeeStructureItem id, feeStructureId, feeHeadId, amountPaisa
Invoice        id, invoiceNumber (unique, e.g. SHK-2026-000123), studentId, semesterId, issueDate, dueDate,
               status (UNPAID|PARTIAL|PAID|OVERDUE|CANCELLED), totalPaisa, paidPaisa, finePaisa, discountPaisa
InvoiceItem    id, invoiceId, feeHeadId, description, amountPaisa
FineRule       id, name, type (FIXED|PER_DAY), amountPaisa, graceDays, maxPaisa?
Payment        id, invoiceId, amountPaisa, method (ESEWA|KHALTI|CASH|BANK), status (INITIATED|SUCCESS|FAILED|REFUNDED),
               gatewayRef?, gatewayPayload (Json?), receiptNumber?, paidAt?, recordedById?
Notification   id, userId, type, title, body, link?, readAt?, createdAt
NotificationPreference userId, channel (EMAIL|IN_APP), type, enabled
```

## 2. Fees

- [ ] CRUD fee heads, fee structures, fine rules [ACCOUNTANT, ADMIN]
- [ ] `POST /invoices/generate` — bulk-generate invoices for a semester from its fee structure (idempotent: skip students who already have one)
- [ ] Manual invoice, discount/scholarship adjustment (requires a reason → AuditLog), cancel invoice
- [ ] Daily job (node-cron) marks overdue invoices and applies fine rules
- [ ] `POST /payments/manual` for cash/bank payments [ACCOUNTANT]
- [ ] Student/parent: list invoices, view details, "Pay now"
- [ ] Accountant dashboard: collected today/this month, outstanding by program, overdue list, chart of collections over time
- [ ] Export outstanding dues to CSV

## 3. eSewa & Khalti

**Before writing code, read the current official developer docs for eSewa ePay v2 and Khalti ePayment (KPG-2) and follow them exactly.** APIs change — do not rely on memory. Use their sandbox/test credentials only; put all keys and URLs in env vars.

Implement behind one interface:

```ts
interface PaymentGateway {
  initiate(invoice, amountPaisa, returnUrl): Promise<{ redirectUrl?: string; formFields?: Record<string,string> }>;
  verify(callbackParams): Promise<{ success: boolean; gatewayRef: string; amountPaisa: number; raw: unknown }>;
}
```

- [ ] `POST /payments/initiate` { invoiceId, method } → creates `Payment(INITIATED)`, returns redirect info
- [ ] Callback/return routes per gateway → **always verify server-to-server** with the gateway's lookup/status API; never trust the redirect query string alone
- [ ] Check verified amount equals the expected amount; handle duplicate callbacks idempotently
- [ ] On success: update Payment, Invoice `paidPaisa`/status, generate receipt number, send notification
- [ ] Frontend success/failure pages that poll payment status
- [ ] Tests with mocked gateway responses: success, failure, amount mismatch, duplicate callback

## 4. PDF generation

Use Puppeteer rendering HTML templates (keep templates in `apps/api/src/pdf/templates`, styled with the brand colors and the institution's name/logo from settings).

- [ ] Payment receipt
- [ ] Invoice
- [ ] Semester marksheet (from published `Result`)
- [ ] Transcript (all published semesters + CGPA)
- [ ] Student ID card (front with photo, name, program, roll number, QR code containing a verification URL)
- [ ] `GET /pdf/receipt/:paymentId`, `/pdf/marksheet/:studentId/:semesterId`, etc., with the same access rules as the underlying data
- [ ] Add an `InstitutionSettings` table (name, address, logo, phone, email, principal name) editable by SUPER_ADMIN

## 5. Notifications

- [ ] `NotificationService.notify(userIds, type, payload)` writes in-app notifications and sends email when the user's preference allows
- [ ] Email via Nodemailer (SMTP from env; use Ethereal or Mailpit in dev), HTML templates
- [ ] Real-time in-app delivery with Socket.io (authenticated with the access token); bell icon with unread count and dropdown
- [ ] Triggers: new notice, attendance falls below 75%, result published, assignment created / due in 24h, invoice issued, invoice overdue, payment success
- [ ] Preferences page for users to turn email types on/off
- [ ] SMS: define an `SmsProvider` interface with a console implementation only (a real Nepali SMS gateway can be plugged in later)

## 6. Acceptance criteria

- [ ] Bulk invoice generation is idempotent (running twice creates no duplicates), tested
- [ ] Fine calculation matches unit tests for FIXED and PER_DAY with grace days and caps
- [ ] A full sandbox payment through eSewa and through Khalti marks the invoice PAID and produces a receipt PDF
- [ ] A tampered callback (wrong amount or unverifiable ref) never marks an invoice paid, tested
- [ ] Marksheet and transcript PDFs show the same GPA/CGPA as the API
- [ ] A student cannot download another student's receipt or marksheet (403), tested
- [ ] Notifications appear in real time and respect preferences
