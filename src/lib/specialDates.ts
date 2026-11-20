// "Turns 70" / "25th anniversary" for special dates that count years.

import type { Appointment } from './types';

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

/** Text for the year shown (from the occurrence's date), or '' when not counting. */
export function yearsLabel(a: Pick<Appointment, 'count_style' | 'count_from_year' | 'start_date'>): string {
  if (!a.count_style || !a.count_from_year) return '';
  const n = Number(a.start_date.slice(0, 4)) - a.count_from_year;
  if (n <= 0) return '';
  if (a.count_style === 'age') return `turns ${n}`;
  if (a.count_style === 'anniversary') return `${ordinal(n)} anniversary`;
  return `${n} ${n === 1 ? 'year' : 'years'}`;
}

/** Title with the count added, e.g. "Mom's birthday (turns 70)". */
export function titleWithYears(a: Pick<Appointment, 'title' | 'count_style' | 'count_from_year' | 'start_date'>): string {
  const y = yearsLabel(a);
  return y ? `${a.title} (${y})` : a.title;
}
