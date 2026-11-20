// Live views of local data (re-render automatically when data changes).

import { subDays } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { fromISODate, toISODate } from './dates';
import { db } from './db';
import { cmp, sortProjects } from './ordering';
import type { Appointment, ISODate, ItemPosition, Project, Task } from './types';

const alive = <T extends { deleted_at: string | null }>(r: T) => !r.deleted_at;

export function useProjects(): Project[] | undefined {
  return useLiveQuery(async () => sortProjects((await db.projects.toArray()).filter(alive)), []);
}

export interface DayData {
  tasks: Task[];
  appointments: Appointment[];
  positions: ItemPosition[];
}

export function useDay(date: ISODate): DayData | undefined {
  return useLiveQuery(async () => {
    const [tasks, appointments, positions] = await Promise.all([
      db.tasks.where('date').equals(date).toArray(),
      db.appointments.where('start_date').belowOrEqual(date).filter((a) => a.end_date >= date).toArray(),
      db.item_positions.where('[scope+date]').equals(['day', date]).toArray(),
    ]);
    return {
      tasks: tasks.filter(alive),
      appointments: appointments.filter(alive),
      positions: positions.filter(alive),
    };
  }, [date]);
}

export function useTask(id: string | null): Task | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.tasks.get(id)) ?? null) : null), [id]);
}

export function useAppointment(id: string | null): Appointment | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.appointments.get(id)) ?? null) : null), [id]);
}

/**
 * Projects for the Add-task dropdown: those with a task in the last 14 days
 * or on any future date, most recently used first.
 */
export function recentProjects(projects: Project[], tasks: Task[], today: ISODate): Project[] {
  const cutoff = toISODate(subDays(fromISODate(today), 14));
  const lastUsed = new Map<string, string>();
  for (const t of tasks) {
    if (t.deleted_at || t.date < cutoff) continue;
    const prev = lastUsed.get(t.project_id);
    if (!prev || t.created_at > prev) lastUsed.set(t.project_id, t.created_at);
  }
  return projects
    .filter((p) => lastUsed.has(p.id))
    .sort((a, b) => cmp(lastUsed.get(b.id)!, lastUsed.get(a.id)!));
}

export function useRecentTasks(today: ISODate): Task[] | undefined {
  const cutoff = toISODate(subDays(fromISODate(today), 14));
  return useLiveQuery(() => db.tasks.where('date').aboveOrEqual(cutoff).toArray(), [cutoff]);
}

export function useTaskCounts(): Map<string, number> | undefined {
  return useLiveQuery(async () => {
    const counts = new Map<string, number>();
    for (const t of await db.tasks.toArray()) {
      if (!t.deleted_at) counts.set(t.project_id, (counts.get(t.project_id) ?? 0) + 1);
    }
    return counts;
  }, []);
}

export interface WeekData {
  tasks: Task[];
  appointments: Appointment[];
  cellPositions: ItemPosition[];
}

export function useWeek(first: ISODate, last: ISODate): WeekData | undefined {
  return useLiveQuery(async () => {
    const [tasks, appointments, cellPositions] = await Promise.all([
      db.tasks.where('date').between(first, last, true, true).toArray(),
      db.appointments.where('start_date').belowOrEqual(last).filter((a) => a.end_date >= first).toArray(),
      db.item_positions.where('[scope+date]').between(['week_cell', first], ['week_cell', last], true, true).toArray(),
    ]);
    return {
      tasks: tasks.filter(alive),
      appointments: appointments.filter(alive),
      cellPositions: cellPositions.filter(alive),
    };
  }, [first, last]);
}

/** One-time tasks dated before today that aren't done (repeating tasks: stage 5). */
export function useOverdue(today: ISODate): Task[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.tasks.where('date').below(today).filter((t) => !t.done && !t.deleted_at).toArray()).sort(
        (a, b) => cmp(a.date, b.date) || cmp(a.created_at, b.created_at),
      ),
    [today],
  );
}

/** Appointments and special dates that touch any day between first and last. */
export function useAppointmentsBetween(first: ISODate, last: ISODate): Appointment[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.appointments.where('start_date').belowOrEqual(last).filter((a) => a.end_date >= first).toArray()).filter(
        alive,
      ),
    [first, last],
  );
}
