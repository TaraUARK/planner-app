// Background sync between this device's local database and Supabase.
// Push: send queued field-level patches (outbox), oldest first.
// Pull: fetch rows changed on the server since the last pull.

import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from './db';
import { applyServerRows, markSent, onLocalChange, timestampMs } from './outbox';
import { TABLES, type TableName } from './types';

export type SyncState =
  | { kind: 'local-only' }
  | { kind: 'offline' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  | { kind: 'error'; message: string };

let state: SyncState = { kind: 'local-only' };
const listeners = new Set<(s: SyncState) => void>();

export function getSyncState(): SyncState {
  return state;
}
export function subscribeSync(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setState(s: SyncState) {
  state = s;
  for (const fn of listeners) fn(s);
}

/** Re-read a few seconds of history on every pull, so rows that committed late aren't missed. */
const OVERLAP_MS = 10_000;
const PAGE = 1000;

async function getCursor(table: TableName): Promise<string | null> {
  const m = await db.meta.get(`cursor:${table}`);
  return (m?.value as string | undefined) ?? null;
}
async function setCursor(table: TableName, ts: string) {
  await db.meta.put({ key: `cursor:${table}`, value: ts });
}

async function push(client: SupabaseClient): Promise<void> {
  const entries = await db.outbox.orderBy('seq').toArray();
  for (const entry of entries) {
    const q =
      entry.op === 'upsert'
        ? client.from(entry.table).upsert({ ...entry.patch, id: entry.rowId })
        : client.from(entry.table).update(entry.patch).eq('id', entry.rowId);
    const { error } = await q;
    if (error) {
      await db.outbox.update(entry.seq!, { lastError: error.message });
      // Stop here so later changes don't jump ahead of this one.
      throw new Error(`Couldn't save a change (${entry.table}): ${error.message}`);
    }
    await markSent(db, entry);
  }
}

async function pull(client: SupabaseClient): Promise<void> {
  for (const table of TABLES) {
    const cursor = await getCursor(table);
    let since = cursor
      ? new Date(timestampMs(cursor) - OVERLAP_MS).toISOString()
      : '1970-01-01T00:00:00Z';
    let newest = cursor;
    for (;;) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .limit(PAGE);
      if (error) throw new Error(`Couldn't load ${table}: ${error.message}`);
      const rows = (data ?? []) as Record<string, unknown>[];
      await applyServerRows(db, table, rows);
      if (rows.length > 0) {
        const last = rows[rows.length - 1].updated_at as string;
        if (!newest || timestampMs(last) > timestampMs(newest)) newest = last;
        since = last;
      }
      if (rows.length < PAGE) break;
    }
    if (newest && newest !== cursor) await setCursor(table, newest);
  }
}

let client: SupabaseClient | null = null;
let running = false;
let again = false;
let afterFirstPull: (() => Promise<void>) | null = null;

/** Run one push + pull now (or right after the current one finishes). */
export async function syncNow(): Promise<void> {
  if (!client) return;
  if (running) {
    again = true;
    return;
  }
  if (!navigator.onLine) {
    setState({ kind: 'offline' });
    return;
  }
  running = true;
  setState({ kind: 'syncing' });
  try {
    do {
      again = false;
      await push(client);
      await pull(client);
      if (afterFirstPull) {
        const fn = afterFirstPull;
        afterFirstPull = null;
        await fn();
        await push(client);
      }
    } while (again);
    setState({ kind: 'synced', at: Date.now() });
  } catch (e) {
    setState(
      navigator.onLine
        ? { kind: 'error', message: e instanceof Error ? e.message : String(e) }
        : { kind: 'offline' },
    );
  } finally {
    running = false;
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined;
function soon() {
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), 1500);
}

/**
 * Start syncing for the signed-in user. `onFirstPull` runs once after the
 * first successful pull (used to create default settings on a brand-new account).
 * Returns a stop function.
 */
export function startSync(c: SupabaseClient, onFirstPull?: () => Promise<void>): () => void {
  client = c;
  afterFirstPull = onFirstPull ?? null;
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow();
  };
  const onOnline = () => void syncNow();
  const onOffline = () => setState({ kind: 'offline' });
  const offLocal = onLocalChange(soon);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60_000);
  void syncNow();
  return () => {
    client = null;
    offLocal();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    clearInterval(timer);
    clearTimeout(debounce);
    setState({ kind: 'local-only' });
  };
}
