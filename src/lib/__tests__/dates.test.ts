import { describe, expect, it } from 'vitest';
import { isISODate, shiftDate, todayISO, weekLabel, weekStart } from '../dates';
import { parseHash, routeHash } from '../hooks';

describe('dates', () => {
  it('uses the local calendar date, not UTC', () => {
    // 11:30 pm local time is still the same calendar day.
    expect(todayISO(new Date(2026, 10, 17, 23, 30))).toBe('2026-11-17');
    expect(todayISO(new Date(2026, 10, 18, 0, 5))).toBe('2026-11-18');
  });

  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-17')).toBe('2026-11-16'); // Tue → Mon
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sun → previous Mon
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
  });

  it('moves by month / week / day', () => {
    expect(shiftDate('2026-01-31', 'month', 1)).toBe('2026-02-01');
    expect(shiftDate('2026-12-30', 'week', 1)).toBe('2027-01-06');
    expect(shiftDate('2026-03-08', 'day', 1)).toBe('2026-03-09'); // US daylight-saving day
    expect(shiftDate('2026-11-01', 'day', -1)).toBe('2026-10-31'); // DST ends
  });

  it('labels weeks that cross months and years', () => {
    expect(weekLabel('2026-11-17')).toBe('Nov 16 – 22, 2026');
    expect(weekLabel('2026-12-01')).toBe('Nov 30 – Dec 6, 2026');
    expect(weekLabel('2026-12-30')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });

  it('validates date strings', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('nope')).toBe(false);
  });
});

describe('routes', () => {
  it('round-trips view and date', () => {
    expect(parseHash('#/day/2026-11-17')).toEqual({ view: 'day', date: '2026-11-17' });
    expect(routeHash({ view: 'month', date: '2026-11-01' })).toBe('#/month/2026-11-01');
  });
  it('falls back to the week view and keeps the last date for notes/settings', () => {
    expect(parseHash('#/week/2026-05-04').date).toBe('2026-05-04');
    expect(parseHash('#/notes')).toEqual({ view: 'notes', date: '2026-05-04' });
    expect(parseHash('#/bogus').view).toBe('week');
  });
});
