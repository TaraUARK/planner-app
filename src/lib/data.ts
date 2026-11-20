// All changes to planner data go through these functions. Each one saves on
// the device immediately and queues the change for syncing.

import { db } from './db';
import { generateKeyBetween } from 'fractional-indexing';
import { keyAfterAll, type PositionWrite } from './ordering';
import { createRow, softDelete, updateRow } from './outbox';
import { exceptionId, occursOn, withUntil, type ApptOcc, type TaskOcc } from './recur';
import { addDays } from 'date-fns';
import { fromISODate, toISODate } from './dates';
import type { Appointment, BringItem, Category, ISODate, Note, NoteCategory, OccurrenceException, Project, Task } from './types';

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
export type TaskInput = Pick<Task, 'title' | 'project_id' | 'date' | 'notes'> & { rrule?: string | null };

export async function createTask(input: TaskInput): Promise<Task> {
  return createRow(db, 'tasks', {
    id: newId(),
    title: input.title.trim(),
    project_id: input.project_id,
    date: input.date,
    notes: input.notes,
    done: false,
    rrule: input.rrule ?? null,
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
> &
  Partial<Pick<Appointment, 'hide_in_month' | 'count_style' | 'count_from_year'>>;

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

// ---------------------------------------------------------------------------
// Repeating items: single occurrences ("this one only") and series splits
// ("this and all future ones"). See recur.ts for how occurrences are built.
// ---------------------------------------------------------------------------
type ItemType = 'task' | 'appointment';
const dayBefore = (d: ISODate) => toISODate(addDays(fromISODate(d), -1));

/** Save a change to ONE occurrence. `overrides`, when given, replaces the stored set. */
export async function patchException(
  type: ItemType,
  itemId: string,
  originalDate: ISODate,
  patch: Partial<Pick<OccurrenceException, 'new_date' | 'done' | 'skipped' | 'overrides'>>,
): Promise<void> {
  const id = exceptionId(type, itemId, originalDate);
  const cur = await db.occurrence_exceptions.get(id);
  if (cur && !cur.deleted_at) {
    await updateRow(db, 'occurrence_exceptions', id, patch);
  } else {
    await createRow(db, 'occurrence_exceptions', {
      id,
      item_type: type,
      item_id: itemId,
      original_date: originalDate,
      new_date: null,
      done: null,
      skipped: false,
      overrides: {},
      ...patch,
      deleted_at: null,
    });
  }
}

/** Tick / untick a task as shown on a particular day. */
export async function setOccurrenceDone(occ: TaskOcc, done: boolean): Promise<void> {
  if (occ.repeating) await patchException('task', occ.id, occ.originalDate, { done });
  else await setTaskDone(occ.id, done);
}

async function forgetPositions(date: ISODate, key: string) {
  for (const id of [`day:${date}:${key}`, `week_cell:${date}:${key}`]) {
    if (alive(await db.item_positions.get(id))) await softDelete(db, 'item_positions', id);
  }
}

/** Move a task as shown on one day to another day (for a repeating task: this one only). */
export async function moveTaskOccurrence(occ: TaskOcc, date: ISODate): Promise<void> {
  if (!occ.repeating) return updateTask(occ.id, { date });
  await patchException('task', occ.id, occ.originalDate, { new_date: date === occ.originalDate ? null : date });
  await forgetPositions(occ.date, occ.key);
}

export const skipOccurrence = (type: ItemType, id: string, originalDate: ISODate) =>
  patchException(type, id, originalDate, { skipped: true });

/** End a series just before `originalDate` (deleting it entirely if that is its first occurrence). */
export async function endSeriesBefore(type: ItemType, id: string, originalDate: ISODate): Promise<void> {
  const table = type === 'task' ? 'tasks' : 'appointments';
  const row = type === 'task' ? await db.tasks.get(id) : await db.appointments.get(id);
  if (!row?.rrule) return;
  const start = type === 'task' ? (row as Task).date : (row as Appointment).start_date;
  if (originalDate <= start) await softDelete(db, table, id);
  else await updateRow(db, table, id, { rrule: withUntil(row.rrule, dayBefore(originalDate)) });
}

/** Move exceptions on/after the split date to the new series (if its rule still produces that date). */
async function migrateExceptions(type: ItemType, fromId: string, splitDate: ISODate, toId: string, rule: string | null, start: ISODate) {
  const list = (await db.occurrence_exceptions.where('item_id').equals(fromId).toArray()).filter(
    (e) => !e.deleted_at && e.original_date >= splitDate,
  );
  for (const e of list) {
    if (rule && e.original_date !== splitDate && occursOn(rule, start, e.original_date)) {
      await patchException(type, toId, e.original_date, {
        new_date: e.new_date,
        done: e.done,
        skipped: e.skipped,
        overrides: e.overrides,
      });
    }
    await softDelete(db, 'occurrence_exceptions', e.id);
  }
}

/**
 * "This and all future ones" for a task. If the occurrence is the series'
 * first, the series itself is changed; otherwise the old series ends the day
 * before and a new one starts with the new details.
 */
export async function editTaskFromHere(
  series: Task,
  originalDate: ISODate,
  input: TaskInput & { rrule: string | null; done: boolean },
): Promise<void> {
  let targetId = series.id;
  if (originalDate <= series.date) {
    await updateTask(series.id, { title: input.title, project_id: input.project_id, date: input.date, notes: input.notes, rrule: input.rrule });
    // Done states of later occurrences are kept; this occurrence's state is set below.
  } else {
    await endSeriesBefore('task', series.id, originalDate);
    targetId = (await createTask(input)).id;
    await migrateExceptions('task', series.id, originalDate, targetId, input.rrule, input.date);
  }
  if (input.rrule) await patchException('task', targetId, input.date, { done: input.done });
  else await updateTask(targetId, { done: input.done });
}

export async function editAppointmentFromHere(
  series: Appointment,
  originalDate: ISODate,
  input: AppointmentInput,
): Promise<void> {
  if (originalDate <= series.start_date) {
    await updateAppointment(series.id, input);
    return;
  }
  await endSeriesBefore('appointment', series.id, originalDate);
  const created = await createAppointment(input);
  await migrateExceptions('appointment', series.id, originalDate, created.id, input.rrule, input.start_date);
}

/** "This one only" edit of a repeating appointment occurrence (its length can't change). */
export async function editAppointmentOccurrence(series: Appointment, occ: ApptOcc, input: AppointmentInput): Promise<void> {
  const overrides: Record<string, unknown> = {};
  for (const k of ['title', 'location', 'notes', 'all_day', 'start_time', 'end_time'] as const) {
    if (input[k] !== series[k]) overrides[k] = input[k];
  }
  await patchException('appointment', series.id, occ.originalDate, {
    new_date: input.start_date === occ.originalDate ? null : input.start_date,
    overrides,
  });
}

/** "This one only" edit of a repeating task occurrence. */
export async function editTaskOccurrence(series: Task, occ: TaskOcc, input: TaskInput & { done: boolean }): Promise<void> {
  const overrides: Record<string, unknown> = {};
  for (const k of ['title', 'notes', 'project_id'] as const) {
    const v = k === 'title' ? input.title.trim() : input[k];
    if (v !== series[k]) overrides[k] = v;
  }
  if (input.date !== occ.date) await forgetPositions(occ.date, occ.key);
  await patchException('task', series.id, occ.originalDate, {
    new_date: input.date === occ.originalDate ? null : input.date,
    done: input.done,
    overrides,
  });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
/** A new, empty note at the TOP of the list, in the given category (null = none). */
export async function createNote(categoryId: string | null = null): Promise<Note> {
  const keys = (await db.notes.toArray()).filter(alive).map((n) => n.sort_key).sort();
  return createRow(db, 'notes', {
    id: newId(),
    category_id: categoryId,
    title: '',
    body_json: null,
    body_text: '',
    sort_key: generateKeyBetween(null, keys[0] ?? null),
  });
}

export async function saveNote(id: string, patch: Partial<Pick<Note, 'title' | 'body_json' | 'body_text'>>): Promise<void> {
  if (await db.notes.get(id)) await updateRow(db, 'notes', id, patch);
}

export const deleteNote = (id: string) => softDelete(db, 'notes', id);
export const moveNoteToKey = (id: string, sort_key: string) => updateRow(db, 'notes', id, { sort_key });

export const setNoteCategory = (id: string, categoryId: string | null) =>
  updateRow(db, 'notes', id, { category_id: categoryId });

// Note categories
export async function createNoteCategory(name: string): Promise<NoteCategory> {
  const keys = (await db.note_categories.toArray()).filter(alive).map((c) => c.sort_key);
  return createRow(db, 'note_categories', { id: newId(), name: name.trim(), sort_key: keyAfterAll(keys) });
}

export const renameNoteCategory = (id: string, name: string) =>
  updateRow(db, 'note_categories', id, { name: name.trim() });

/** Delete a category; its notes are kept and become "No category". */
export async function deleteNoteCategory(id: string): Promise<void> {
  for (const n of (await db.notes.toArray()).filter((n) => alive(n) && n.category_id === id)) {
    await updateRow(db, 'notes', n.id, { category_id: null });
  }
  await softDelete(db, 'note_categories', id);
}

// ---------------------------------------------------------------------------
// "To bring" lists
// ---------------------------------------------------------------------------
export type BringInput = Pick<BringItem, 'name' | 'kind' | 'date' | 'weekdays'>;

export async function createBringItem(input: BringInput): Promise<BringItem> {
  const keys = (await db.bring_items.toArray()).filter(alive).map((i) => i.sort_key);
  return createRow(db, 'bring_items', { id: newId(), ...input, name: input.name.trim(), sort_key: keyAfterAll(keys) });
}

export const updateBringItem = (id: string, patch: Partial<BringInput>) =>
  updateRow(db, 'bring_items', id, { ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) });

export const deleteBringItem = (id: string) => softDelete(db, 'bring_items', id);

/** Tick / untick an item for one day. */
export async function setBringCheck(itemId: string, date: ISODate, checked: boolean): Promise<void> {
  const id = `${itemId}@${date}`;
  if (await db.bring_checks.get(id)) await updateRow(db, 'bring_checks', id, { checked, deleted_at: null });
  else await createRow(db, 'bring_checks', { id, item_id: itemId, date, checked });
}

// ---------------------------------------------------------------------------
// Day notes
// ---------------------------------------------------------------------------
export const dayNoteId = (date: ISODate) => `day:${date}`;

export async function saveDayNote(date: ISODate, body: string): Promise<void> {
  const id = dayNoteId(date);
  const cur = await db.day_notes.get(id);
  if (cur) await updateRow(db, 'day_notes', id, { body, deleted_at: null });
  else if (body.trim()) await createRow(db, 'day_notes', { id, date, body });
}
