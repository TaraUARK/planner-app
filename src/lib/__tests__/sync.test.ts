// Offline / sync behaviour, against a pretend Supabase server kept in memory.

import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { createRow, updateRow } from '../outbox';
import { runSync } from '../sync';
import { TABLES } from '../types';

type Row = Record<string, unknown> & { id: string; updated_at?: string };

/** A tiny stand-in for Supabase: tables in memory, server-set updated_at, can be "offline". */
class FakeServer {
  tables = new Map<string, Map<string, Row>>();
  offline = false;
  clock = 0;
  log: string[] = [];

  table(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }
  private stamp() {
    this.clock += 1;
    return new Date(Date.UTC(2026, 10, 20, 0, 0, 0, this.clock)).toISOString().replace('Z', '000+00:00');
  }
  /** Simulate an edit made on ANOTHER device (goes straight to the server). */
  remoteEdit(table: string, id: string, patch: Record<string, unknown>) {
    const t = this.table(table);
    t.set(id, { ...t.get(id)!, ...patch, updated_at: this.stamp() });
  }

  client(): SupabaseClient {
    const fail = () => Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    const ok = (data: unknown = null) => Promise.resolve({ data, error: null });
    const from = (name: string) => ({
      upsert: (row: Row) => {
        if (this.offline) return fail();
        this.log.push(`upsert ${name}`);
        const t = this.table(name);
        t.set(row.id, { ...t.get(row.id), ...row, updated_at: this.stamp() });
        return ok();
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          if (this.offline) return fail();
          this.log.push(`update ${name}`);
          const t = this.table(name);
          if (t.has(id)) t.set(id, { ...t.get(id)!, ...patch, updated_at: this.stamp() });
          return ok();
        },
      }),
      select: () => {
        let since = '';
        let limit = 1000;
        const q = {
          gt: (_c: string, v: string) => ((since = v), q),
          order: () => q,
          limit: (n: number) => ((limit = n), q),
          then: (resolve: (r: unknown) => void, reject: (e: unknown) => void) => {
            if (this.offline) return fail().then(resolve, reject);
            const sinceMs = Date.parse(since.replace(/(\.\d{3})\d+/, '$1'));
            const rows = [...this.table(name).values()]
              .filter((r) => Date.parse(String(r.updated_at).replace(/(\.\d{3})\d+/, '$1')) > sinceMs)
              .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
              .slice(0, limit)
              .map((r) => ({ ...r, user_id: 'u1' }));
            return ok(rows).then(resolve, reject);
          },
        };
        return q;
      },
    });
    return { from } as unknown as SupabaseClient;
  }
}

let server: FakeServer;
beforeEach(async () => {
  server = new FakeServer();
  for (const t of [...TABLES, 'outbox', 'meta']) await db.table(t).clear();
});

const project = { id: 'p1', name: 'Garden', category: 'home' as const, sort_key: 'a0' };
const task = { id: 't1', project_id: 'p1', title: 'Plant bulbs', date: '2026-11-21', done: false, notes: '', rrule: null };

describe('working offline', () => {
  it('keeps changes on the device while offline and sends them, in order, when back online', async () => {
    server.offline = true;
    await createRow(db, 'projects', project);
    await createRow(db, 'tasks', task);
    await updateRow(db, 'tasks', 't1', { done: true });

    await expect(runSync(server.client())).rejects.toThrow(/Failed to fetch/);
    expect(await db.outbox.count()).toBe(2); // project + task (the "done" edit merged into the new task)
    expect((await db.tasks.get('t1'))?.done).toBe(true); // still visible on the device

    server.offline = false;
    await runSync(server.client());
    expect(await db.outbox.count()).toBe(0);
    expect(server.log.slice(0, 2)).toEqual(['upsert projects', 'upsert tasks']); // parent before child
    expect(server.table('tasks').get('t1')).toMatchObject({ title: 'Plant bulbs', done: true });
  });

  it('merges field by field: an offline edit and an edit from the other device both survive', async () => {
    await createRow(db, 'projects', project);
    await createRow(db, 'tasks', task);
    await runSync(server.client());

    // Phone (this device) goes offline and ticks the task done…
    server.offline = true;
    await updateRow(db, 'tasks', 't1', { done: true });
    // …meanwhile the Mac edits the notes.
    server.offline = false;
    server.remoteEdit('tasks', 't1', { notes: 'Tulips by the fence' });

    await runSync(server.client());
    expect(server.table('tasks').get('t1')).toMatchObject({ done: true, notes: 'Tulips by the fence' });
    expect(await db.tasks.get('t1')).toMatchObject({ done: true, notes: 'Tulips by the fence' });
  });

  it('when both devices change the same field, the later change wins', async () => {
    await createRow(db, 'projects', project);
    await createRow(db, 'tasks', task);
    await runSync(server.client());

    server.remoteEdit('tasks', 't1', { title: 'From the Mac' });
    await updateRow(db, 'tasks', 't1', { title: 'From the phone (later)' });
    await runSync(server.client());
    expect(server.table('tasks').get('t1')?.title).toBe('From the phone (later)');
    expect((await db.tasks.get('t1'))?.title).toBe('From the phone (later)');
  });

  it('deletions reach the other device', async () => {
    await createRow(db, 'projects', project);
    await runSync(server.client());
    server.remoteEdit('projects', 'p1', { deleted_at: '2026-11-20T01:00:00Z' });
    await runSync(server.client());
    expect((await db.projects.get('p1'))?.deleted_at).toBeTruthy();
  });
});
