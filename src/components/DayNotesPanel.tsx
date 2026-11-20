import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { saveDayNote } from '../lib/data';
import { timeLabel } from '../lib/dates';
import type { Holiday } from '../lib/holidays';
import { useLayout } from '../lib/hooks';
import { useDayNote } from '../lib/queries';
import type { ApptOcc } from '../lib/recur';
import { titleWithYears } from '../lib/specialDates';
import type { ISODate } from '../lib/types';
import { useEditor } from './Editor';
import { ChevronRight } from './Icons';
import { NoteButton } from './NoteButton';

const SAVE_DELAY = 600;

/**
 * Notes for one day (Day view). Holidays, special dates and low-priority
 * events sit as cards at the top; below them a plain text box that saves
 * automatically. Mac: always shown, to the right of the list, at least as tall
 * as the list. Phone: one line that opens and closes.
 */
export function DayNotesPanel(props: { date: ISODate; holidays: Holiday[]; cards: ApptOcc[] }) {
  const { date, holidays, cards } = props;
  const layout = useLayout();
  const editor = useEditor();
  const saved = useDayNote(date);
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const focused = useRef(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const box = useRef<HTMLTextAreaElement>(null);

  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current !== null) void saveDayNote(date, pending.current);
    pending.current = null;
  };

  // Show the saved note; pick up changes from the other device unless typing here.
  useEffect(() => {
    if (saved === undefined) return;
    if (!focused.current && pending.current === null) setText(saved?.body ?? '');
  }, [saved]);

  // Save what's waiting when leaving the day or the app.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Grow the box with its text (it's never shorter than the space it fills).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, open, layout]);

  if (text === null) return null;

  const cardList = (
    <ul className="side-cards">
      {holidays.map((h) => (
        <li key={h.slug} className={`item holiday ${h.observed ? 'observed' : ''}`}>
          <div className="item-body">
            <span className="item-title">{h.name}</span>
            <span className="item-meta">Holiday</span>
          </div>
        </li>
      ))}
      {cards.map((a) => {
        const special = a.kind === 'special_date';
        const meta = special
          ? 'Special date'
          : a.all_day || a.start_date !== a.end_date
            ? 'All day'
            : `${timeLabel(a.start_time)} – ${timeLabel(a.end_time)}`;
        const openIt = () => editor.openAppointment(a.id, date, a.repeating ? a.originalDate : undefined);
        return (
          <li key={a.key} className={`item ${special ? 'holiday' : 'low'}`}>
            <button type="button" className="item-body plain" onClick={openIt}>
              <span className="item-title">{special ? titleWithYears(a) : a.title}</span>
              <span className="item-meta">
                {meta}
                {a.location && ` · ${a.location}`}
              </span>
            </button>
            {a.notes.trim() && <NoteButton label={a.title} onOpen={() => editor.showNote(a.title, a.notes, openIt)} />}
          </li>
        );
      })}
    </ul>
  );

  const textBox = (
    <textarea
      ref={box}
      className="day-notes-text"
      placeholder="Notes for this day…"
      aria-label="Notes for this day"
      value={text}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        flush();
      }}
      onChange={(e) => {
        setText(e.target.value);
        pending.current = e.target.value;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY);
      }}
    />
  );

  if (layout === 'wide') {
    return (
      <section className="day-notes" aria-label="Notes">
        <h3 className="day-notes-title">Notes</h3>
        {cardList}
        {textBox}
      </section>
    );
  }

  // Phone: one line until opened, with a hint of what's inside.
  const hint = [...holidays.map((h) => h.name), ...cards.map((c) => (c.kind === 'special_date' ? titleWithYears(c) : c.title))];
  if (text.trim()) hint.push('note');
  return (
    <section className={`day-notes compact ${open ? 'open' : ''}`} aria-label="Notes">
      <button className="bring-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="bring-title">Notes</span>
        {!open && hint.length > 0 && <span className="day-notes-hint">{hint.join(' · ')}</span>}
        <span className="grow" />
        <span className="bring-chevron" aria-hidden>
          <ChevronRight />
        </span>
      </button>
      {open && (
        <div className="day-notes-body">
          {cardList}
          {textBox}
        </div>
      )}
    </section>
  );
}
