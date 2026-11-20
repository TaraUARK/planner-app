import { useEffect, useState } from 'react';
import { createAppointment, deleteAppointment, updateAppointment, type AppointmentInput } from '../lib/data';
import { isISODate } from '../lib/dates';
import { useAppointment } from '../lib/queries';
import type { Appointment, ISODate } from '../lib/types';
import { Modal } from './Modal';

/** Special dates (birthdays, anniversaries…) repeat every year by default. */
const YEARLY = 'FREQ=YEARLY';

/** Add an appointment / special date (id = null), or open an existing one. */
export function AppointmentForm(props: { id: string | null; date: ISODate; onClose: () => void }) {
  const { id, onClose } = props;
  const existing = useAppointment(id);
  const [kind, setKind] = useState<Appointment['kind']>('appointment');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(props.date);
  const [endDate, setEndDate] = useState(props.date);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(id === null);

  useEffect(() => {
    if (loaded || !existing) return;
    setKind(existing.kind);
    setTitle(existing.title);
    setStartDate(existing.start_date);
    setEndDate(existing.end_date);
    setAllDay(existing.all_day);
    if (existing.start_time) setStartTime(existing.start_time.slice(0, 5));
    if (existing.end_time) setEndTime(existing.end_time.slice(0, 5));
    setLocation(existing.location);
    setNotes(existing.notes);
    setLoaded(true);
  }, [existing, loaded]);

  if (id && existing === null) {
    return (
      <Modal title="Appointment" onClose={onClose}>
        <p className="muted">This item no longer exists.</p>
      </Modal>
    );
  }

  const special = kind === 'special_date';

  const save = async () => {
    if (!title.trim()) return setError('Enter a title.');
    if (!isISODate(startDate)) return setError('Choose a date.');
    let input: AppointmentInput;
    if (special) {
      input = {
        kind, title, start_date: startDate, end_date: startDate, all_day: true,
        start_time: null, end_time: null, location: '', notes,
        rrule: existing?.kind === 'special_date' ? existing.rrule : YEARLY,
      };
    } else {
      if (!isISODate(endDate)) return setError('Choose an end date.');
      if (endDate < startDate) return setError('The end date is before the start date.');
      if (!allDay && endDate === startDate && endTime < startTime) return setError('The end time is before the start time.');
      input = {
        kind, title, start_date: startDate, end_date: endDate, all_day: allDay,
        start_time: allDay ? null : startTime, end_time: allDay ? null : endTime,
        location, notes, rrule: existing?.kind === 'appointment' ? existing.rrule : null,
      };
    }
    if (id) await updateAppointment(id, input);
    else await createAppointment(input);
    onClose();
  };

  const remove = async () => {
    if (!id || !window.confirm(`Delete this ${special ? 'special date' : 'appointment'}?`)) return;
    await deleteAppointment(id);
    onClose();
  };

  return (
    <Modal
      title={id ? (special ? 'Special date' : 'Appointment') : 'Add appointment'}
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
        <div className="segmented" role="group" aria-label="Type">
          <button type="button" aria-pressed={!special} className={!special ? 'on appt' : ''} onClick={() => setKind('appointment')}>
            Appointment
          </button>
          <button type="button" aria-pressed={special} className={special ? 'on holiday' : ''} onClick={() => setKind('special_date')}>
            Special date
          </button>
        </div>

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
            <p className="muted small">Repeats every year. (More repeat options come in a later stage.)</p>
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
                    // Keep the end date from falling before the start date.
                    if (endDate < v) setEndDate(v);
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
          </>
        )}

        <label className="field">
          <span>Notes</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
