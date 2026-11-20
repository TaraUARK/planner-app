// Live views of local data (re-render automatically when data changes).

import { subDays } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { fromISODate, toISODate } from './dates';
import { db } from './db';
import { cmp, sortProjects } from './ordering';
import {
  expandAppointments,
  expandTasks,
  occurrences,
  oneTimeAppt,
  oneTimeTask,
  overdueOccurrence,
  type ApptOcc,
  type TaskOcc,
} from './recur';
import type { Appointment, ISODate, ItemPosition, Note, NoteCategory, OccurrenceException, Project, Task } from './types';

const alive = <T extends { deleted_at: string | null }>(r: T) => !r.deleted_at;

export function useProjects(): Project[] | undefined {
  return useLiveQuery(async () => sortProjects((await db.projects.toArray()).filter(alive)), []);
}

// ---------------------------------------------------------------------------
// Tasks and appointments as shown on screen: one-time items plus every
// occurrence of repeating ones (see recur.ts).
// ---------------------------------------------------------------------------
async function exceptionsFor(ids: string[]): Promise<OccurrenceException[]> {
  if (ids.length === 0) return [];
  return (await db.occurrence_exceptions.where('item_id').anyOf(ids).toArray()).filter(alive);
}

export async function loadTaskOccs(from: ISODate, to: ISODate): Promise<TaskOcc[]> {
  const [oneTime, series] = await Promise.all([
    db.tasks.where('date').between(from, to, true, true).filter((t) => !t.rrule && !t.deleted_at).toArray(),
    db.tasks.filter((t) => !!t.rrule && !t.deleted_at).toArray(),
  ]);
  const ex = await exceptionsFor(series.map((s) => s.id));
  return [...oneTime.map(oneTimeTask), ...expandTasks(series, ex, from, to)];
}

export async function loadApptOccs(from: ISODate, to: ISODate): Promise<ApptOcc[]> {
  const [oneTime, series] = await Promise.all([
    db.appointments.where('start_date').belowOrEqual(to).filter((a) => a.end_date >= from && !a.rrule && !a.deleted_at).toArray(),
    db.appointments.filter((a) => !!a.rrule && !a.deleted_at).toArray(),
  ]);
  const ex = await exceptionsFor(series.map((s) => s.id));
  return [...oneTime.map(oneTimeAppt), ...expandAppointments(series, ex, from, to)];
}

export interface DayData {
  tasks: TaskOcc[];
  appointments: ApptOcc[];
  positions: ItemPosition[];
}

export function useDay(date: ISODate): DayData | undefined {
  return useLiveQuery(async () => {
    const [tasks, appointments, positions] = await Promise.all([
      loadTaskOccs(date, date),
      loadApptOccs(date, date),
      db.item_positions.where('[scope+date]').equals(['day', date]).toArray(),
    ]);
    return { tasks, appointments, positions: positions.filter(alive) };
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
  const horizon = toISODate(subDays(fromISODate(today), -400));
  for (const t of tasks) {
    if (t.deleted_at) continue;
    // A repeating task counts if it has an occurrence from the cutoff on.
    if (t.rrule ? occurrences(t.rrule, t.date, cutoff, horizon).length === 0 : t.date < cutoff) continue;
    const prev = lastUsed.get(t.project_id);
    if (!prev || t.created_at > prev) lastUsed.set(t.project_id, t.created_at);
  }
  return projects
    .filter((p) => lastUsed.has(p.id))
    .sort((a, b) => cmp(lastUsed.get(b.id)!, lastUsed.get(a.id)!));
}

export function useRecentTasks(today: ISODate): Task[] | undefined {
  const cutoff = toISODate(subDays(fromISODate(today), 14));
  return useLiveQuery(() => db.tasks.filter((t) => t.date >= cutoff || !!t.rrule).toArray(), [cutoff]);
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
  tasks: TaskOcc[];
  appointments: ApptOcc[];
  cellPositions: ItemPosition[];
}

export function useWeek(first: ISODate, last: ISODate): WeekData | undefined {
  return useLiveQuery(async () => {
    const [tasks, appointments, cellPositions] = await Promise.all([
      loadTaskOccs(first, last),
      loadApptOccs(first, last),
      db.item_positions.where('[scope+date]').between(['week_cell', first], ['week_cell', last], true, true).toArray(),
    ]);
    return { tasks, appointments, cellPositions: cellPositions.filter(alive) };
  }, [first, last]);
}

/**
 * Overdue tasks: one-time tasks dated before today that aren't done, plus
 * at most ONE occurrence per repeating task (its most recent missed day).
 */
export function useOverdue(today: ISODate): TaskOcc[] | undefined {
  return useLiveQuery(async () => {
    const oneTime = await db.tasks.where('date').below(today).filter((t) => !t.done && !t.deleted_at && !t.rrule).toArray();
    const series = await db.tasks.filter((t) => !!t.rrule && !t.deleted_at && t.date < today).toArray();
    const ex = await exceptionsFor(series.map((s) => s.id));
    const repeating = series.map((s) => overdueOccurrence(s, ex, today)).filter((o): o is TaskOcc => !!o);
    return [...oneTime.map(oneTimeTask), ...repeating].sort(
      (a, b) => cmp(a.date, b.date) || cmp(a.created_at, b.created_at),
    );
  }, [today]);
}

/** Appointments and special dates (including repeats) that touch any day between first and last. */
export function useAppointmentsBetween(first: ISODate, last: ISODate): ApptOcc[] | undefined {
  return useLiveQuery(() => loadApptOccs(first, last), [first, last]);
}

/** All notes, in their saved order (newest-added at the top unless rearranged). */
export function useNotes(): Note[] | undefined {
  return useLiveQuery(
    async () => (await db.notes.toArray()).filter(alive).sort((a, b) => cmp(a.sort_key, b.sort_key) || cmp(b.created_at, a.created_at)),
    [],
  );
}

export function useNote(id: string | undefined): Note | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.notes.get(id)) ?? null) : null), [id]);
}

/** Case-insensitive search of titles and text; every word must appear. */
export function searchNotes(notes: Note[], query: string): Note[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return notes;
  return notes.filter((n) => {
    const hay = `${n.title}\n${n.body_text}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Note categories, A–Z. */
export function useNoteCategories(): NoteCategory[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.note_categories.toArray())
        .filter(alive)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [],
  );
}

/** Which notes a category view shows: 'all', 'none' (no category) or a category id. */
export function notesInCategory(notes: Note[], cat: string): Note[] {
  if (cat === 'all') return notes;
  if (cat === 'none') return notes.filter((n) => !n.category_id);
  return notes.filter((n) => n.category_id === cat);
}
