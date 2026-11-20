// Weekly-view layout rules (pure functions, tested in week.test.ts).

import { addDays } from 'date-fns';
import { fromISODate, toISODate, weekStart } from './dates';
import { arrangeDay } from './ordering';
import type { Appointment, ISODate, Project, Task } from './types';

/** The seven dates of the week containing `date`, Monday first. */
export function weekDays(date: ISODate): ISODate[] {
  const monday = fromISODate(weekStart(date));
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(monday, i)));
}

export interface BandItem<A extends Appointment = Appointment> {
  appt: A;
  /** Column 0 (Monday) … 6 (Sunday), inclusive. */
  startCol: number;
  endCol: number;
  /** Starts before Monday / continues after Sunday. */
  before: boolean;
  after: boolean;
}

/**
 * Lay out appointments / special dates for the top band. Each lane is one
 * row; an item spanning several days takes several columns. Items are packed
 * into the first lane where they don't overlap anything.
 */
export function layoutBand<A extends Appointment>(appts: A[], days: ISODate[]): BandItem<A>[][] {
  const first = days[0];
  const last = days[days.length - 1];
  const items: BandItem<A>[] = appts
    .filter((a) => a.start_date <= last && a.end_date >= first)
    .map((appt) => {
      const startCol = appt.start_date < first ? 0 : days.indexOf(appt.start_date);
      const endCol = appt.end_date > last ? days.length - 1 : days.indexOf(appt.end_date);
      return { appt, startCol, endCol, before: appt.start_date < first, after: appt.end_date > last };
    })
    .sort(
      (a, b) =>
        a.startCol - b.startCol ||
        b.endCol - b.startCol - (a.endCol - a.startCol) || // longer first
        Number(!a.appt.all_day && a.appt.kind !== 'special_date') -
          Number(!b.appt.all_day && b.appt.kind !== 'special_date') || // all-day first
        (a.appt.start_time ?? '').localeCompare(b.appt.start_time ?? '') ||
        a.appt.title.localeCompare(b.appt.title),
    );

  const lanes: BandItem<A>[][] = [];
  for (const item of items) {
    const lane = lanes.find((l) => l.every((o) => o.endCol < item.startCol || o.startCol > item.endCol));
    if (lane) lane.push(item);
    else lanes.push([item]);
  }
  for (const lane of lanes) lane.sort((a, b) => a.startCol - b.startCol);
  return lanes;
}

export interface WeekRow<T extends Task = Task> {
  project: Project;
  /** Visible tasks per day (index 0 = Monday), in saved cell order. */
  cells: T[][];
}

/**
 * One row per project that has at least one visible task this week, in
 * project order (work projects first, then home). `projects` must already be
 * sorted. Tasks inside a cell follow their saved cell order; tasks without a
 * saved spot go to the bottom of the cell (oldest first).
 */
export function buildRows<T extends Task>(
  projects: Project[],
  tasks: T[],
  days: ISODate[],
  cellPositions: Map<string, string>,
  hideCompleted: boolean,
  keyOf: (t: T) => string,
): WeekRow<T>[] {
  const rows: WeekRow<T>[] = [];
  for (const project of projects) {
    const mine = tasks.filter((t) => t.project_id === project.id && !(hideCompleted && t.done));
    if (mine.length === 0) continue;
    const cells = days.map((d) => {
      const inCell = mine
        .filter((t) => t.date === d)
        .map((task) => ({ task, key: keyOf(task), group: project.category, rank: [task.created_at] }));
      return arrangeDay(inCell, cellPositions).map((i) => i.task);
    });
    rows.push({ project, cells });
  }
  return rows;
}

/** Weeks (Sunday → Saturday) covering the month that contains `date`. */
export function monthWeeks(date: ISODate): ISODate[][] {
  const d = fromISODate(date);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const start = addDays(first, -first.getDay());
  const weeks: ISODate[][] = [];
  for (let day = start; day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => toISODate(addDays(day, i))));
  }
  return weeks;
}
