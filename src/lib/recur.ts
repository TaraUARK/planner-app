// Repeating tasks and appointments.
//
// A repeating item is stored ONCE, with an iCalendar RRULE (e.g.
// "FREQ=WEEKLY;BYDAY=MO,WE") and its first date. Each occurrence is
// identified by the item's id + its ORIGINAL date (the date the rule
// produced). Changes to a single occurrence — done, moved, skipped, or an
// edited title — are stored as an "exception" keyed by that original date.
//
// Dates are handled as UTC-midnight Date objects inside the rrule library so
// daylight-saving changes can never shift a day.

import { addDays, differenceInCalendarDays, getDaysInMonth } from 'date-fns';
import { RRule, Weekday, type Options } from 'rrule';
import { fromISODate, toISODate } from './dates';
import type { Appointment, ISODate, OccurrenceException, Task } from './types';

// ---------------------------------------------------------------------------
// Low-level rule helpers
// ---------------------------------------------------------------------------
const utc = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date): ISODate => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dayShift = (d: ISODate, n: number) => toISODate(addDays(fromISODate(d), n));

function parse(rrule: string): Partial<Options> {
  return RRule.parseString(rrule.replace(/^RRULE:/, ''));
}

function build(rrule: string, start: ISODate): RRule {
  return new RRule({ ...parse(rrule), dtstart: utc(start) });
}

function serialize(opts: Partial<Options>): string {
  const { dtstart: _d, tzid: _t, ...rest } = opts;
  void _d;
  void _t;
  return RRule.optionsToString(rest).replace(/^RRULE:/, '');
}

/** Original dates the rule produces between from and to (inclusive). */
export function occurrences(rrule: string, start: ISODate, from: ISODate, to: ISODate): ISODate[] {
  const lo = from > start ? from : start;
  if (to < lo) return [];
  return build(rrule, start).between(utc(lo), utc(to), true).map(iso);
}

export function occursOn(rrule: string, start: ISODate, date: ISODate): boolean {
  return occurrences(rrule, start, date, date).length === 1;
}

/** The last date the rule can produce (its UNTIL), or null if it never ends. */
export function ruleUntil(rrule: string): ISODate | null {
  const u = parse(rrule).until;
  return u ? iso(u) : null;
}

/** Same rule, but ending on `until` (inclusive), or never (null). */
export function withUntil(rrule: string, until: ISODate | null): string {
  const opts = parse(rrule);
  delete opts.until;
  delete opts.count;
  if (until) opts.until = utc(until);
  return serialize(opts);
}

// ---------------------------------------------------------------------------
// The Repeat editor's settings  <->  RRULE
// ---------------------------------------------------------------------------
/** 'everyother' = every other day (stored as daily, every 2 days). */
export type Freq = 'none' | 'daily' | 'everyother' | 'weekly' | 'monthly' | 'yearly';
export interface RepeatSpec {
  freq: Freq;
  interval: number;
  /** Weekly: days of the week, 0 = Monday … 6 = Sunday. */
  weekdays: number[];
  /** Monthly: same date each month, the n-th weekday ("third Thursday"), or the last weekday. */
  monthly: 'date' | 'nth' | 'last';
  until: ISODate | null;
}

/** 0 = Monday … 6 = Sunday (the rrule library's numbering). */
const weekdayOf = (d: ISODate) => (fromISODate(d).getDay() + 6) % 7;
/** Which occurrence of its weekday this date is in its month (1–5). */
const nthOf = (d: ISODate) => Math.ceil(fromISODate(d).getDate() / 7);
/** True if this is the last such weekday of the month. */
const isLastOf = (d: ISODate) => fromISODate(d).getDate() + 7 > getDaysInMonth(fromISODate(d));

export function defaultSpec(start: ISODate): RepeatSpec {
  return { freq: 'none', interval: 1, weekdays: [weekdayOf(start)], monthly: 'date', until: null };
}

export function specToRRule(spec: RepeatSpec, start: ISODate): string | null {
  if (spec.freq === 'none') return null;
  const opts: Partial<Options> = { interval: Math.max(1, Math.floor(spec.interval) || 1) };
  if (spec.freq === 'daily') opts.freq = RRule.DAILY;
  if (spec.freq === 'everyother') {
    opts.freq = RRule.DAILY;
    opts.interval = 2;
  }
  if (spec.freq === 'yearly') opts.freq = RRule.YEARLY;
  if (spec.freq === 'weekly') {
    opts.freq = RRule.WEEKLY;
    const days = spec.weekdays.length ? spec.weekdays : [weekdayOf(start)];
    opts.byweekday = [...new Set(days)].sort().map((d) => new Weekday(d));
  }
  if (spec.freq === 'monthly') {
    opts.freq = RRule.MONTHLY;
    const wd = new Weekday(weekdayOf(start));
    if (spec.monthly === 'date') opts.bymonthday = [fromISODate(start).getDate()];
    else opts.byweekday = [wd.nth(spec.monthly === 'last' ? -1 : nthOf(start))];
  }
  if (opts.interval === 1) delete opts.interval;
  if (spec.until) opts.until = utc(spec.until);
  return serialize(opts);
}

export function rruleToSpec(rrule: string | null, start: ISODate): RepeatSpec {
  const spec = defaultSpec(start);
  if (!rrule) return spec;
  const o = parse(rrule);
  spec.interval = o.interval ?? 1;
  spec.until = o.until ? iso(o.until) : null;
  const wds = (o.byweekday ?? []) as (Weekday | number)[];
  const asWd = (w: Weekday | number) => (typeof w === 'number' ? new Weekday(w) : w);
  switch (o.freq) {
    case RRule.DAILY:
      spec.freq = spec.interval === 2 ? 'everyother' : 'daily';
      if (spec.freq === 'everyother') spec.interval = 1;
      break;
    case RRule.WEEKLY:
      spec.freq = 'weekly';
      if (wds.length) spec.weekdays = wds.map((w) => asWd(w).weekday);
      break;
    case RRule.MONTHLY:
      spec.freq = 'monthly';
      if (wds.length) spec.monthly = asWd(wds[0]).n === -1 ? 'last' : 'nth';
      break;
    case RRule.YEARLY:
      spec.freq = 'yearly';
      break;
  }
  return spec;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth'];

/** Plain-English summary, e.g. "Every 2 weeks on Monday, Wednesday until Dec 31, 2026". */
export function describeSpec(spec: RepeatSpec, start: ISODate): string {
  if (spec.freq === 'none') return 'Does not repeat';
  if (spec.freq === 'everyother') {
    const until = spec.until
      ? ` until ${fromISODate(spec.until).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
      : '';
    return `Every other day${until}`;
  }
  const n = spec.interval;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[spec.freq as 'daily'];
  let text = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  if (spec.freq === 'weekly') text += ` on ${[...spec.weekdays].sort().map((d) => DAY_NAMES[d]).join(', ')}`;
  if (spec.freq === 'monthly') {
    const day = DAY_NAMES[weekdayOf(start)];
    text +=
      spec.monthly === 'date'
        ? ` on day ${fromISODate(start).getDate()}`
        : ` on the ${spec.monthly === 'last' ? 'last' : ORDINAL[nthOf(start)]} ${day}`;
  }
  if (spec.until) text += ` until ${fromISODate(spec.until).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return text;
}

export const monthlyChoices = (start: ISODate) => ({
  nthLabel: `On the ${ORDINAL[nthOf(start)]} ${DAY_NAMES[weekdayOf(start)]}`,
  lastLabel: isLastOf(start) ? `On the last ${DAY_NAMES[weekdayOf(start)]}` : null,
  dateLabel: `On day ${fromISODate(start).getDate()}`,
});

// ---------------------------------------------------------------------------
// Expanding stored items into the occurrences shown on screen
// ---------------------------------------------------------------------------
/** One task as shown on a given day (a one-time task, or one occurrence of a repeating one). */
export interface TaskOcc extends Task {
  originalDate: ISODate;
  repeating: boolean;
  /** Stable key for saved positions: task:<id>@<original date>. */
  key: string;
}

export interface ApptOcc extends Appointment {
  originalDate: ISODate;
  repeating: boolean;
  key: string;
}

export const taskOccKey = (id: string, originalDate: ISODate) => `task:${id}@${originalDate}`;
export const apptOccKey = (id: string, originalDate: ISODate) => `appt:${id}@${originalDate}`;
export const exceptionId = (type: 'task' | 'appointment', id: string, originalDate: ISODate) =>
  `${type}:${id}@${originalDate}`;

export function oneTimeTask(t: Task): TaskOcc {
  return { ...t, originalDate: t.date, repeating: false, key: taskOccKey(t.id, t.date) };
}
export function oneTimeAppt(a: Appointment): ApptOcc {
  return { ...a, originalDate: a.start_date, repeating: false, key: apptOccKey(a.id, a.start_date) };
}

const TASK_OVERRIDES = ['title', 'notes', 'project_id'] as const;
const APPT_OVERRIDES = ['title', 'location', 'notes', 'all_day', 'start_time', 'end_time'] as const;

function pick(overrides: Record<string, unknown> | undefined, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (overrides && k in overrides) out[k] = overrides[k];
  return out;
}

function byOriginal(exceptions: OccurrenceException[], type: 'task' | 'appointment', id: string) {
  const m = new Map<ISODate, OccurrenceException>();
  for (const e of exceptions) if (!e.deleted_at && e.item_type === type && e.item_id === id) m.set(e.original_date, e);
  return m;
}

/** Occurrences of repeating tasks whose (possibly moved) date falls between from and to. */
export function expandTasks(series: Task[], exceptions: OccurrenceException[], from: ISODate, to: ISODate): TaskOcc[] {
  const out: TaskOcc[] = [];
  for (const s of series) {
    if (!s.rrule || s.deleted_at) continue;
    const ex = byOriginal(exceptions, 'task', s.id);
    const originals = new Set(occurrences(s.rrule, s.date, from, to));
    // Occurrences moved INTO this range from elsewhere.
    for (const e of ex.values()) {
      if (e.new_date && e.new_date >= from && e.new_date <= to && occursOn(s.rrule, s.date, e.original_date)) {
        originals.add(e.original_date);
      }
    }
    for (const orig of originals) {
      const e = ex.get(orig);
      if (e?.skipped) continue;
      const date = e?.new_date ?? orig;
      if (date < from || date > to) continue;
      out.push({
        ...s,
        ...(pick(e?.overrides, TASK_OVERRIDES) as Partial<Task>),
        date,
        done: e?.done ?? false,
        originalDate: orig,
        repeating: true,
        key: taskOccKey(s.id, orig),
      });
    }
  }
  return out;
}

/** Occurrences of repeating appointments that overlap from..to (multi-day ones keep their length). */
export function expandAppointments(
  series: Appointment[],
  exceptions: OccurrenceException[],
  from: ISODate,
  to: ISODate,
): ApptOcc[] {
  const out: ApptOcc[] = [];
  for (const s of series) {
    if (!s.rrule || s.deleted_at) continue;
    const length = differenceInCalendarDays(fromISODate(s.end_date), fromISODate(s.start_date));
    const ex = byOriginal(exceptions, 'appointment', s.id);
    const originals = new Set(occurrences(s.rrule, s.start_date, dayShift(from, -length), to));
    for (const e of ex.values()) {
      if (
        e.new_date &&
        e.new_date <= to &&
        dayShift(e.new_date, length) >= from &&
        occursOn(s.rrule, s.start_date, e.original_date)
      ) {
        originals.add(e.original_date);
      }
    }
    for (const orig of originals) {
      const e = ex.get(orig);
      if (e?.skipped) continue;
      const start = e?.new_date ?? orig;
      const end = dayShift(start, length);
      if (end < from || start > to) continue;
      out.push({
        ...s,
        ...(pick(e?.overrides, APPT_OVERRIDES) as Partial<Appointment>),
        start_date: start,
        end_date: end,
        originalDate: orig,
        repeating: true,
        key: apptOccKey(s.id, orig),
      });
    }
  }
  return out;
}

/**
 * The single overdue occurrence of a repeating task: its most recent
 * occurrence before today that isn't done or skipped. Earlier missed ones
 * are not counted (so a missed daily task doesn't pile up).
 */
export function overdueOccurrence(
  s: Task,
  exceptions: OccurrenceException[],
  today: ISODate,
): TaskOcc | null {
  if (!s.rrule || s.deleted_at || s.date >= today) return null;
  const yesterday = dayShift(today, -1);
  const past = expandTasks([s], exceptions, s.date, yesterday);
  const open = past.filter((o) => !o.done).sort((a, b) => (a.date < b.date ? 1 : -1));
  return open[0] ?? null;
}
