// All calendar dates are plain 'YYYY-MM-DD' strings in the device's local
// time. Never convert them through UTC timestamps (that shifts days).

import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { ISODate } from './types';

export function toISODate(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd');
}

/** Local midnight of the given date. */
export function fromISODate(s: ISODate): Date {
  return parse(s, 'yyyy-MM-dd', new Date());
}

export function isISODate(s: string | undefined): s is ISODate {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(fromISODate(s));
}

export function todayISO(now = new Date()): ISODate {
  return toISODate(now);
}

/** Weeks run Monday → Sunday. */
export function weekStart(date: ISODate): ISODate {
  return toISODate(startOfWeek(fromISODate(date), { weekStartsOn: 1 }));
}

export function shiftDate(date: ISODate, view: 'month' | 'week' | 'day', step: number): ISODate {
  const d = fromISODate(date);
  if (view === 'month') return toISODate(addMonths(startOfMonth(d), step));
  if (view === 'week') return toISODate(addWeeks(d, step));
  return toISODate(addDays(d, step));
}

export function weekLabel(date: ISODate): string {
  const s = startOfWeek(fromISODate(date), { weekStartsOn: 1 });
  const e = endOfWeek(fromISODate(date), { weekStartsOn: 1 });
  if (s.getFullYear() !== e.getFullYear()) return `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`;
  if (s.getMonth() !== e.getMonth()) return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
  return `${format(s, 'MMM d')} – ${format(e, 'd, yyyy')}`;
}

export function monthLabel(date: ISODate): string {
  return format(fromISODate(date), 'MMMM yyyy');
}

export function dayLabel(date: ISODate): string {
  return format(fromISODate(date), 'EEEE, MMM d, yyyy');
}
