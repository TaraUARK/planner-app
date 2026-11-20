// Ordering rules (pure functions, no database access — easy to test).

import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import type { Project } from './types';

/** Plain string comparison (fractional keys must NOT use localeCompare). */
export function cmp(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpTuple(a: (string | number)[], b: (string | number)[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const c = cmp(a[i] ?? '', b[i] ?? '');
    if (c) return c;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Projects: work group first, then home; each group by its saved sort key.
// ---------------------------------------------------------------------------
export function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort(
    (a, b) =>
      cmp(a.category === 'work' ? 0 : 1, b.category === 'work' ? 0 : 1) ||
      cmp(a.sort_key, b.sort_key) ||
      cmp(a.id, b.id),
  );
}

/** A sort key that puts a project at the end of every list (and so the end of its group). */
export function keyAfterAll(keys: string[]): string {
  const max = keys.reduce<string | null>((m, k) => (m === null || k > m ? k : m), null);
  return generateKeyBetween(max, null);
}

export function findProjectByName(projects: Project[], name: string): Project | undefined {
  const n = name.trim().toLowerCase();
  return n ? projects.find((p) => p.name.trim().toLowerCase() === n) : undefined;
}

// ---------------------------------------------------------------------------
// Daily view order
// ---------------------------------------------------------------------------
/** appt = appointments, holidays and special dates; work / home = tasks. */
export type Group = 'appt' | 'work' | 'home';
const GROUP_RANK: Record<Group, number> = { appt: 0, work: 1, home: 2 };

export interface Orderable {
  key: string;
  group: Group;
  /** Tie-breakers for the default order within the group. */
  rank: (string | number)[];
}

/** Default order: appointment-type items, then work tasks, then home tasks. */
export function defaultOrder<T extends Orderable>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || cmpTuple(a.rank, b.rank) || cmp(a.key, b.key),
  );
}

/**
 * The order to show a day in.
 * - No saved order → default order.
 * - Saved order → saved items by their keys; any item without a saved
 *   position (new, or moved here from another day) goes at the END OF ITS OWN
 *   GROUP (right after the last item of the same group). If its group has no
 *   items yet, it goes where that group sits in the default order.
 */
export function arrangeDay<T extends Orderable>(items: T[], saved: Map<string, string>): T[] {
  const def = defaultOrder(items);
  const defIndex = new Map(def.map((item, i) => [item.key, i]));
  const result = def
    .filter((i) => saved.has(i.key))
    .sort((a, b) => cmp(saved.get(a.key)!, saved.get(b.key)!) || defIndex.get(a.key)! - defIndex.get(b.key)!);
  if (result.length === 0) return def;

  for (const item of def) {
    if (saved.has(item.key)) continue;
    let at = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].group === item.group) {
        at = i + 1;
        break;
      }
    }
    if (at === -1) {
      if (item.group === 'appt') at = 0;
      else if (item.group === 'home') at = result.length;
      else {
        // work: right after the last appointment-type item, else at the top
        let lastAppt = -1;
        result.forEach((r, i) => {
          if (r.group === 'appt') lastAppt = i;
        });
        at = lastAppt + 1;
      }
    }
    result.splice(at, 0, item);
  }
  return result;
}

export interface PositionWrite {
  key: string;
  sort_key: string;
}

/**
 * Work out which saved positions change when `activeKey` is dropped onto
 * `overKey`. `full` is the day's complete current order (including any
 * hidden completed tasks). Usually only the moved item gets a new key; the
 * first time a day is rearranged (or if some items have no saved position),
 * every item gets a key so the whole order is fixed in place.
 */
export function planMove<T extends { key: string }>(
  full: T[],
  activeKey: string,
  overKey: string,
  saved: Map<string, string>,
): PositionWrite[] {
  const from = full.findIndex((i) => i.key === activeKey);
  const to = full.findIndex((i) => i.key === overKey);
  if (from < 0 || to < 0 || from === to) return [];
  const next = [...full];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  if (full.every((i) => saved.has(i.key))) {
    const prev = to > 0 ? saved.get(next[to - 1].key)! : null;
    const after = to < next.length - 1 ? saved.get(next[to + 1].key)! : null;
    try {
      return [{ key: activeKey, sort_key: generateKeyBetween(prev, after) }];
    } catch {
      // Neighbours had equal keys (e.g. edited on two devices at once): renumber below.
    }
  }
  const keys = generateNKeysBetween(null, null, next.length);
  return next.map((i, n) => ({ key: i.key, sort_key: keys[n] }));
}
