import { describe, expect, it } from 'vitest';
import { buildRows, layoutBand, monthWeeks, weekDays } from '../week';
import type { Appointment, Project, Task } from '../types';

const days = weekDays('2026-11-19'); // Mon Nov 16 … Sun Nov 22

const appt = (title: string, start: string, end = start, extra: Partial<Appointment> = {}): Appointment => ({
  id: title, kind: 'appointment', title, start_date: start, end_date: end, all_day: true,
  start_time: null, end_time: null, location: '', notes: '', rrule: null, created_at: '', deleted_at: null, ...extra,
});

describe('weekDays', () => {
  it('runs Monday to Sunday', () => {
    expect(days).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  });
});

describe('layoutBand (appointments across the top)', () => {
  it('spans multi-day items across their columns', () => {
    const [[item]] = layoutBand([appt('Conference', '2026-11-18', '2026-11-20')], days);
    expect(item).toMatchObject({ startCol: 2, endCol: 4, before: false, after: false });
  });

  it('clips items that start before Monday or end after Sunday', () => {
    const [[item]] = layoutBand([appt('Trip', '2026-11-14', '2026-11-25')], days);
    expect(item).toMatchObject({ startCol: 0, endCol: 6, before: true, after: true });
  });

  it('leaves out items outside the week', () => {
    expect(layoutBand([appt('Next week', '2026-11-23')], days)).toEqual([]);
  });

  it('packs non-overlapping items into the same lane and stacks overlapping ones', () => {
    const lanes = layoutBand(
      [
        appt('Conference', '2026-11-18', '2026-11-20'),
        appt('Dentist', '2026-11-19', '2026-11-19', { all_day: false, start_time: '14:00' }),
        appt('Monday thing', '2026-11-16'),
        appt('Saturday thing', '2026-11-21'),
      ],
      days,
    );
    expect(lanes.map((l) => l.map((i) => i.appt.title))).toEqual([
      ['Monday thing', 'Conference', 'Saturday thing'],
      ['Dentist'],
    ]);
  });
});

describe('buildRows (one row per project with tasks this week)', () => {
  const proj = (id: string, category: 'work' | 'home'): Project => ({
    id, name: id, category, sort_key: id, created_at: '', deleted_at: null,
  });
  const task = (id: string, project_id: string, date: string, done = false, created_at = id): Task => ({
    id, project_id, title: id, date, done, notes: '', rrule: null, created_at, deleted_at: null,
  });
  const key = (t: Task) => `task:${t.id}@${t.date}`;
  const projects = [proj('W1', 'work'), proj('W2', 'work'), proj('H1', 'home')];

  it('skips projects with no tasks this week and keeps project order', () => {
    const rows = buildRows(projects, [task('a', 'H1', '2026-11-16'), task('b', 'W1', '2026-11-17')], days, new Map(), false, key);
    expect(rows.map((r) => r.project.id)).toEqual(['W1', 'H1']);
    expect(rows[0].cells[1].map((t) => t.id)).toEqual(['b']);
  });

  it('hides completed tasks and drops a row that ends up empty', () => {
    const tasks = [task('a', 'W1', '2026-11-16', true), task('b', 'H1', '2026-11-16')];
    expect(buildRows(projects, tasks, days, new Map(), true, key).map((r) => r.project.id)).toEqual(['H1']);
    expect(buildRows(projects, tasks, days, new Map(), false, key).map((r) => r.project.id)).toEqual(['W1', 'H1']);
  });

  it('uses the saved cell order, with unsaved tasks at the bottom', () => {
    const tasks = [task('a', 'W1', '2026-11-16', false, '1'), task('b', 'W1', '2026-11-16', false, '2'), task('c', 'W1', '2026-11-16', false, '3')];
    const saved = new Map([[key(tasks[2]), 'a0'], [key(tasks[0]), 'a1']]);
    const [row] = buildRows(projects, tasks, days, saved, false, key);
    expect(row.cells[0].map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('monthWeeks', () => {
  it('covers the month in Sunday-to-Saturday weeks', () => {
    const weeks = monthWeeks('2026-11-19');
    expect(weeks[0][0]).toBe('2026-11-01'); // Nov 1, 2026 is a Sunday
    expect(weeks.at(-1)!.at(-1)).toBe('2026-12-05');
    expect(weeks).toHaveLength(5);
    expect(monthWeeks('2026-08-10')).toHaveLength(6); // Aug 2026 starts on a Saturday
    expect(monthWeeks('2026-08-10')[0][0]).toBe('2026-07-26');
  });
});
