import { dayLabel } from '../lib/dates';
import type { ISODate } from '../lib/types';

/** Stage 1 placeholder. The daily list comes in stage 2. */
export function DayView({ date }: { date: ISODate }) {
  return <p className="placeholder">{dayLabel(date)}: the daily list arrives in stage 2.</p>;
}
