const NEPAL = 'Asia/Kathmandu';

/** Today's calendar date in Nepal as YYYY-MM-DD, whatever time zone the server runs in. */
export function todayInNepal(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: NEPAL }).format(now);
}

/** The same date as a UTC midnight, which is how calendar dates are stored. */
export const dateFromIso = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The current time in Nepal as HH:mm, to compare with TimeSlot times. */
export function clockInNepal(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: NEPAL,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

/** A stored calendar date's day of the week, with Sunday as 0 to match TimeSlot.dayOfWeek. */
export const dayOfWeek = (iso: string) => dateFromIso(iso).getUTCDay();

/** The ISO date a number of days before (negative) or after (positive) the given one. */
export function addDays(iso: string, days: number) {
  const date = dateFromIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
