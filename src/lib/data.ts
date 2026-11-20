// All changes to planner data go through these functions. Each one saves on
// the device immediately and queues the change for syncing.

import { db } from './db';
import { keyAfterAll, type PositionWrite } from './ordering';
import { createRow, softDelete, updateRow } from './outbox';
import type { Appointment, Category, ISODate, Project, Task } from './types';

export const newId = (): string => crypto.randomUUID();

const alive = <T extends { deleted_at: string | null }>(r: T | undefined): r is T => !!r && !r.deleted_at;

// ---------------------------------------------------------------------------
// Item keys (used for saved positions)
// ---------------------------------------------------------------------------
export const taskKey = (t: Pick<Task, 'id' | 'date'>): string => `task:${t.id}@${t.date}`;
export const apptKey = (a: Pick<Appointment, 'id' | 'start_date'>): string => `appt:${a.id}@${a.start_date}`;
const dayPositionId = (date: ISODate, key: string) => `day:${date}:${key}`;
const cellPositionId = (date: ISODate, key: string) => `week_cell:${date}:${key}`;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
async function allProjectKeys(): Promise<string[]> {
  return (await db.projects.toArray()).filter(alive).map((p) => p.sort_key);
}

export async function createProject(name: string, category: Category): Promise<Project> {
  return createRow(db, 'projects', {
    id: newId(),
    name: name.trim(),
    category,
    sort_key: keyAfterAll(await allProjectKeys()),
  });
}

export async function renameProject(id: string, name: string): Promise<void> {
  await updateRow(db, 'projects', id, { name: name.trim() });
}

/** Switch work ↔ home. The project moves to the end of its new group. */
export async function setProjectCategory(id: string, category: Category): Promise<void> {
  await updateRow(db, 'projects', id, { category, sort_key: keyAfterAll(await allProjectKeys()) });
}

export async function moveProjectToKey(id: string, sort_key: string): Promise<void> {
  await updateRow(db, 'projects', id, { sort_key });
}

export async function tasksInProject(projectId: string): Promise<Task[]> {
  return (await db.tasks.where('project_id').equals(projectId).toArray()).filter(alive);
}

/** Move every task of `fromId` into `intoId`, then remove `fromId`. */
export async function mergeProject(fromId: string, intoId: string): Promise<void> {
  for (const t of await tasksInProject(fromId)) await updateRow(db, 'tasks', t.id, { project_id: intoId });
  await softDelete(db, 'projects', fromId);
}

export async function deleteProject(
  id: string,
  tasks: { moveTo: string } | { deleteTasks: true } | null,
): Promise<void> {
  const list = await tasksInProject(id);
  if (list.length > 0) {
    if (!tasks) throw new Error('Choose what to do with the tasks first');
    for (const t of list) {
      if ('moveTo' in tasks) await updateRow(db, 'tasks', t.id, { project_id: tasks.moveTo });
      else await softDelete(db, 'tasks', t.id);
    }
  }
  await softDelete(db, 'projects', id);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export type TaskInput = Pick<Task, 'title' | 'project_id' | 'date' | 'notes'>;

export async function createTask(input: TaskInput): Promise<Task> {
  return createRow(db, 'tasks', {
    id: newId(),
    title: input.title.trim(),
    project_id: input.project_id,
    date: input.date,
    notes: input.notes,
    done: false,
    rrule: null,
  });
}

export async function updateTask(id: string, patch: Partial<TaskInput & { done: boolean }>): Promise<void> {
  const before = await db.tasks.get(id);
  if (!before) return;
  await updateRow(db, 'tasks', id, { ...patch, ...(patch.title ? { title: patch.title.trim() } : {}) });
  // Moved to another day: forget its saved spot on the old day, so if it
  // ever comes back it is treated like any newly added item.
  if (patch.date && patch.date !== before.date) {
    for (const oldId of [dayPositionId(before.date, taskKey(before)), cellPositionId(before.date, taskKey(before))]) {
      if (alive(await db.item_positions.get(oldId))) await softDelete(db, 'item_positions', oldId);
    }
  }
}

export const setTaskDone = (id: string, done: boolean) => updateTask(id, { done });
export const deleteTask = (id: string) => softDelete(db, 'tasks', id);

// ---------------------------------------------------------------------------
// Appointments and special dates
// ---------------------------------------------------------------------------
export type AppointmentInput = Pick<
  Appointment,
  'kind' | 'title' | 'start_date' | 'end_date' | 'all_day' | 'start_time' | 'end_time' | 'location' | 'notes' | 'rrule'
>;

export async function createAppointment(input: AppointmentInput): Promise<Appointment> {
  return createRow(db, 'appointments', { id: newId(), ...input, title: input.title.trim() });
}

export async function updateAppointment(id: string, patch: Partial<AppointmentInput>): Promise<void> {
  await updateRow(db, 'appointments', id, { ...patch, ...(patch.title ? { title: patch.title.trim() } : {}) });
}

export const deleteAppointment = (id: string) => softDelete(db, 'appointments', id);

// ---------------------------------------------------------------------------
// Saved Daily-view order
// ---------------------------------------------------------------------------
async function savePositions(scope: 'day' | 'week_cell', date: ISODate, writes: PositionWrite[]): Promise<void> {
  for (const w of writes) {
    const id = scope === 'day' ? dayPositionId(date, w.key) : cellPositionId(date, w.key);
    if (await db.item_positions.get(id)) {
      await updateRow(db, 'item_positions', id, { sort_key: w.sort_key, deleted_at: null });
    } else {
      await createRow(db, 'item_positions', { id, scope, date, item_key: w.key, sort_key: w.sort_key });
    }
  }
}

/** Saved order of the Daily view. */
export const saveDayPositions = (date: ISODate, writes: PositionWrite[]) => savePositions('day', date, writes);

/** Saved order of tasks inside one Weekly-view cell (independent of the Daily order). */
export const saveCellPositions = (date: ISODate, writes: PositionWrite[]) => savePositions('week_cell', date, writes);
