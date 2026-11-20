import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { Account } from '../lib/account';
import { db } from '../lib/db';
import { useLayout, useSyncState, useWindowSize } from '../lib/hooks';
import { setSetting, useSettings } from '../lib/settings';
import { syncNow } from '../lib/sync';

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row">
      <span className="label">{props.label}</span>
      <input
        type="checkbox"
        className="switch"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function SettingsView({ account }: { account: Account }) {
  const settings = useSettings(account.settingsId);
  const sync = useSyncState();
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const size = useWindowSize();
  const layout = useLayout();
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const signOut = async () => {
    if (account.mode !== 'synced') return;
    const msg =
      pending > 0
        ? `${pending} change(s) haven't reached the server yet and will be lost if you sign out now. Sign out anyway?`
        : 'Sign out of the planner on this device?';
    if (!window.confirm(msg)) return;
    await account.client.auth.signOut({ scope: 'local' });
    await db.delete();
    window.location.reload();
  };

  const syncText = (() => {
    switch (sync.kind) {
      case 'local-only':
        return 'Not connected (data stays on this device)';
      case 'offline':
        return 'Offline';
      case 'syncing':
        return 'Syncing…';
      case 'synced':
        return `Synced at ${new Date(sync.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      case 'error':
        return `Problem: ${sync.message}`;
    }
  })();

  return (
    <div className="page">
      <h2>Display</h2>
      <div className="card">
        <Toggle
          label="Hide completed tasks"
          checked={settings?.hide_completed ?? false}
          onChange={(v) => void setSetting(account.settingsId, { hide_completed: v })}
        />
        <Toggle
          label="Show holidays"
          checked={settings?.show_holidays ?? true}
          onChange={(v) => void setSetting(account.settingsId, { show_holidays: v })}
        />
      </div>

      <h2>Sync</h2>
      <div className="card">
        <Info label="Status" value={syncText} />
        {account.mode === 'synced' && (
          <>
            <Info label="Changes waiting to sync" value={String(pending)} />
            <Info label="Signed in as" value={account.email} />
            <div className="row">
              <button onClick={() => void syncNow()}>Sync now</button>
              <span className="label" />
              <button onClick={() => void signOut()}>Sign out</button>
            </div>
          </>
        )}
      </div>

      <h2>Colors</h2>
      <div className="card">
        <div className="swatches">
          <span className="chip work"><span>Work task</span></span>
          <span className="chip home"><span>Home task</span></span>
          <span className="chip appt"><span>Appointment</span></span>
          <span className="chip holiday"><span>Holiday / special date</span></span>
          <span className="chip overdue"><b>!</b><span>Overdue task</span></span>
          <span className="chip work done"><span>Completed task</span></span>
          <span className="chip today"><span>Today</span></span>
        </div>
      </div>

      <h2>About this device</h2>
      <div className="card">
        <Info label="App version" value={`${__APP_VERSION__} (built ${new Date(__BUILD_TIME__).toLocaleString()})`} />
        <Info label="Screen size (points)" value={`${size.width} × ${size.height}`} />
        <Info label="Layout" value={layout === 'wide' ? 'Wide (computer)' : 'Compact (phone)'} />
        <Info label="Pixel ratio" value={`${window.devicePixelRatio}×`} />
        <Info label="Installed as an app" value={isInstalled() ? 'Yes' : 'No (running in a browser tab)'} />
        <Info
          label="Storage kept permanently"
          value={persisted === null ? 'Unknown' : persisted ? 'Yes' : 'Not yet'}
        />
      </div>
    </div>
  );
}
