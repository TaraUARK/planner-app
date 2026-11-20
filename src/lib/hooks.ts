import { useEffect, useState, useSyncExternalStore } from 'react';
import { isISODate, todayISO } from './dates';
import { getSyncState, subscribeSync } from './sync';
import type { ISODate } from './types';

// ---------------------------------------------------------------------------
// Layout: chosen from the current window width, never from the device type.
// ---------------------------------------------------------------------------
export type Layout = 'compact' | 'wide';
export const WIDE_MIN = 1024;

function readLayout(): Layout {
  return window.innerWidth >= WIDE_MIN ? 'wide' : 'compact';
}

export function useLayout(): Layout {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('resize', cb);
      return () => window.removeEventListener('resize', cb);
    },
    readLayout,
  );
}

export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

// ---------------------------------------------------------------------------
// Today: updates at midnight and whenever the app comes back to the screen.
// ---------------------------------------------------------------------------
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const check = () => setToday(todayISO());
    const timer = setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

// ---------------------------------------------------------------------------
// Routing (hash based, so reloading never 404s on GitHub Pages).
//   #/week/2026-11-16  #/month/2026-11-01  #/day/2026-11-16  #/notes  #/settings
// ---------------------------------------------------------------------------
export type View = 'month' | 'week' | 'day' | 'notes' | 'settings' | 'projects';
export interface Route {
  view: View;
  date: ISODate;
  /** Notes: the chosen category ('all', 'none' or an id) and the open note:
   *  #/notes  ·  #/notes/<category>  ·  #/notes/<category>/<note id> */
  noteCat?: string;
  noteId?: string;
}

const VIEWS: View[] = ['month', 'week', 'day', 'notes', 'settings', 'projects'];

/** Remembered so Notes/Settings → Week returns to the same week. */
let lastDate: ISODate | null = null;

export function parseHash(hash: string): Route {
  const [, view, date, extra] = hash.replace(/^#/, '').split('/');
  if (isISODate(date)) lastDate = date;
  const v = VIEWS.includes(view as View) ? (view as View) : 'week';
  return {
    view: v,
    date: isISODate(date) ? date : (lastDate ?? todayISO()),
    ...(v === 'notes' && date ? { noteCat: date } : {}),
    ...(v === 'notes' && date && extra ? { noteId: extra } : {}),
  };
}

export function routeHash(r: Route): string {
  if (r.view === 'month' || r.view === 'week' || r.view === 'day') return `#/${r.view}/${r.date}`;
  if (r.view === 'notes' && r.noteCat) return `#/notes/${r.noteCat}${r.noteId ? `/${r.noteId}` : ''}`;
  return `#/${r.view}`;
}

export function useRoute(): [Route, (r: Route) => void] {
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => window.location.hash,
  );
  const route = parseHash(hash);
  const go = (r: Route) => {
    window.location.hash = routeHash(r);
  };
  return [route, go];
}

export function useSyncState() {
  return useSyncExternalStore(subscribeSync, getSyncState);
}
