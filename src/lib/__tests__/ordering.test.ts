import { describe, expect, it } from 'vitest';
import { recentProjects } from '../queries';
import {
  arrangeDay,
  defaultOrder,
  findProjectByName,
  keyAfterAll,
  planMove,
  sortProjects,
  type Orderable,
} from '../ordering';
import type { Project, Task } from '../types';

const appt = (key: string, rank: (string | number)[] = [1, '09:00']): Orderable => ({ key, group: 'appt', rank });
const work = (key: string, rank: (string | number)[] = ['a0']): Orderable => ({ key, group: 'work', rank });
const home = (key: string, rank: (string | number)[] = ['a0']): Orderable => ({ key, group: 'home', rank });
const keys = (items: Orderable[]) => items.map((i) => i.key);

describe('daily default order', () => {
  it('puts appointment-type items first (all-day, then by time), then work, then home', () => {
    const items = [
      home('h1'),
      work('w1'),
      appt('dentist 2pm', [1, '14:00']),
      appt('birthday (all day)', [0, '']),
      appt('meeting 9am', [1, '09:00']),
    ];
    expect(keys(defaultOrder(items))).toEqual(['birthday (all day)', 'meeting 9am', 'dentist 2pm', 'w1', 'h1']);
  });

  it('orders tasks by project order within work and home', () => {
    expect(keys(defaultOrder([work('w-second', ['b0']), work('w-first', ['a0'])]))).toEqual(['w-first', 'w-second']);
  });
});

describe('arrangeDay (saved order + placing new items)', () => {
  it('uses the default order when nothing has been rearranged', () => {
    const items = [home('h1'), appt('a1'), work('w1')];
    expect(keys(arrangeDay(items, new Map()))).toEqual(['a1', 'w1', 'h1']);
  });

  it('follows the saved order, even mixing groups', () => {
    const items = [appt('a1'), work('w1'), home('h1')];
    const saved = new Map([['h1', 'a0'], ['a1', 'a1'], ['w1', 'a2']]);
    expect(keys(arrangeDay(items, saved))).toEqual(['h1', 'a1', 'w1']);
  });

  it('puts a new item at the end of its own group', () => {
    // Saved: w1, a1, h1, w2 (user dragged things around)
    const saved = new Map([['w1', 'a0'], ['a1', 'a1'], ['h1', 'a2'], ['w2', 'a3']]);
    const items = [work('w1'), appt('a1'), home('h1'), work('w2'), work('w-new'), home('h-new'), appt('a-new', [1, '23:00'])];
    expect(keys(arrangeDay(items, saved))).toEqual(['w1', 'a1', 'a-new', 'h1', 'h-new', 'w2', 'w-new']);
  });

  it('places a new item where its group belongs when the group is empty that day', () => {
    const saved = new Map([['h1', 'a0'], ['h2', 'a1']]);
    const items = [home('h1'), home('h2'), work('w-new'), appt('a-new')];
    // appointments go to the top; work goes after appointments, before home
    expect(keys(arrangeDay(items, saved))).toEqual(['a-new', 'w-new', 'h1', 'h2']);
  });

  it('keeps several new items of one group in their default order', () => {
    const saved = new Map([['h1', 'a0']]);
    const items = [home('h1'), appt('late', [1, '17:00']), appt('early', [1, '08:00'])];
    expect(keys(arrangeDay(items, saved))).toEqual(['early', 'late', 'h1']);
  });
});

describe('planMove', () => {
  const list = (...k: string[]) => k.map((key) => ({ key }));

  it('the first rearrangement saves a key for every item, in the new order', () => {
    const writes = planMove(list('a', 'b', 'c'), 'c', 'a', new Map());
    expect(writes.map((w) => w.key)).toEqual(['c', 'a', 'b']);
    const ks = writes.map((w) => w.sort_key);
    expect([...ks].sort()).toEqual(ks); // increasing
  });

  it('later moves change only the moved item', () => {
    const saved = new Map([['a', 'a0'], ['b', 'a1'], ['c', 'a2']]);
    const writes = planMove(list('a', 'b', 'c'), 'a', 'c', saved);
    expect(writes).toHaveLength(1);
    expect(writes[0].key).toBe('a');
    expect(writes[0].sort_key > 'a2').toBe(true);
  });

  it('moving between two neighbours lands strictly between them', () => {
    const saved = new Map([['a', 'a0'], ['b', 'a1'], ['c', 'a2']]);
    const [w] = planMove(list('a', 'b', 'c'), 'c', 'b', saved);
    expect(w.sort_key > 'a0' && w.sort_key < 'a1').toBe(true);
  });

  it('renumbers everything if neighbours have equal keys', () => {
    const saved = new Map([['a', 'a0'], ['b', 'a0'], ['c', 'a1']]);
    expect(planMove(list('a', 'b', 'c'), 'c', 'b', saved)).toHaveLength(3);
  });

  it('does nothing when dropped on itself', () => {
    expect(planMove(list('a', 'b'), 'a', 'a', new Map())).toEqual([]);
  });
});

const proj = (id: string, category: 'work' | 'home', sort_key: string, name = id): Project => ({
  id, name, category, sort_key, created_at: '', deleted_at: null,
});

describe('projects', () => {
  it('lists work projects first, then home, each in saved order', () => {
    const ps = [proj('h1', 'home', 'a0'), proj('w2', 'work', 'a3'), proj('w1', 'work', 'a1')];
    expect(sortProjects(ps).map((p) => p.id)).toEqual(['w1', 'w2', 'h1']);
  });

  it('a new project goes after every existing one', () => {
    expect(keyAfterAll(['a0', 'a5', 'a2']) > 'a5').toBe(true);
    expect(typeof keyAfterAll([])).toBe('string');
  });

  it('finds an existing project by name, ignoring case and spaces', () => {
    const ps = [proj('p1', 'work', 'a0', 'Grant Report')];
    expect(findProjectByName(ps, '  grant report ')?.id).toBe('p1');
    expect(findProjectByName(ps, 'grant')).toBeUndefined();
  });

  it('the dropdown shows projects used in the last 14 days or later, most recent first', () => {
    const ps = [proj('old', 'work', 'a0'), proj('recent', 'work', 'a1'), proj('future', 'home', 'a2'), proj('newest', 'home', 'a3')];
    const task = (project_id: string, date: string, created_at: string): Task => ({
      id: `${project_id}${date}`, project_id, title: '', date, done: false, notes: '', rrule: null, created_at, deleted_at: null,
    });
    const tasks = [
      task('old', '2026-11-01', '2026-10-30T00:00:00Z'), // 18 days ago: too old
      task('recent', '2026-11-10', '2026-11-09T00:00:00Z'),
      task('future', '2026-12-25', '2026-11-12T00:00:00Z'),
      task('newest', '2026-11-19', '2026-11-18T00:00:00Z'),
    ];
    expect(recentProjects(ps, tasks, '2026-11-19').map((p) => p.id)).toEqual(['newest', 'future', 'recent']);
  });
});
