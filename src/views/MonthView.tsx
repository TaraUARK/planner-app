import { useMemo } from 'react';
import { dayLabel, fromISODate, timeLabel } from '../lib/dates';
import { holidayAsItem, holidaysBetween, isHolidayItem } from '../lib/holidays';
import { useLayout, useRoute, useToday } from '../lib/hooks';
import { useAppointmentsBetween } from '../lib/queries';
import { useSettings } from '../lib/settings';
import type { ISODate } from '../lib/types';
import { layoutBand, monthWeeks, type BandItem } from '../lib/week';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Month calendar, Sunday → Saturday. Shows appointments, holidays and
 * special dates only (no tasks). Multi-day items stretch across their days.
 * Tapping a day opens it in the Daily view.
 */
export function MonthView({ date, settingsId }: { date: ISODate; settingsId: string }) {
  const today = useToday();
  const layout = useLayout();
  const [, go] = useRoute();
  const settings = useSettings(settingsId);
  const showHolidays = settings?.show_holidays ?? true;
  const weeks = useMemo(() => monthWeeks(date), [date]);
  const first = weeks[0][0];
  const last = weeks[weeks.length - 1][6];
  const appts = useAppointmentsBetween(first, last);
  const month = date.slice(0, 7);
  // Rows of items that fit in a day box before switching to "+N more".
  const maxLanes = layout === 'compact' ? 3 : 4;

  const items = useMemo(
    () => [...(appts ?? []), ...(showHolidays ? holidaysBetween(first, last).map(holidayAsItem) : [])],
    [appts, showHolidays, first, last],
  );

  if (!appts) return null;

  return (
    <div className="mo">
      <div className="mo-head" aria-hidden>
        {DOW.map((d) => (
          <div key={d}>{layout === 'compact' ? d.slice(0, 1) : d.slice(0, 3)}</div>
        ))}
      </div>
      {weeks.map((week) => {
        const lanes = layoutBand(items, week);
        const shown = lanes.slice(0, maxLanes);
        const hidden = lanes.slice(maxLanes).flat();
        const more = week.map((_, i) => hidden.filter((it) => it.startCol <= i && it.endCol >= i).length);
        const rows = shown.length + (more.some((n) => n > 0) ? 1 : 0);
        return (
          <div key={week[0]} className="mo-week" style={{ gridTemplateRows: `var(--mo-num-h) repeat(${rows}, auto) 1fr` }}>
            {week.map((d, i) => {
              const count = items.filter((it) => it.start_date <= d && it.end_date >= d).length;
              return (
                <button
                  key={d}
                  type="button"
                  className={`mo-day ${d === today ? 'today' : ''} ${d.slice(0, 7) !== month ? 'other-month' : ''}`}
                  style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
                  onClick={() => go({ view: 'day', date: d })}
                  aria-label={`${dayLabel(d)}${count ? `, ${count} ${count === 1 ? 'item' : 'items'}` : ''}`}
                >
                  <span className="mo-num">{fromISODate(d).getDate()}</span>
                </button>
              );
            })}
            {shown.map((lane, li) =>
              lane.map((it) => <MonthChip key={'key' in it.appt ? String(it.appt.key) : it.appt.id} item={it} row={li + 2} compact={layout === 'compact'} />),
            )}
            {more.map((n, i) =>
              n > 0 ? (
                <div key={i} className="mo-more" style={{ gridColumn: i + 1, gridRow: shown.length + 2 }} aria-hidden>
                  +{n}
                </div>
              ) : null,
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthChip({ item, row, compact }: { item: BandItem; row: number; compact: boolean }) {
  const a = item.appt;
  const holiday = isHolidayItem(a);
  const special = a.kind === 'special_date';
  const timed = !special && !a.all_day && a.start_date === a.end_date;
  const time = timed && !compact ? timeLabel(a.start_time).replace(':00', '').replace(' ', '') : '';
  return (
    <div
      className={[
        'mo-chip',
        special ? 'holiday' : a.kind === 'low_priority' ? 'low' : 'appt',
        holiday && a.holiday.observed && 'observed',
        item.before && 'cont-before',
        item.after && 'cont-after',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ gridColumn: `${item.startCol + 1} / ${item.endCol + 2}`, gridRow: row }}
      aria-hidden
    >
      {time && <span className="mo-time">{time} </span>}
      {a.title}
    </div>
  );
}
