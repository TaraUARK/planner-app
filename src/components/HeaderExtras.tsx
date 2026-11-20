import { useEditor } from './Editor';
import { EyeIcon, EyeOffIcon } from './Icons';
import { useToday } from '../lib/hooks';
import { useOverdue } from '../lib/queries';
import { setSetting, useSettings } from '../lib/settings';

/** "! 3" — how many tasks are overdue. Opens the overdue list. Hidden when there are none. */
export function OverdueBadge() {
  const today = useToday();
  const overdue = useOverdue(today);
  const editor = useEditor();
  const n = overdue?.length ?? 0;
  if (n === 0) return null;
  return (
    <button className="overdue-badge" onClick={editor.openOverdue} aria-label={`${n} overdue ${n === 1 ? 'task' : 'tasks'}`}>
      ! {n}
    </button>
  );
}

/** Show / hide completed tasks (same setting as in Settings). */
export function HideDoneToggle({ settingsId }: { settingsId: string }) {
  const settings = useSettings(settingsId);
  const hidden = settings?.hide_completed ?? false;
  return (
    <button
      className={`icon plain ${hidden ? 'toggle-on' : ''}`}
      aria-pressed={hidden}
      aria-label={hidden ? 'Completed tasks hidden — tap to show' : 'Hide completed tasks'}
      title={hidden ? 'Completed tasks hidden' : 'Hide completed tasks'}
      onClick={() => void setSetting(settingsId, { hide_completed: !hidden })}
    >
      {hidden ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );
}
