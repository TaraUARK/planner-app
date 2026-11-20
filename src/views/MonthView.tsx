import { monthLabel } from '../lib/dates';
import type { ISODate } from '../lib/types';

/** Stage 1 placeholder. The calendar grid comes in stage 4. */
export function MonthView({ date }: { date: ISODate }) {
  return <p className="placeholder">{monthLabel(date)}: the month calendar arrives in stage 4.</p>;
}
