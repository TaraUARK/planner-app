// Built-in US holidays, computed from rules (no internet needed).
//   * 11 federal holidays on their actual dates
//   * "(observed)" day off when a fixed-date federal holiday falls on a
//     weekend: Saturday → Friday before, Sunday → Monday after
//   * Common observances: Valentine's Day, Easter, Mother's Day,
//     Father's Day, Halloween

import { addDays } from 'date-fns';
import { toISODate } from './dates';
import type { Appointment, ISODate } from './types';

export interface Holiday {
  /** Stable id for this holiday in this year, e.g. 'thanksgiving-2026' or 'independence-day-2026-observed'. */
  slug: string;
  name: string;
  date: ISODate;
  observed: boolean;
}

/** n-th (1-based) given weekday (0 = Sunday) of a month; n = -1 means the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  if (n === -1) {
    const last = new Date(year, month + 1, 0);
    return addDays(last, -((last.getDay() - weekday + 7) % 7));
  }
  const first = new Date(year, month, 1);
  return addDays(first, ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
}

/** Western (Gregorian) Easter Sunday — the "anonymous Gregorian" algorithm. */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function holidaysInYear(year: number): Holiday[] {
  const out: Holiday[] = [];
  const add = (name: string, d: Date, observed = false) =>
    out.push({
      slug: `${slugify(name)}-${year}${observed ? '-observed' : ''}`,
      name: observed ? `${name} (observed)` : name,
      date: toISODate(d),
      observed,
    });

  // Fixed-date federal holidays, with weekend "observed" days.
  const fixed: [string, number, number][] = [
    ["New Year's Day", 0, 1],
    ['Juneteenth', 5, 19],
    ['Independence Day', 6, 4],
    ['Veterans Day', 10, 11],
    ['Christmas Day', 11, 25],
  ];
  for (const [name, month, day] of fixed) {
    const d = new Date(year, month, day);
    add(name, d);
    if (d.getDay() === 6) add(name, addDays(d, -1), true); // Saturday → Friday
    if (d.getDay() === 0) add(name, addDays(d, 1), true); // Sunday → Monday
  }

  // Federal holidays on a set weekday.
  add('Martin Luther King Jr. Day', nthWeekday(year, 0, 1, 3)); // 3rd Monday of January
  add("Presidents' Day", nthWeekday(year, 1, 1, 3)); // 3rd Monday of February
  add('Memorial Day', nthWeekday(year, 4, 1, -1)); // last Monday of May
  add('Labor Day', nthWeekday(year, 8, 1, 1)); // 1st Monday of September
  add("Columbus Day / Indigenous Peoples' Day", nthWeekday(year, 9, 1, 2)); // 2nd Monday of October
  add('Thanksgiving', nthWeekday(year, 10, 4, 4)); // 4th Thursday of November

  // Observances.
  add("Valentine's Day", new Date(year, 1, 14));
  add('Easter', easter(year));
  add("Mother's Day", nthWeekday(year, 4, 0, 2)); // 2nd Sunday of May
  add("Father's Day", nthWeekday(year, 5, 0, 3)); // 3rd Sunday of June
  add('Halloween', new Date(year, 9, 31));

  return out;
}

/** Holidays between two dates (inclusive), in date order. */
export function holidaysBetween(first: ISODate, last: ISODate): Holiday[] {
  const y1 = Number(first.slice(0, 4));
  const y2 = Number(last.slice(0, 4));
  const all: Holiday[] = [];
  // One year either side: New Year's Day can be "observed" on Dec 31 of the year before.
  for (let y = y1 - 1; y <= y2 + 1; y++) all.push(...holidaysInYear(y));
  return all.filter((h) => h.date >= first && h.date <= last).sort((a, b) => a.date.localeCompare(b.date));
}

/** Key used for a holiday's saved position in the Daily view. */
export const holidayKey = (h: Holiday): string => `holiday:${h.slug}@${h.date}`;

/**
 * A holiday dressed as a read-only all-day "special date", so the Week and
 * Month layouts can place it like any other dated item.
 */
export function holidayAsItem(h: Holiday): Appointment & { holiday: Holiday } {
  return {
    id: `holiday:${h.slug}`,
    kind: 'special_date',
    title: h.name,
    start_date: h.date,
    end_date: h.date,
    all_day: true,
    start_time: null,
    end_time: null,
    location: '',
    notes: '',
    rrule: null,
    created_at: '',
    deleted_at: null,
    holiday: h,
  };
}

export function isHolidayItem(a: Appointment): a is Appointment & { holiday: Holiday } {
  return 'holiday' in a;
}
