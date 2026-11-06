import { z } from 'zod';
import { ROOM_TYPES } from '../enums.js';
import { paginationQuery } from './common.js';

export const roomBody = z.object({
  name: z.string().trim().min(1, 'Required').max(60),
  capacity: z.coerce.number().int().min(1, 'Must be at least 1').max(2000),
  type: z.enum(ROOM_TYPES),
});
export type RoomBody = z.infer<typeof roomBody>;

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:mm');

export const timeSlotBody = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    startTime: clockTime,
    endTime: clockTime,
    label: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((value) => value || undefined),
  })
  .refine((slot) => slot.startTime < slot.endTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });
export type TimeSlotBody = z.infer<typeof timeSlotBody>;

export const timeSlotListQuery = paginationQuery.extend({
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
});

export const timetableEntryBody = z.object({
  courseOfferingId: z.string().min(1, 'Choose a course'),
  roomId: z.string().min(1, 'Choose a room'),
  timeSlotId: z.string().min(1, 'Choose a time'),
});
export type TimetableEntryBody = z.infer<typeof timetableEntryBody>;

export const timetableQuery = z
  .object({
    sectionId: z.string().optional(),
    teacherId: z.string().optional(),
    roomId: z.string().optional(),
  })
  .refine((q) => Boolean(q.sectionId || q.teacherId || q.roomId), {
    message: 'Give a sectionId, teacherId or roomId',
  });

export type ClashType = 'ROOM' | 'TEACHER' | 'SECTION';

export interface TimetableClash {
  type: ClashType;
  /** The two entries that collide. */
  entryIds: [string, string];
  timeSlotId: string;
  message?: string;
}

export interface TimetableEntryView {
  id: string;
  courseOfferingId: string;
  roomId: string;
  timeSlotId: string;
  semesterId: string;
  courseCode: string;
  courseTitle: string;
  sectionId: string;
  sectionName: string;
  teacherId: string;
  teacherName: string;
  roomName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface TimetableSlotView {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string | null;
}

export interface WeeklyTimetable {
  slots: TimetableSlotView[];
  entries: TimetableEntryView[];
}
