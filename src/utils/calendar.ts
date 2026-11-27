import { AdventTip } from '../types/advent';

/** All dates handled as ISO strings "YYYY-MM-DD" (no timezone pitfalls). */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const dt = toUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

/** Difference in whole days (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** 1 = lundi ... 7 = dimanche */
export function isoWeekday(iso: string): number {
  const d = toUTC(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isWorkingDay(iso: string): boolean {
  return isoWeekday(iso) <= 5;
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Working days (Mon-Fri) between start and end, inclusive. */
export function listWorkingDays(start: string, end: string): string[] {
  if (!isISODate(start) || !isISODate(end) || end < start) return [];
  const out: string[] = [];
  let cur = start;
  // hard cap for safety
  for (let i = 0; i < 400 && cur <= end; i++) {
    if (isWorkingDay(cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Group dates by ISO week (Monday key). */
export function groupByWeek(dates: string[]): { monday: string; dates: string[] }[] {
  const groups: { monday: string; dates: string[] }[] = [];
  for (const d of dates) {
    const monday = addDays(d, -(isoWeekday(d) - 1));
    const last = groups[groups.length - 1];
    if (last && last.monday === monday) last.dates.push(d);
    else groups.push({ monday, dates: [d] });
  }
  return groups;
}

/** Today's date in Europe/Paris from the local clock (fallback only — server date wins). */
export function parisTodayISO(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const iso = `${get('year')}-${get('month')}-${get('day')}`;
    if (isISODate(iso)) return iso;
  } catch {
    // ignore
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Day-of-month "cursor" used by the grid components:
 *  - 0 when the view date is before the calendar's month (everything locked)
 *  - 32 when after the calendar's month (everything past)
 *  - otherwise the day of month of the view date.
 */
export function computeActiveDay(viewDate: string, calendarStart: string): number {
  const viewYM = viewDate.slice(0, 7);
  const calYM = calendarStart.slice(0, 7);
  if (viewYM < calYM) return 0;
  if (viewYM > calYM) return 32;
  return dayOfMonth(viewDate);
}

export function isTipLocked(tip: AdventTip, activeDay: number): boolean {
  return Boolean(tip.placeholder) || tip.day > activeDay;
}

const LONG_FMT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const DAY_MONTH_FMT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const SHORT_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const WEEKDAY_SHORT_FMT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  timeZone: 'UTC',
});

/** "mardi 1 décembre 2026" */
export function formatLongFR(iso: string): string {
  return isISODate(iso) ? LONG_FMT.format(toUTC(iso)) : iso;
}

/** "mardi 1 décembre" */
export function formatDayMonthFR(iso: string): string {
  return isISODate(iso) ? DAY_MONTH_FMT.format(toUTC(iso)) : iso;
}

/** "1 déc." */
export function formatShortFR(iso: string): string {
  return isISODate(iso) ? SHORT_FMT.format(toUTC(iso)) : iso;
}

/** "mar." */
export function formatWeekdayShortFR(iso: string): string {
  return isISODate(iso) ? WEEKDAY_SHORT_FMT.format(toUTC(iso)) : iso;
}

/** "27/11 14:05" from a timestamp, in Paris time. */
export function formatDateTimeFR(ts: string | null | undefined): string {
  if (!ts) return '—';
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Paris calendar date of a timestamp. */
export function timestampToParisISO(ts: string): string {
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dt);
  } catch {
    return dt.toISOString().slice(0, 10);
  }
}
