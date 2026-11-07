import { z } from 'zod';
import {
  FINE_TYPES,
  rupeesToPaisa,
  type InvoiceStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '../finance.js';
import { dateString, paginationQuery } from './common.js';

/** Staff type rupees, the database stores paisa. */
const rupees = (label = 'an amount') =>
  z.union([z.string(), z.number()]).transform((value, ctx) => {
    const paisa = rupeesToPaisa(value);
    if (paisa === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Enter ${label} in rupees, like 1500 or 1500.50`,
      });
      return z.NEVER;
    }
    return paisa;
  });

const positiveRupees = rupees().refine((paisa) => paisa > 0, 'Must be more than 0');

export const feeHeadBody = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  code: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(20)
    .transform((value) => value.toUpperCase()),
});
export type FeeHeadBody = z.infer<typeof feeHeadBody>;

export const feeStructureBody = z
  .object({
    programId: z.string().min(1, 'Choose a program'),
    academicYearId: z.string().min(1, 'Choose an academic year'),
    semesterNumber: z.coerce.number().int().min(1).max(12),
    items: z
      .array(z.object({ feeHeadId: z.string().min(1, 'Choose a fee'), amount: positiveRupees }))
      .min(1, 'Add at least one fee'),
  })
  .refine((body) => new Set(body.items.map((i) => i.feeHeadId)).size === body.items.length, {
    message: 'The same fee appears twice',
    path: ['items'],
  });
export type FeeStructureBody = z.infer<typeof feeStructureBody>;

export const fineRuleBody = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  type: z.enum(FINE_TYPES),
  amount: positiveRupees,
  graceDays: z.coerce.number().int().min(0).max(365),
  max: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    positiveRupees.optional(),
  ),
});
export type FineRuleBody = z.infer<typeof fineRuleBody>;

export const generateInvoicesBody = z.object({
  semesterId: z.string().min(1, 'Choose a semester'),
  dueDate: dateString,
});
export type GenerateInvoicesBody = z.infer<typeof generateInvoicesBody>;

export const manualInvoiceBody = z.object({
  studentId: z.string().min(1, 'Choose a student'),
  semesterId: z.string().min(1, 'Choose a semester'),
  dueDate: dateString,
  items: z
    .array(
      z.object({
        feeHeadId: z.string().min(1, 'Choose a fee'),
        description: z.string().trim().min(1, 'Required').max(160),
        amount: positiveRupees,
      }),
    )
    .min(1, 'Add at least one item'),
});
export type ManualInvoiceBody = z.infer<typeof manualInvoiceBody>;

export const discountBody = z.object({
  amount: rupees(),
  reason: z.string().trim().min(3, 'Give a reason').max(255),
});
export type DiscountBody = z.infer<typeof discountBody>;

export const cancelInvoiceBody = z.object({
  reason: z.string().trim().min(3, 'Give a reason').max(255),
});

export const invoiceListQuery = paginationQuery.extend({
  status: z.string().optional(),
  studentId: z.string().optional(),
  semesterId: z.string().optional(),
  search: z.string().trim().max(100).optional(),
});

export const initiatePaymentBody = z.object({
  invoiceId: z.string().min(1),
  method: z.enum(['ESEWA', 'KHALTI']),
});
export type InitiatePaymentBody = z.infer<typeof initiatePaymentBody>;

export const manualPaymentBody = z.object({
  invoiceId: z.string().min(1),
  method: z.enum(['CASH', 'BANK']),
  amount: positiveRupees,
  reference: z.string().trim().max(120).optional(),
});
export type ManualPaymentBody = z.infer<typeof manualPaymentBody>;

export const paymentListQuery = paginationQuery.extend({
  invoiceId: z.string().optional(),
  status: z.string().optional(),
});

export interface InvoiceItemView {
  id: string;
  feeHeadName: string;
  description: string;
  amountPaisa: number;
}

export interface InvoiceView {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  semesterNumber: number;
  programCode: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  totalPaisa: number;
  paidPaisa: number;
  finePaisa: number;
  discountPaisa: number;
  outstandingPaisa: number;
  items: InvoiceItemView[];
}

export interface PaymentView {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amountPaisa: number;
  method: PaymentMethod;
  status: PaymentStatus;
  gatewayRef: string | null;
  receiptNumber: string | null;
  paidAt: string | null;
  createdAt: string;
  studentName: string;
}

/**
 * What the browser does next. Khalti gives a page to go to. eSewa needs a form POSTed to it,
 * because the signed fields travel in the form.
 */
export interface InitiatePaymentResult {
  paymentId: string;
  redirectUrl?: string;
  formAction?: string;
  formFields?: Record<string, string>;
}

export const institutionSettingsBody = z.object({
  name: z.string().trim().min(1, 'Required').max(160),
  address: z.string().trim().min(1, 'Required').max(255),
  phone: z.string().trim().max(40).default(''),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).default(''),
  principalName: z.string().trim().max(120).default(''),
  /** A small image as a data URL, so PDFs can embed it directly. */
  logoDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, 'Use a PNG or JPG image')
    .max(700_000, 'Use an image under 500 KB')
    .nullable()
    .optional(),
});
export type InstitutionSettingsBody = z.infer<typeof institutionSettingsBody>;

export const studentPhotoBody = z.object({
  photoDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, 'Use a PNG or JPG image')
    .max(700_000, 'Use an image under 500 KB'),
});

export const NOTIFICATION_TYPES = [
  'NOTICE_PUBLISHED',
  'ATTENDANCE_LOW',
  'RESULT_PUBLISHED',
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_DUE_SOON',
  'INVOICE_ISSUED',
  'INVOICE_OVERDUE',
  'PAYMENT_SUCCESS',
  'STUDY_SUPPORT',
  'QUIZ_PUBLISHED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  NOTICE_PUBLISHED: 'New notices',
  ATTENDANCE_LOW: 'Attendance falls below 75%',
  RESULT_PUBLISHED: 'Results published',
  ASSIGNMENT_CREATED: 'New assignments',
  ASSIGNMENT_DUE_SOON: 'Assignments due within 24 hours',
  INVOICE_ISSUED: 'New invoices',
  INVOICE_OVERDUE: 'Overdue invoices',
  PAYMENT_SUCCESS: 'Successful payments',
  STUDY_SUPPORT: 'Study support reminders',
  QUIZ_PUBLISHED: 'New quizzes',
};

export const NOTIFICATION_CHANNELS = ['EMAIL', 'IN_APP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const notificationPreferenceBody = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  type: z.enum(NOTIFICATION_TYPES),
  enabled: z.boolean(),
});

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
