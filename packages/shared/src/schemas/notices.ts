import { z } from 'zod';
import { AUDIENCES, type Audience } from '../enums.js';
import { paginationQuery } from './common.js';

const emptyToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value);

const optionalId = z.preprocess(emptyToUndefined, z.string().optional());
const optionalDateTime = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Choose a valid date and time')
    .optional(),
);

const audienceFields = {
  audience: z.enum(AUDIENCES),
  programId: optionalId,
  sectionId: optionalId,
};

interface Target {
  audience: Audience;
  programId?: string;
  sectionId?: string;
}

const programIsChosen = (value: Target) => value.audience !== 'PROGRAM' || Boolean(value.programId);
const sectionIsChosen = (value: Target) => value.audience !== 'SECTION' || Boolean(value.sectionId);
const programError = { message: 'Choose a program', path: ['programId'] };
const sectionError = { message: 'Choose a section', path: ['sectionId'] };

export const noticeBody = z
  .object({
    title: z.string().trim().min(1, 'Required').max(160),
    body: z.string().trim().min(1, 'Required').max(20000),
    ...audienceFields,
    isPinned: z.boolean().default(false),
    publishAt: optionalDateTime,
    expiresAt: optionalDateTime,
  })
  .refine(programIsChosen, programError)
  .refine(sectionIsChosen, sectionError)
  .refine(
    (notice) =>
      !notice.expiresAt ||
      new Date(notice.expiresAt) > (notice.publishAt ? new Date(notice.publishAt) : new Date()),
    { message: 'Expiry must be after the notice is published', path: ['expiresAt'] },
  );
export type NoticeBody = z.infer<typeof noticeBody>;

export const noticeListQuery = paginationQuery.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export interface NoticeView {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  programId: string | null;
  sectionId: string | null;
  isPinned: boolean;
  publishAt: string;
  expiresAt: string | null;
  createdById: string;
  authorName: string;
  isRead: boolean;
}

export const eventBody = z
  .object({
    title: z.string().trim().min(1, 'Required').max(160),
    description: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
    startAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Choose a start'),
    endAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Choose an end'),
    location: z.preprocess(emptyToUndefined, z.string().trim().max(160).optional()),
    ...audienceFields,
  })
  .refine(programIsChosen, programError)
  .refine(sectionIsChosen, sectionError)
  .refine((event) => new Date(event.startAt) <= new Date(event.endAt), {
    message: 'End cannot be before start',
    path: ['endAt'],
  });
export type EventBody = z.infer<typeof eventBody>;

export const eventListQuery = z.object({
  from: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Give a valid from date'),
  to: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Give a valid to date'),
});

export interface EventView {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  audience: Audience;
  programId: string | null;
  sectionId: string | null;
}
