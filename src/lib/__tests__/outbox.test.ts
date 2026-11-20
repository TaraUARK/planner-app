import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB, type PlannerDB } from '../db';
import { applyServerRows, createRow, markSent, softDelete, timestampMs, updateRow } from '../outbox';

let db: PlannerDB;
let n = 0;

beforeEach(async () => {
  db = openDB(`test-${++n}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const project = { id: 'p1', name: 'Grant report', category: 'work' as const, sort_key: 'a0' };

describe('local writes and the outbox', () => {
  it('saves a new row locally and queues the whole row as an upsert', async () => {
    await createRow(db, 'projects', project);
    expect(await db.projects.get('p1')).toMatchObject({ name: 'Grant report', deleted_at: null });
    const [entry] = await db.outbox.toArray();
    expect(entry).toMatchObject({ table: 'projects', rowId: 'p1', op: 'upsert', version: 1 });
    expect(entry.patch).toMatchObject({ id: 'p1', name: 'Grant report', category: 'work' });
  });

  it('merges later edits into one unsent entry and keeps it an upsert', async () => {
    await createRow(db, 'projects', project);
    await updateRow(db, 'projects', 'p1', { name: 'Grant report v2' });
    const entries = await db.outbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ op: 'upsert', version: 2 });
    expect(entries[0].patch).toMatchObject({ name: 'Grant report v2', category: 'work' });
  });

  it('queues only the changed fields for rows already on the server', async () => {
    await db.tasks.put({
      id: 't1', project_id: 'p1', title: 'Draft', date: '2026-11-17', done: false,
      notes: '', rrule: null, created_at: '2026-11-01T00:00:00Z', deleted_at: null,
    });
    await updateRow(db, 'tasks', 't1', { done: true });
    await updateRow(db, 'tasks', 't1', { notes: 'sent to PI' });
    const [entry] = await db.outbox.toArray();
    expect(entry.op).toBe('update');
    // Only the two edited fields: an edit on the other device to "title" survives.
    expect(entry.patch).toEqual({ done: true, notes: 'sent to PI' });
  });

  it('never sends server-only fields', async () => {
    await createRow(db, 'projects', { ...project, updated_at: 'x' } as never);
    const [entry] = await db.outbox.toArray();
    expect(entry.patch).not.toHaveProperty('updated_at');
  });

  it('soft-deletes (keeps the row, marks deleted_at) so the deletion can sync', async () => {
    await createRow(db, 'projects', project);
    await softDelete(db, 'projects', 'p1');
    expect((await db.projects.get('p1'))?.deleted_at).toBeTruthy();
    const [entry] = await db.outbox.toArray();
    expect(entry.patch.deleted_at).toBeTruthy();
  });
});

describe('after a push', () => {
  it('removes the entry when nothing changed while it was being sent', async () => {
    await createRow(db, 'projects', project);
    const [entry] = await db.outbox.toArray();
    expect(await markSent(db, entry)).toBe(true);
    expect(await db.outbox.count()).toBe(0);
  });

  it('keeps the entry (as an update) when a new edit arrived during the send', async () => {
    await createRow(db, 'projects', project);
    const [sending] = await db.outbox.toArray();
    await updateRow(db, 'projects', 'p1', { name: 'Renamed mid-send' });
    expect(await markSent(db, sending)).toBe(false);
    const [left] = await db.outbox.toArray();
    expect(left).toMatchObject({ op: 'update', version: 2 });
    expect(left.patch.name).toBe('Renamed mid-send');
  });
});

describe('rows arriving from the server', () => {
  it('are saved locally without user_id', async () => {
    await applyServerRows(db, 'projects', [
      { ...project, user_id: 'u1', created_at: 'c', updated_at: 'u', deleted_at: null },
    ]);
    const row = await db.projects.get('p1');
    expect(row).toMatchObject({ name: 'Grant report', updated_at: 'u' });
    expect(row).not.toHaveProperty('user_id');
  });

  it('do not overwrite this device’s unsent changes', async () => {
    await db.projects.put({ ...project, created_at: 'c', deleted_at: null });
    await updateRow(db, 'projects', 'p1', { name: 'Local edit (not sent yet)' });
    await applyServerRows(db, 'projects', [
      { ...project, name: 'Server name', sort_key: 'b0', created_at: 'c', updated_at: 'u2', deleted_at: null },
    ]);
    const row = await db.projects.get('p1');
    expect(row?.name).toBe('Local edit (not sent yet)'); // local pending edit wins
    expect(row?.sort_key).toBe('b0'); // other server changes still arrive
  });
});

describe('timestampMs', () => {
  it('handles Postgres microsecond timestamps', () => {
    expect(timestampMs('2026-11-17T12:00:00.123456+00:00')).toBe(Date.UTC(2026, 10, 17, 12, 0, 0, 123));
  });
});
