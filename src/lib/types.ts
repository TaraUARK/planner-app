// Row shapes stored on the device. They mirror the Supabase tables
// (minus user_id, which the server fills in).

export type ISODate = string; // 'YYYY-MM-DD'
export type Timestamp = string; // ISO timestamp

interface BaseRow {
  id: string;
  created_at: Timestamp;
  updated_at?: Timestamp; // set by the server
  deleted_at: Timestamp | null;
}

export type Category = 'work' | 'home';

export interface Project extends BaseRow {
  name: string;
  category: Category;
  sort_key: string;
}

export interface Task extends BaseRow {
  project_id: string;
  title: string;
  date: ISODate;
  done: boolean;
  notes: string;
  rrule: string | null;
}

export interface Appointment extends BaseRow {
  /** low_priority = an appointment shown in a softer color. */
  kind: 'appointment' | 'special_date' | 'low_priority';
  title: string;
  start_date: ISODate;
  end_date: ISODate;
  all_day: boolean;
  start_time: string | null; // 'HH:MM' or 'HH:MM:SS'
  end_time: string | null;
  location: string;
  notes: string;
  rrule: string | null;
}

export interface OccurrenceException extends BaseRow {
  item_type: 'task' | 'appointment';
  item_id: string;
  original_date: ISODate;
  new_date: ISODate | null;
  done: boolean | null;
  skipped: boolean;
  overrides: Record<string, unknown>;
}

export interface ItemPosition extends BaseRow {
  scope: 'day' | 'week_cell';
  date: ISODate;
  item_key: string;
  sort_key: string;
}

export interface NoteCategory extends BaseRow {
  name: string;
  sort_key: string;
}

export interface Note extends BaseRow {
  /** null = no category */
  category_id: string | null;
  title: string;
  body_json: unknown;
  body_text: string;
  sort_key: string;
}

/**
 * Something to bring. kind:
 *   once      — only on `date` (carried over to today if never ticked)
 *   weekly    — on the chosen `weekdays` (0 = Monday … 6 = Sunday), from `date` on
 *   alternate — every other day, starting on `date`
 */
export interface BringItem extends BaseRow {
  name: string;
  kind: 'once' | 'weekly' | 'alternate';
  date: ISODate;
  weekdays: number[];
  sort_key: string;
}

/** A tick for one item on one day. id = '<item id>@<date>'. */
export interface BringCheck extends BaseRow {
  item_id: string;
  date: ISODate;
  checked: boolean;
}

export interface Settings extends BaseRow {
  hide_completed: boolean;
  show_holidays: boolean;
}

export interface TableRows {
  projects: Project;
  tasks: Task;
  appointments: Appointment;
  occurrence_exceptions: OccurrenceException;
  item_positions: ItemPosition;
  note_categories: NoteCategory;
  notes: Note;
  bring_items: BringItem;
  bring_checks: BringCheck;
  settings: Settings;
}

export type TableName = keyof TableRows;

/** Order matters: parents before children, so pushes never break foreign keys. */
export const TABLES: TableName[] = [
  'projects',
  'tasks',
  'appointments',
  'occurrence_exceptions',
  'item_positions',
  'note_categories',
  'notes',
  'bring_items',
  'bring_checks',
  'settings',
];
