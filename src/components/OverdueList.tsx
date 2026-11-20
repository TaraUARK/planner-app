import { moveTaskOccurrence, setOccurrenceDone, skipOccurrence } from '../lib/data';
import { isISODate, shortDate } from '../lib/dates';
import { useToday } from '../lib/hooks';
import { useOverdue, useProjects } from '../lib/queries';
import { Modal } from './Modal';

/** Every overdue task in one place: mark it done, or give it a new date. */
export function OverdueList({ onClose }: { onClose: () => void }) {
  const today = useToday();
  const overdue = useOverdue(today);
  const projects = useProjects();
  if (!overdue || !projects) return null;
  const byId = new Map(projects.map((p) => [p.id, p]));

  return (
    <Modal title={`Overdue (${overdue.length})`} onClose={onClose}>
      {overdue.length === 0 ? (
        <p className="placeholder">Nothing overdue.</p>
      ) : (
        <ul className="overdue-list">
          {overdue.map((t) => {
            const p = byId.get(t.project_id);
            return (
              <li key={t.key} className={`item ${p?.category ?? 'work'} overdue`}>
                <input
                  type="checkbox"
                  className="check"
                  aria-label="Mark done"
                  checked={false}
                  onChange={() => void setOccurrenceDone(t, true)}
                />
                <div className="item-body">
                  <span className="item-title">{t.title}</span>
                  <span className="item-meta">
                    <span className="overdue-tag">! {shortDate(t.date)}</span>
                    {p?.name}
                    {t.repeating && ' · ↻ repeats'}
                  </span>
                  <div className="overdue-actions">
                    <button type="button" onClick={() => void moveTaskOccurrence(t, today)}>
                      Move to today
                    </button>
                    {t.repeating && (
                      <button type="button" onClick={() => void skipOccurrence('task', t.id, t.originalDate)}>
                        Skip
                      </button>
                    )}
                    <label className="muted small">
                      or{' '}
                      <input
                        type="date"
                        aria-label="New date"
                        min={today}
                        onChange={(e) => isISODate(e.target.value) && void moveTaskOccurrence(t, e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
