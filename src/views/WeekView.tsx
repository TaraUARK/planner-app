import { addDays, format } from 'date-fns';
import { fromISODate, toISODate, weekStart } from '../lib/dates';
import { useToday } from '../lib/hooks';
import type { ISODate } from '../lib/types';

/** Stage 1 placeholder: the Monday → Sunday header. The full grid comes in stage 3. */
export function WeekView({ date }: { date: ISODate }) {
  const today = useToday();
  const monday = fromISODate(weekStart(date));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <>
      <div className="weekstrip">
        {days.map((d) => (
          <div key={d.toISOString()} className={`day ${toISODate(d) === today ? 'is-today' : ''}`}>
            <div>{format(d, 'EEE')}</div>
            <div>{format(d, 'd')}</div>
          </div>
        ))}
      </div>
      <p className="placeholder">The weekly planner grid arrives in stage 3.</p>
    </>
  );
}
