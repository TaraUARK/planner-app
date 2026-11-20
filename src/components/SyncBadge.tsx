import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useSyncState } from '../lib/hooks';

/** Small status: Local only / Offline / Syncing / Synced / N waiting / Sync problem. */
export function SyncBadge({ onClick }: { onClick?: () => void }) {
  const state = useSyncState();
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0;

  let dot = '';
  let text: string;
  switch (state.kind) {
    case 'local-only':
      text = 'Local only';
      break;
    case 'offline':
      dot = 'warn';
      text = pending ? `Offline · ${pending} waiting` : 'Offline';
      break;
    case 'syncing':
      dot = 'busy';
      text = 'Syncing…';
      break;
    case 'synced':
      dot = pending ? 'busy' : 'ok';
      text = pending ? `${pending} waiting` : 'Synced';
      break;
    case 'error':
      dot = 'bad';
      text = 'Sync problem';
      break;
  }

  return (
    <button className="sync-badge" onClick={onClick} title={state.kind === 'error' ? state.message : text}>
      <span className={`sync-dot ${dot}`} aria-hidden />
      <span>{text}</span>
    </button>
  );
}
