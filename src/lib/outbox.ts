// Local-first writes: every change is saved on the device immediately and
// queued in the outbox as a field-level patch. The sync engine sends the
// outbox to Supabase later (see sync.ts).

import type { OutboxEntry, PlannerDB } from './db';
import type { TableName, TableRows } from './types';

/** Fields that only the server sets; never sent in a patch. */
const SERVER_FIELDS = new Set(['updated_at', 'user_id']);

function clean(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!SERVER_FIELDS.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

type Listener = () => void;
const listeners = new Set<Listener>();
/** Called after every local change (the sync engine uses it to schedule a push). */
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  for (const fn of listeners) fn();
}

async function enqueue(
  db: PlannerDB,
  table: TableName,
  rowId: string,
  op: OutboxEntry['op'],
  patch: Record<string, unknown>,
) {
  const existing = await db.outbox.where('[table+rowId]').equals([table, rowId]).first();
  if (existing) {
    await db.outbox.update(existing.seq!, {
      // An unsent 'upsert' stays an upsert (the server still needs the whole row).
      op: existing.op === 'upsert' ? 'upsert' : op,
      patch: { ...existing.patch, ...patch },
      version: existing.version + 1,
      lastError: undefined,
    });
  } else {
    await db.outbox.add({ table, rowId, op, patch, version: 1 });
  }
}

/**
 * Create a row (or fully overwrite one with a deterministic id).
 * Sent to the server as an upsert of the whole row.
 */
export async function createRow<T extends TableName>(
  db: PlannerDB,
  table: T,
  row: Omit<TableRows[T], 'created_at' | 'deleted_at' | 'updated_at'> &
    Partial<Pick<TableRows[T], 'created_at' | 'deleted_at'>>,
): Promise<TableRows[T]> {
  const full = {
    created_at: new Date().toISOString(),
    deleted_at: null,
    ...row,
  } as unknown as TableRows[T];
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    await db.table(table).put(full);
    await enqueue(db, table, full.id, 'upsert', clean(full as unknown as Record<string, unknown>));
  });
  notify();
  return full;
}

/** Change some fields of a row. Only the changed fields are sent. */
export async function updateRow<T extends TableName>(
  db: PlannerDB,
  table: T,
  id: string,
  patch: Partial<Omit<TableRows[T], 'id' | 'updated_at'>>,
): Promise<void> {
  const p = clean(patch as Record<string, unknown>);
  if (Object.keys(p).length === 0) return;
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    const n = await db.table(table).update(id, p);
    if (n === 0) throw new Error(`${table} ${id} not found on this device`);
    await enqueue(db, table, id, 'update', p);
  });
  notify();
}

/** Soft delete: the row stays (marked deleted) so the deletion syncs. */
export function softDelete(db: PlannerDB, table: TableName, id: string): Promise<void> {
  return updateRow(db, table, id, { deleted_at: new Date().toISOString() } as never);
}

/**
 * Save rows that came from the server. If this device still has unsent
 * changes for a row, those are laid on top so they aren't lost.
 */
export async function applyServerRows(
  db: PlannerDB,
  table: TableName,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    for (const raw of rows) {
      const { user_id: _ignored, ...row } = raw;
      void _ignored;
      const pending = await db.outbox
        .where('[table+rowId]')
        .equals([table, row.id as string])
        .first();
      await db.table(table).put(pending ? { ...row, ...pending.patch } : row);
    }
  });
}

/**
 * Remove an outbox entry after it was sent — but only if no new change was
 * merged into it while it was being sent (otherwise keep it for next time).
 */
export async function markSent(db: PlannerDB, entry: OutboxEntry): Promise<boolean> {
  return db.transaction('rw', db.outbox, async () => {
    const current = await db.outbox.get(entry.seq!);
    if (!current) return true;
    if (current.version === entry.version) {
      await db.outbox.delete(entry.seq!);
      return true;
    }
    // More changes arrived meanwhile. The row now exists on the server, so the
    // remaining (merged) patch can go as a plain update next time.
    await db.outbox.update(entry.seq!, { op: 'update' });
    return false;
  });
}

/** Postgres timestamps can have microseconds; trim to milliseconds and parse. */
export function timestampMs(ts: string): number {
  return Date.parse(ts.replace(/(\.\d{3})\d+/, '$1'));
}
