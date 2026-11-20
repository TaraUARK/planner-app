import { describe, expect, it } from 'vitest';
import {
  defaultSpec,
  describeSpec,
  expandAppointments,
  expandTasks,
  occurrences,
  overdueOccurrence,
  ruleUntil,
  rruleToSpec,
  specToRRule,
  withUntil,
  type RepeatSpec,
} from '../recur';
import type { Appointment, OccurrenceException, Task } from '../types';

const spec = (s: Partial<RepeatSpec>, start = '2026-11-19'): RepeatSpec => ({ ...defaultSpec(start), ...s });

describe('repeat patterns', () => {
  it('daily, every N days', () => {
    expect(occurrences(specToRRule(spec({ freq: 'daily' }), '2026-11-19')!, '2026-11-19', '2026-11-19', '2026-11-22'))
      .toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(occurrences(specToRRule(spec({ freq: 'daily', interval: 3 }), '2026-11-19')!, '2026-11-19', '2026-11-19', '2026-11-30'))
      .toEqual(['2026-11-19', '2026-11-22', '2026-11-25', '2026-11-28']);
  });

  it('weekly on chosen weekdays, and every 2 weeks', () => {
    const mw = specToRRule(spec({ freq: 'weekly', weekdays: [0, 2] }, '2026-11-16'), '2026-11-16')!; // Mon + Wed
    expect(occurrences(mw, '2026-11-16', '2026-11-16', '2026-11-29')).toEqual(['2026-11-16', '2026-11-18', '2026-11-23', '2026-11-25']);
    const biweekly = specToRRule(spec({ freq: 'weekly', interval: 2 }), '2026-11-19')!; // Thursdays
    expect(occurrences(biweekly, '2026-11-19', '2026-11-19', '2026-12-31')).toEqual(['2026-11-19', '2026-12-03', '2026-12-17', '2026-12-31']);
  });

  it('monthly on the same date, the n-th weekday, or the last weekday', () => {
    const date = specToRRule(spec({ freq: 'monthly' }, '2026-01-15'), '2026-01-15')!;
    expect(occurrences(date, '2026-01-15', '2026-01-01', '2026-03-31')).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
    // Nov 19, 2026 is the third Thursday
    const nth = specToRRule(spec({ freq: 'monthly', monthly: 'nth' }), '2026-11-19')!;
    expect(occurrences(nth, '2026-11-19', '2026-11-01', '2027-01-31')).toEqual(['2026-11-19', '2026-12-17', '2027-01-21']);
    // Nov 27, 2026 is the last Friday
    const last = specToRRule(spec({ freq: 'monthly', monthly: 'last' }, '2026-11-27'), '2026-11-27')!;
    expect(occurrences(last, '2026-11-27', '2026-11-01', '2027-01-31')).toEqual(['2026-11-27', '2026-12-25', '2027-01-29']);
  });

  it('yearly, and an end date', () => {
    const yearly = specToRRule(spec({ freq: 'yearly', until: '2028-12-31' }, '2026-03-02'), '2026-03-02')!;
    expect(occurrences(yearly, '2026-03-02', '2026-01-01', '2030-12-31')).toEqual(['2026-03-02', '2027-03-02', '2028-03-02']);
    expect(ruleUntil(yearly)).toBe('2028-12-31');
  });

  it('round-trips through the editor settings', () => {
    for (const s of [
      spec({ freq: 'weekly', interval: 2, weekdays: [1, 4] }),
      spec({ freq: 'monthly', monthly: 'nth' }),
      spec({ freq: 'daily', until: '2027-01-05' }),
    ]) {
      expect(rruleToSpec(specToRRule(s, '2026-11-19'), '2026-11-19')).toEqual(s);
    }
  });

  it('describes rules in plain English', () => {
    expect(describeSpec(spec({ freq: 'weekly', weekdays: [0, 2] }), '2026-11-19')).toBe('Every week on Monday, Wednesday');
    expect(describeSpec(spec({ freq: 'monthly', monthly: 'nth' }), '2026-11-19')).toBe('Every month on the third Thursday');
    expect(describeSpec(spec({ freq: 'daily', interval: 2 }), '2026-11-19')).toBe('Every 2 days');
  });

  it('can be cut off (used for "this and all future")', () => {
    const daily = withUntil('FREQ=DAILY', '2026-11-20');
    expect(occurrences(daily, '2026-11-18', '2026-11-01', '2026-11-30')).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);
    expect(ruleUntil(withUntil(daily, null))).toBeNull();
  });

  it('is not shifted by daylight saving time', () => {
    // US clocks change Nov 1 and Mar 8 (2026)
    expect(occurrences('FREQ=DAILY', '2026-10-31', '2026-10-31', '2026-11-02')).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(occurrences('FREQ=WEEKLY', '2026-03-01', '2026-03-01', '2026-03-15')).toEqual(['2026-03-01', '2026-03-08', '2026-03-15']);
  });
});

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', project_id: 'p', title: 'Water plants', date: '2026-11-16', done: false, notes: '',
  rrule: 'FREQ=DAILY', created_at: '', deleted_at: null, ...over,
});
const exc = (original_date: string, over: Partial<OccurrenceException> = {}): OccurrenceException => ({
  id: `task:t1@${original_date}`, item_type: 'task', item_id: 't1', original_date, new_date: null, done: null,
  skipped: false, overrides: {}, created_at: '', deleted_at: null, ...over,
});

describe('expanding repeating tasks', () => {
  it('gives each occurrence its own done state', () => {
    const occ = expandTasks([task()], [exc('2026-11-17', { done: true })], '2026-11-16', '2026-11-18');
    expect(occ.map((o) => [o.date, o.done])).toEqual([['2026-11-16', false], ['2026-11-17', true], ['2026-11-18', false]]);
    expect(occ[1].key).toBe('task:t1@2026-11-17');
  });

  it('skipped occurrences disappear; moved ones show on their new day', () => {
    const occ = expandTasks(
      [task()],
      [exc('2026-11-17', { skipped: true }), exc('2026-11-18', { new_date: '2026-11-25' })],
      '2026-11-16',
      '2026-11-18',
    );
    expect(occ.map((o) => o.date)).toEqual(['2026-11-16']);
    const later = expandTasks([task({ rrule: 'FREQ=DAILY;UNTIL=20261118T000000Z' })], [exc('2026-11-18', { new_date: '2026-11-25' })], '2026-11-25', '2026-11-25');
    expect(later.map((o) => [o.date, o.originalDate])).toEqual([['2026-11-25', '2026-11-18']]);
  });

  it('applies "this one only" edits', () => {
    const [o] = expandTasks([task()], [exc('2026-11-16', { overrides: { title: 'Water plants + fertilize' } })], '2026-11-16', '2026-11-16');
    expect(o.title).toBe('Water plants + fertilize');
  });
});

describe('repeating-task overdue rule', () => {
  it('only the most recent missed occurrence is overdue', () => {
    const o = overdueOccurrence(task(), [], '2026-11-19');
    expect(o?.date).toBe('2026-11-18'); // not Nov 16 and 17 as well
  });

  it('done occurrences are skipped over', () => {
    expect(overdueOccurrence(task(), [exc('2026-11-18', { done: true })], '2026-11-19')?.date).toBe('2026-11-17');
  });

  it('nothing is overdue when every past occurrence is done, or the series starts today', () => {
    const allDone = ['2026-11-16', '2026-11-17', '2026-11-18'].map((d) => exc(d, { done: true }));
    expect(overdueOccurrence(task(), allDone, '2026-11-19')).toBeNull();
    expect(overdueOccurrence(task({ date: '2026-11-19' }), [], '2026-11-19')).toBeNull();
  });

  it('an occurrence moved to the future is not overdue', () => {
    const moved = exc('2026-11-18', { new_date: '2026-11-22' });
    expect(overdueOccurrence(task(), [moved, exc('2026-11-17', { done: true }), exc('2026-11-16', { done: true })], '2026-11-19')).toBeNull();
  });
});

describe('expanding repeating appointments', () => {
  const appt = (over: Partial<Appointment> = {}): Appointment => ({
    id: 'a1', kind: 'appointment', title: 'Conference', start_date: '2026-11-18', end_date: '2026-11-20', all_day: true,
    start_time: null, end_time: null, location: '', notes: '', rrule: 'FREQ=MONTHLY', created_at: '', deleted_at: null, ...over,
  });

  it('keeps the length of multi-day items and includes ones that started before the range', () => {
    const occ = expandAppointments([appt()], [], '2026-12-19', '2026-12-25');
    expect(occ.map((o) => [o.start_date, o.end_date])).toEqual([['2026-12-18', '2026-12-20']]);
  });

  it('yearly special dates show every year', () => {
    const bday = appt({ kind: 'special_date', start_date: '2020-05-04', end_date: '2020-05-04', rrule: 'FREQ=YEARLY' });
    expect(expandAppointments([bday], [], '2027-05-01', '2027-05-31').map((o) => o.start_date)).toEqual(['2027-05-04']);
  });
});
