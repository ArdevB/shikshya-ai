import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NEPAL_TIME_ZONE = 'Asia/Kathmandu';

/** Today's calendar date in Nepal as YYYY-MM-DD, whatever the device's time zone is. */
export function todayInNepal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: NEPAL_TIME_ZONE }).format(new Date());
}

/** "2026-03-15T00:00:00.000Z" becomes "2026-03-15", for date inputs. */
export const toDateInput = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

/** A moment in time, shown in Nepal time. */
export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: NEPAL_TIME_ZONE,
  }).format(new Date(value));
}

/** The calendar day a moment falls on in Nepal, as YYYY-MM-DD. */
export function nepalDateKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: NEPAL_TIME_ZONE }).format(new Date(value));
}

/** An ISO time as a local value for a datetime-local input. */
export function toDateTimeInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Calendar dates are stored as UTC midnight, so they are shown in UTC to keep the same day. */
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}
