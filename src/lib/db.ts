import Dexie, { type EntityTable } from 'dexie';
import type {
  Appointment,
  ItemPosition,
  Note,
  OccurrenceException,
  Project,
  Settings,
  TableName,
  Task,
} from './types';

/** A change waiting to be sent to the server (one entry per row, merged). */
export interface OutboxEntry {
  seq?: number;
  table: TableName;
  rowId: string;
  /** 'upsert' = the row (or its first version) hasn't reached the server yet. */
  op: 'upsert' | 'update';
  /** Only the fields that changed (the whole row for 'upsert'). */
  patch: Record<string, unknown>;
  /** Bumped on every merge, so a push can tell if more changes arrived meanwhile. */
  version: number;
  lastError?: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export type PlannerDB = Dexie & {
  projects: EntityTable<Project, 'id'>;
  tasks: EntityTable<Task, 'id'>;
  appointments: EntityTable<Appointment, 'id'>;
  occurrence_exceptions: EntityTable<OccurrenceException, 'id'>;
  item_positions: EntityTable<ItemPosition, 'id'>;
  notes: EntityTable<Note, 'id'>;
  settings: EntityTable<Settings, 'id'>;
  outbox: EntityTable<OutboxEntry, 'seq'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

export function openDB(name = 'planner'): PlannerDB {
  const db = new Dexie(name) as PlannerDB;
  db.version(1).stores({
    projects: 'id, sort_key',
    tasks: 'id, date, project_id',
    appointments: 'id, start_date, end_date',
    occurrence_exceptions: 'id, item_id, original_date',
    item_positions: 'id, [scope+date]',
    notes: 'id, sort_key',
    settings: 'id',
    outbox: '++seq, &[table+rowId]',
    meta: 'key',
  });
  return db;
}

export const db = openDB();
