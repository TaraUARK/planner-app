import { describe, expect, it } from 'vitest';
import { toISODate } from '../dates';
import { easter, holidaysBetween, holidaysInYear } from '../holidays';

const on = (year: number, name: string) => holidaysInYear(year).find((h) => h.name === name)?.date;

describe('US holidays', () => {
  it('computes the 2026 federal holidays', () => {
    expect(on(2026, "New Year's Day")).toBe('2026-01-01');
    expect(on(2026, 'Martin Luther King Jr. Day')).toBe('2026-01-19');
    expect(on(2026, "Presidents' Day")).toBe('2026-02-16');
    expect(on(2026, 'Memorial Day')).toBe('2026-05-25');
    expect(on(2026, 'Juneteenth')).toBe('2026-06-19');
    expect(on(2026, 'Independence Day')).toBe('2026-07-04');
    expect(on(2026, 'Labor Day')).toBe('2026-09-07');
    expect(on(2026, "Columbus Day / Indigenous Peoples' Day")).toBe('2026-10-12');
    expect(on(2026, 'Veterans Day')).toBe('2026-11-11');
    expect(on(2026, 'Thanksgiving')).toBe('2026-11-26');
    expect(on(2026, 'Christmas Day')).toBe('2026-12-25');
  });

  it('adds the observed weekday when a holiday falls on a weekend', () => {
    // July 4, 2026 is a Saturday → observed Friday July 3
    expect(on(2026, 'Independence Day (observed)')).toBe('2026-07-03');
    // Juneteenth 2027 is a Saturday → Friday June 18
    expect(on(2027, 'Juneteenth (observed)')).toBe('2027-06-18');
    // Christmas 2022 was a Sunday → Monday Dec 26
    expect(on(2022, 'Christmas Day (observed)')).toBe('2022-12-26');
    // No observed day when it's a weekday
    expect(on(2026, 'Christmas Day (observed)')).toBeUndefined();
  });

  it("shows New Year's observed on Dec 31 of the year before", () => {
    // Jan 1, 2028 is a Saturday → observed Friday Dec 31, 2027
    const dec = holidaysBetween('2027-12-01', '2027-12-31').map((h) => `${h.date} ${h.name}`);
    expect(dec).toContain("2027-12-31 New Year's Day (observed)");
  });

  it('computes the observances', () => {
    expect(on(2026, "Valentine's Day")).toBe('2026-02-14');
    expect(on(2026, "Mother's Day")).toBe('2026-05-10');
    expect(on(2026, "Father's Day")).toBe('2026-06-21');
    expect(on(2026, 'Halloween')).toBe('2026-10-31');
  });

  it('computes Easter correctly across years', () => {
    expect(toISODate(easter(2024))).toBe('2024-03-31');
    expect(toISODate(easter(2025))).toBe('2025-04-20');
    expect(toISODate(easter(2026))).toBe('2026-04-05');
    expect(toISODate(easter(2027))).toBe('2027-03-28');
    expect(toISODate(easter(2038))).toBe('2038-04-25');
  });

  it('lists holidays in a date range, in order', () => {
    expect(holidaysBetween('2026-11-01', '2026-11-30').map((h) => h.name)).toEqual(['Veterans Day', 'Thanksgiving']);
  });
});
