import { describe, expect, it } from 'vitest';
import { bringListFor, scheduleLabel } from '../bring';
import type { BringCheck, BringItem } from '../types';

// Nov 2026: Mon 16, Tue 17, Wed 18, Thu 19, Fri 20, Sat 21, Sun 22, Mon 23, Tue 24
const item = (name: string, over: Partial<BringItem> = {}): BringItem => ({
  id: name, name, kind: 'weekly', date: '2026-11-16', weekdays: [0, 1, 2, 3, 4], sort_key: name,
  created_at: '', deleted_at: null, ...over,
});
const tick = (itemId: string, date: string, checked = true): BringCheck => ({
  id: `${itemId}@${date}`, item_id: itemId, date, checked, created_at: '', deleted_at: null,
});
const names = (rows: { item: BringItem }[]) => rows.map((r) => r.item.name);

describe('"To bring" lists', () => {
  const keys = item('Keys', { sort_key: 'a0' }); // weekdays, added first
  const gym = item('Gym bag', { weekdays: [1, 3], sort_key: 'a1' }); // Tue, Thu
  const meds = item('Allergy meds', { kind: 'alternate', date: '2026-11-17' }); // every other day from Tue

  it('shows weekday items on weekdays only, and "only certain days" items on those days', () => {
    expect(names(bringListFor([keys, gym], [], '2026-11-17', '2026-11-17'))).toEqual(['Keys', 'Gym bag']); // Tue
    expect(names(bringListFor([keys, gym], [], '2026-11-18', '2026-11-18'))).toEqual(['Keys']); // Wed
    expect(names(bringListFor([keys, gym], [], '2026-11-21', '2026-11-21'))).toEqual([]); // Sat: nothing → no bar
  });

  it('every-other-day items alternate from their start day (weekends included)', () => {
    const on = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'].filter(
      (d) => bringListFor([meds], [], d, '2026-11-16').length > 0,
    );
    expect(on).toEqual(['2026-11-17', '2026-11-19', '2026-11-21']);
  });

  it("doesn't show repeating items before the day they were added", () => {
    expect(names(bringListFor([item('New', { date: '2026-11-20' })], [], '2026-11-19', '2026-11-19'))).toEqual([]);
  });

  it("keeps each day's ticks separate", () => {
    const checks = [tick('Keys', '2026-11-17')];
    expect(bringListFor([keys], checks, '2026-11-17', '2026-11-18')[0].checked).toBe(true);
    expect(bringListFor([keys], checks, '2026-11-18', '2026-11-18')[0].checked).toBe(false);
  });

  it('one-off items appear on their own day, after the repeating ones', () => {
    const book = item('Library book', { kind: 'once', date: '2026-11-19', weekdays: [] });
    expect(names(bringListFor([book, keys], [], '2026-11-19', '2026-11-16'))).toEqual(['Keys', 'Library book']);
    expect(names(bringListFor([book, keys], [], '2026-11-20', '2026-11-16'))).toEqual(['Keys']);
  });

  it('an unticked one-off carries over to today until it is ticked', () => {
    const form = item('Signed form', { kind: 'once', date: '2026-11-17', weekdays: [] });
    // Not ticked on Tue → shows on today (Thu), marked as carried over
    const thu = bringListFor([form], [], '2026-11-19', '2026-11-19');
    expect(thu).toMatchObject([{ item: { name: 'Signed form' }, carriedFrom: '2026-11-17', checkDate: '2026-11-19', checked: false }]);
    // Ticked today → stays on today's list, crossed off
    expect(bringListFor([form], [tick('Signed form', '2026-11-19')], '2026-11-19', '2026-11-19')[0].checked).toBe(true);
    // …and is gone the next day
    expect(bringListFor([form], [tick('Signed form', '2026-11-19')], '2026-11-20', '2026-11-20')).toEqual([]);
    // Ticked on its own day → never carried
    expect(bringListFor([form], [tick('Signed form', '2026-11-17')], '2026-11-19', '2026-11-19')).toEqual([]);
    // Carry-over only shows on today, not on other days you look at
    expect(bringListFor([form], [], '2026-11-24', '2026-11-19')).toEqual([]);
  });

  it('deleted items disappear everywhere', () => {
    expect(bringListFor([item('Old', { deleted_at: 'x' })], [], '2026-11-17', '2026-11-17')).toEqual([]);
  });

  it('labels schedules in plain words', () => {
    expect(scheduleLabel(keys)).toBe('Weekdays');
    expect(scheduleLabel(gym)).toBe('Tue · Thu');
    expect(scheduleLabel(item('x', { weekdays: [0, 1, 2, 3, 4, 5, 6] }))).toBe('Every day');
    expect(scheduleLabel(meds)).toBe('Every other day');
  });
});
