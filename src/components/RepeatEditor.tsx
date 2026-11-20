import { describeSpec, monthlyChoices, type Freq, type RepeatSpec } from '../lib/recur';
import type { ISODate } from '../lib/types';
import { Modal } from './Modal';

const FREQS: { value: Freq; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];
const UNIT: Record<Freq, string> = { none: '', daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' };
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The Repeat section of the task / appointment forms. */
export function RepeatEditor(props: { spec: RepeatSpec; start: ISODate; onChange: (s: RepeatSpec) => void }) {
  const { spec, start, onChange } = props;
  const set = (patch: Partial<RepeatSpec>) => onChange({ ...spec, ...patch });
  const monthly = monthlyChoices(start);

  return (
    <div className="repeat">
      <label className="field">
        <span>Repeat</span>
        <select value={spec.freq} onChange={(e) => set({ freq: e.target.value as Freq })}>
          {FREQS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      {spec.freq !== 'none' && (
        <>
          <label className="field-inline">
            <span>Every</span>
            <input
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              className="num"
              value={spec.interval}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span>{spec.interval === 1 ? UNIT[spec.freq].replace(/s$/, '') : UNIT[spec.freq]}</span>
          </label>

          {spec.freq === 'weekly' && (
            <div className="weekday-picker" role="group" aria-label="Repeat on">
              {WEEKDAYS.map((d, i) => {
                const on = spec.weekdays.includes(i);
                return (
                  <button
                    type="button"
                    key={i}
                    aria-pressed={on}
                    aria-label={WEEKDAY_NAMES[i]}
                    className={on ? 'on' : ''}
                    onClick={() =>
                      set({
                        weekdays: on
                          ? spec.weekdays.length > 1
                            ? spec.weekdays.filter((x) => x !== i)
                            : spec.weekdays
                          : [...spec.weekdays, i],
                      })
                    }
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}

          {spec.freq === 'monthly' && (
            <label className="field">
              <span>On</span>
              <select value={spec.monthly} onChange={(e) => set({ monthly: e.target.value as RepeatSpec['monthly'] })}>
                <option value="date">{monthly.dateLabel}</option>
                <option value="nth">{monthly.nthLabel}</option>
                {monthly.lastLabel && <option value="last">{monthly.lastLabel}</option>}
              </select>
            </label>
          )}

          <div className="field-inline">
            <label className="field-inline">
              <input
                type="checkbox"
                className="switch"
                checked={!!spec.until}
                onChange={(e) => set({ until: e.target.checked ? start : null })}
              />
              <span>Ends on</span>
            </label>
            {spec.until && (
              <input
                type="date"
                aria-label="Repeat until"
                value={spec.until}
                min={start}
                onChange={(e) => set({ until: e.target.value || null })}
              />
            )}
          </div>
          <p className="muted small">{describeSpec(spec, start)}</p>
        </>
      )}
    </div>
  );
}

/** Asked when saving or deleting one occurrence of a repeating item. */
export function ScopeChooser(props: {
  action: 'save' | 'delete';
  allowThisOnly: boolean;
  onChoose: (scope: 'one' | 'future') => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={props.action === 'save' ? 'Save repeating item' : 'Delete repeating item'} onClose={props.onCancel}>
      <div className="scope-choices">
        <p>{props.action === 'save' ? 'Apply these changes to:' : 'Delete:'}</p>
        {props.allowThisOnly ? (
          <button type="button" onClick={() => props.onChoose('one')}>
            This one only
          </button>
        ) : (
          <p className="muted small">Changing the repeat pattern applies to this and all future ones.</p>
        )}
        <button type="button" className={props.action === 'delete' ? 'danger' : 'primary'} onClick={() => props.onChoose('future')}>
          This and all future ones
        </button>
        <button type="button" className="plain" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
