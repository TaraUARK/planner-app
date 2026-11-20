import { format } from 'date-fns';
import { useState } from 'react';
import { scheduleLabel } from '../lib/bring';
import { createBringItem, deleteBringItem, setBringCheck, updateBringItem } from '../lib/data';
import { fromISODate } from '../lib/dates';
import { useToday } from '../lib/hooks';
import { useBringList } from '../lib/queries';
import type { BringItem, ISODate } from '../lib/types';
import { ChevronRight } from './Icons';
import { Modal } from './Modal';

/**
 * "To bring" at the top of the Day view. Collapsed to one line by default;
 * tap the title to open the list. Each day keeps its own ticks.
 */
export function BringBar({ date }: { date: ISODate }) {
  const today = useToday();
  const rows = useBringList(date, today);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BringItem | 'new' | null>(null);
  if (!rows) return null;

  const dialog = editing && (
    <BringItemDialog item={editing === 'new' ? null : editing} date={date} onClose={() => setEditing(null)} />
  );

  // Nothing to bring this day: just a small way to add something.
  if (rows.length === 0) {
    return (
      <>
        <button className="bring-empty plain" onClick={() => setEditing('new')}>
          + Something to bring
        </button>
        {dialog}
      </>
    );
  }

  const allPacked = rows.every((r) => r.checked);
  return (
    <section className={`bring ${open ? 'open' : ''}`}>
      <button className="bring-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="bring-title">To bring</span>
        {allPacked && (
          <span className="bring-all" aria-label="everything packed" title="Everything packed">
            ✓
          </span>
        )}
        <span className="grow" />
        <span className="bring-chevron" aria-hidden>
          <ChevronRight />
        </span>
      </button>
      {open && (
        <div className="bring-body">
          <ul className="bring-list">
            {rows.map((r) => (
              <li key={`${r.item.id}@${r.checkDate}`} className={r.checked ? 'done' : ''}>
                <input
                  type="checkbox"
                  className="check"
                  checked={r.checked}
                  aria-label={`${r.item.name}${r.checked ? ' (packed)' : ''}`}
                  onChange={() => void setBringCheck(r.item.id, r.checkDate, !r.checked)}
                />
                <button type="button" className="plain bring-name" onClick={() => setEditing(r.item)}>
                  {r.item.name}
                </button>
                <span className={`bring-tag ${r.carriedFrom ? 'carried' : ''}`}>
                  {r.carriedFrom ? `from ${format(fromISODate(r.carriedFrom), 'EEE')}` : scheduleLabel(r.item)}
                </span>
              </li>
            ))}
          </ul>
          <button className="plain bring-add" onClick={() => setEditing('new')}>
            + Add item
          </button>
        </div>
      )}
      {dialog}
    </section>
  );
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS = [0, 1, 2, 3, 4];

function BringItemDialog(props: { item: BringItem | null; date: ISODate; onClose: () => void }) {
  const { item, date, onClose } = props;
  const [name, setName] = useState(item?.name ?? '');
  const [kind, setKind] = useState<BringItem['kind']>(item?.kind ?? 'once');
  const [weekdays, setWeekdays] = useState<number[]>(item?.kind === 'weekly' ? item.weekdays : WEEKDAYS);
  const [error, setError] = useState<string | null>(null);
  const dayName = format(fromISODate(item?.kind === 'once' ? item.date : date), 'EEEE, MMM d');

  const save = async () => {
    if (!name.trim()) return setError('Enter what to bring.');
    if (kind === 'weekly' && weekdays.length === 0) return setError('Choose at least one day.');
    const input = { name, kind, weekdays: kind === 'weekly' ? [...weekdays].sort() : [] };
    if (item) await updateBringItem(item.id, input);
    else await createBringItem({ ...input, date });
    onClose();
  };

  const remove = async () => {
    if (!item) return;
    const msg =
      item.kind === 'once' ? `Delete “${item.name}”?` : `Remove “${item.name}” from every day's list?`;
    if (!window.confirm(msg)) return;
    await deleteBringItem(item.id);
    onClose();
  };

  const toggleDay = (d: number) =>
    setWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d]);

  return (
    <Modal
      title={item ? 'Item to bring' : 'Add something to bring'}
      onClose={onClose}
      footer={
        <>
          {item && (
            <button type="button" className="danger" onClick={() => void remove()}>
              Delete
            </button>
          )}
          <span className="grow" />
          <button type="button" className="primary" onClick={() => void save()}>
            {item ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span>Item</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Laptop charger" autoFocus={!item} />
        </label>

        <div className="field">
          <span>When</span>
          <div className="segmented bring-kind" role="group" aria-label="When">
            {(
              [
                ['once', 'This day only'],
                ['weekly', 'Certain days'],
                ['alternate', 'Every other day'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? 'on work' : ''} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {kind === 'once' && <p className="muted small">Only on {dayName}. If it isn't ticked that day, it carries over to the next day until it is.</p>}

        {kind === 'weekly' && (
          <div className="field">
            <div className="weekday-picker" role="group" aria-label="Days">
              {DAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={weekdays.includes(i)}
                  aria-label={DAY_NAMES[i]}
                  className={weekdays.includes(i) ? 'on' : ''}
                  onClick={() => toggleDay(i)}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="bring-presets">
              <button type="button" className="plain" onClick={() => setWeekdays(WEEKDAYS)}>
                Weekdays
              </button>
              <button type="button" className="plain" onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}>
                Every day
              </button>
            </div>
          </div>
        )}

        {kind === 'alternate' && (
          <p className="muted small">
            Every other day, starting {format(fromISODate(item?.kind === 'alternate' ? item.date : date), 'EEEE, MMM d')}.
          </p>
        )}
        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
