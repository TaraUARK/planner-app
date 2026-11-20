// "To bring" list rules (pure functions, tested in bring.test.ts).

import { differenceInCalendarDays } from 'date-fns';
import { fromISODate } from './dates';
import { cmp } from './ordering';
import type { BringCheck, BringItem, ISODate } from './types';

export interface BringRow {
  item: BringItem;
  checked: boolean;
  /** The day this row's tick is saved under. */
  checkDate: ISODate;
  /** Set when a one-off item from an earlier day is still waiting to be brought. */
  carriedFrom?: ISODate;
}

/** 0 = Monday … 6 = Sunday */
export const weekdayIndex = (d: ISODate) => (fromISODate(d).getDay() + 6) % 7;

export const checkId = (itemId: string, date: ISODate) => `${itemId}@${date}`;

/** Does this repeating / one-off item belong on `date` (ignoring carry-over)? */
export function appliesOn(item: BringItem, date: ISODate): boolean {
  if (item.deleted_at) return false;
  if (item.kind === 'once') return item.date === date;
  if (date < item.date) return false;
  if (item.kind === 'weekly') return item.weekdays.includes(weekdayIndex(date));
  return differenceInCalendarDays(fromISODate(date), fromISODate(item.date)) % 2 === 0; // alternate
}

/**
 * The list for one day: repeating items first (in the order added), then
 * that day's one-offs, then — on today only — one-offs from earlier days that
 * were never ticked ("carried over"). Each day's ticks are independent.
 */
export function bringListFor(items: BringItem[], checks: BringCheck[], date: ISODate, today: ISODate): BringRow[] {
  const ticks = new Map<string, boolean>();
  const tickedBefore = new Set<string>(); // one-off items ticked on some day before today
  for (const c of checks) {
    if (c.deleted_at) continue;
    ticks.set(checkId(c.item_id, c.date), c.checked);
    if (c.checked && c.date < today) tickedBefore.add(c.item_id);
  }
  const isTicked = (item: BringItem, d: ISODate) => ticks.get(checkId(item.id, d)) ?? false;
  const live = items.filter((i) => !i.deleted_at).sort((a, b) => cmp(a.sort_key, b.sort_key) || cmp(a.id, b.id));

  const repeating = live
    .filter((i) => i.kind !== 'once' && appliesOn(i, date))
    .map((item) => ({ item, checked: isTicked(item, date), checkDate: date }));
  const onceToday = live
    .filter((i) => i.kind === 'once' && i.date === date)
    .map((item) => ({ item, checked: isTicked(item, date), checkDate: date }));
  const carried =
    date === today
      ? live
          .filter((i) => i.kind === 'once' && i.date < today && !tickedBefore.has(i.id))
          .sort((a, b) => cmp(a.date, b.date))
          .map((item) => ({ item, checked: isTicked(item, today), checkDate: today, carriedFrom: item.date }))
      : [];
  return [...repeating, ...onceToday, ...carried];
}

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Small label shown next to an item, e.g. "Weekdays", "Tue · Thu", "Every other day", "Today only". */
export function scheduleLabel(item: BringItem): string {
  if (item.kind === 'once') return 'This day only';
  if (item.kind === 'alternate') return 'Every other day';
  const days = [...item.weekdays].sort();
  if (days.length === 7) return 'Every day';
  if (days.join() === '0,1,2,3,4') return 'Weekdays';
  if (days.join() === '5,6') return 'Weekends';
  return days.map((d) => SHORT[d]).join(' · ');
}
