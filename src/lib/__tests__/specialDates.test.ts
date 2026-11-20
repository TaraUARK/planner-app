import { describe, expect, it } from 'vitest';
import { ordinal, titleWithYears, yearsLabel } from '../specialDates';

describe('special dates that count years', () => {
  const bday = { title: "Mom's birthday", count_style: 'age' as const, count_from_year: 1956, start_date: '2026-05-04' };
  it('shows ages for birthdays', () => {
    expect(yearsLabel(bday)).toBe('turns 70');
    expect(yearsLabel({ ...bday, start_date: '2027-05-04' })).toBe('turns 71'); // goes up each year
    expect(titleWithYears(bday)).toBe("Mom's birthday (turns 70)");
  });
  it('shows anniversaries as ordinals, and plain year counts', () => {
    expect(yearsLabel({ ...bday, count_style: 'anniversary', count_from_year: 2001 })).toBe('25th anniversary');
    expect(yearsLabel({ ...bday, count_style: 'years', count_from_year: 2025 })).toBe('1 year');
  });
  it('shows nothing when not counting, or in the starting year itself', () => {
    expect(yearsLabel({ ...bday, count_style: null })).toBe('');
    expect(yearsLabel({ ...bday, count_from_year: 2026 })).toBe('');
  });
  it('writes ordinals correctly', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th'],
    );
  });
});
