import { useEffect, useState } from 'react';
import {
  createAppointment,
  deleteAppointment,
  editAppointmentFromHere,
  editAppointmentOccurrence,
  endSeriesBefore,
  skipOccurrence,
  updateAppointment,
  type AppointmentInput,
} from '../lib/data';
import { db } from '../lib/db';
import { isISODate } from '../lib/dates';
import { useAppointment } from '../lib/queries';
import {
  apptOccKey,
  defaultSpec,
  exceptionId,
  expandAppointments,
  oneTimeAppt,
  rruleToSpec,
  specToRRule,
  type ApptOcc,
  type RepeatSpec,
} from '../lib/recur';
import type { Appointment, ISODate } from '../lib/types';
import { Modal } from './Modal';
import { RepeatEditor, ScopeChooser } from './RepeatEditor';

/** Special dates (birthdays, anniversaries…) repeat every year by default. */
const YEARLY = 'FREQ=YEARLY';

async function loadOccurrence(series: Appointment, originalDate: ISODate | undefined): Promise<ApptOcc> {
  if (!series.rrule || !originalDate) return oneTimeAppt(series);
  const e = await db.occurrence_exceptions.get(exceptionId('appointment', series.id, originalDate));
  const ex = e && !e.deleted_at ? [e] : [];
  const day = e?.new_date ?? originalDate;
  const found = expandAppointments([series], ex, day, day).find((o) => o.originalDate === originalDate);
  return found ?? { ...series, originalDate, repeating: true, key: apptOccKey(series.id, originalDate) };
}

/** Add an appointment / special date (id = null), or open one. `originalDate` = which occurrence. */
export function AppointmentForm(props: { id: string | null; date: ISODate; originalDate?: ISODate; onClose: () => void }) {
  const { id, onClose } = props;
  const series = useAppointment(id);
  const [occ, setOcc] = useState<ApptOcc | null>(null);
  const [kind, setKind] = useState<Appointment['kind']>('appointment');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(props.date);
  const [endDate, setEndDate] = useState(props.date);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [spec, setSpec] = useState<RepeatSpec>(defaultSpec(props.date));
  const [repeatTouched, setRepeatTouched] = useState(false);
  const [asking, setAsking] = useState<null | 'save' | 'delete'>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(id === null);

  useEffect(() => {
    if (loaded || !series) return;
    void (async () => {
      const o = await loadOccurrence(series, props.originalDate);
      setOcc(o);
      setKind(o.kind);
      setTitle(o.title);
      setStartDate(o.start_date);
      setEndDate(o.end_date);
      setAllDay(o.all_day);
      if (o.start_time) setStartTime(o.start_time.slice(0, 5));
      if (o.end_time) setEndTime(o.end_time.slice(0, 5));
      setLocation(o.location);
      setNotes(o.notes);
      setSpec(rruleToSpec(series.rrule, series.start_date));
      setLoaded(true);
    })();
  }, [series, loaded, props.originalDate]);

  if (id && series === null) {
    return (
      <Modal title="Appointment" onClose={onClose}>
        <p className="muted">This item no longer exists.</p>
      </Modal>
    );
  }

  const special = kind === 'special_date';
  const repeating = !!series?.rrule && !!occ?.repeating;

  /** The form's values as a stored appointment. `rule` = the repeat rule to save. */
  const buildInput = (rule: string | null): AppointmentInput | string => {
    if (!title.trim()) return 'Enter a title.';
    if (!isISODate(startDate)) return 'Choose a date.';
    if (special) {
      return {
        kind, title, start_date: startDate, end_date: startDate, all_day: true,
        start_time: null, end_time: null, location: '', notes, rrule: rule,
      };
    }
    if (!isISODate(endDate)) return 'Choose an end date.';
    if (endDate < startDate) return 'The end date is before the start date.';
    if (!allDay && endDate === startDate && endTime < startTime) return 'The end time is before the start time.';
    return {
      kind, title, start_date: startDate, end_date: endDate, all_day: allDay,
      start_time: allDay ? null : startTime, end_time: allDay ? null : endTime,
      location, notes, rrule: rule,
    };
  };

  /** Repeat rule from the form: special dates are yearly; otherwise the Repeat editor. */
  const formRule = () => (special ? (series?.kind === 'special_date' && series.rrule ? series.rrule : YEARLY) : specToRRule(spec, startDate));

  const save = async () => {
    const input = buildInput(formRule());
    if (typeof input === 'string') return setError(input);
    if (!id || !series || !occ) {
      await createAppointment(input);
      return onClose();
    }
    if (!repeating) {
      await updateAppointment(id, input);
      return onClose();
    }
    setAsking('save');
  };

  const saveRepeating = async (scope: 'one' | 'future') => {
    if (!series || !occ) return;
    if (scope === 'one') {
      const input = buildInput(series.rrule);
      if (typeof input === 'string') return setError(input);
      await editAppointmentOccurrence(series, occ, input);
    } else {
      const rule =
        special || repeatTouched
          ? formRule()
          : specToRRule(rruleToSpec(series.rrule, series.start_date), startDate);
      const input = buildInput(rule);
      if (typeof input === 'string') return setError(input);
      await editAppointmentFromHere(series, occ.originalDate, input);
    }
    onClose();
  };

  const remove = async () => {
    if (!id) return;
    if (repeating) return setAsking('delete');
    if (!window.confirm(`Delete this ${special ? 'special date' : kind === 'low_priority' ? 'low priority event' : 'appointment'}?`)) return;
    await deleteAppointment(id);
    onClose();
  };

  const removeRepeating = async (scope: 'one' | 'future') => {
    if (!series || !occ) return;
    if (scope === 'one') await skipOccurrence('appointment', series.id, occ.originalDate);
    else await endSeriesBefore('appointment', series.id, occ.originalDate);
    onClose();
  };

  return (
    <Modal
      title={
        id
          ? special
            ? 'Special date'
            : `${repeating ? 'Repeating ' : ''}${kind === 'low_priority' ? 'low priority event' : 'appointment'}`.replace(/^./, (c) => c.toUpperCase())
          : 'Add appointment'
      }
      onClose={onClose}
      footer={
        <>
          {id && (
            <button type="button" className="danger" onClick={() => void remove()}>
              Delete
            </button>
          )}
          <span className="grow" />
          <button type="button" className="primary" onClick={() => void save()} disabled={!loaded}>
            {id ? 'Save' : 'Add'}
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
        {/* Type. A special date can't be switched to/from the others once saved. */}
        {(!id || !special) && (
          <div className="segmented" role="group" aria-label="Type">
            <button type="button" aria-pressed={kind === 'appointment'} className={kind === 'appointment' ? 'on appt' : ''} onClick={() => setKind('appointment')}>
              Appointment
            </button>
            <button type="button" aria-pressed={kind === 'low_priority'} className={kind === 'low_priority' ? 'on low' : ''} onClick={() => setKind('low_priority')}>
              Low priority
            </button>
            {!id && (
              <button type="button" aria-pressed={special} className={special ? 'on holiday' : ''} onClick={() => setKind('special_date')}>
                Special date
              </button>
            )}
          </div>
        )}

        <label className="field">
          <span>Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={special ? "Mom's birthday" : 'Dentist'}
            autoFocus={!id}
          />
        </label>

        {special ? (
          <>
            <label className="field">
              <span>Date</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <p className="muted small">Repeats every year.</p>
          </>
        ) : (
          <>
            <label className="field-inline">
              <input type="checkbox" className="switch" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>All day</span>
            </label>
            <div className="field-row">
              <label className="field">
                <span>Starts</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Keep the same length when the start moves.
                    if (isISODate(v) && isISODate(startDate) && isISODate(endDate)) {
                      const len = (Date.parse(endDate) - Date.parse(startDate)) / 86400000;
                      const end = new Date(Date.parse(v) + len * 86400000).toISOString().slice(0, 10);
                      setEndDate(end);
                    }
                    setStartDate(v);
                  }}
                />
              </label>
              {!allDay && (
                <label className="field">
                  <span>Time</span>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </label>
              )}
            </div>
            <div className="field-row">
              <label className="field">
                <span>Ends</span>
                <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
              {!allDay && (
                <label className="field">
                  <span>Time</span>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </label>
              )}
            </div>
            <label className="field">
              <span>Location</span>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <RepeatEditor
              spec={spec}
              start={startDate}
              onChange={(s) => {
                setSpec(s);
                setRepeatTouched(true);
              }}
            />
          </>
        )}

        <label className="field">
          <span>Notes</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
      </form>

      {asking && (
        <ScopeChooser
          action={asking}
          allowThisOnly={asking === 'delete' || !repeatTouched}
          onCancel={() => setAsking(null)}
          onChoose={(scope) => {
            setAsking(null);
            void (asking === 'save' ? saveRepeating(scope) : removeRepeating(scope));
          }}
        />
      )}
    </Modal>
  );
}
