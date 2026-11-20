// "Download backup": every table on this device as one JSON file. The same
// format as the nightly backups, so the restore workflow accepts either.

import { todayISO } from './dates';
import { db } from './db';
import { TABLES } from './types';

export interface BackupFile {
  app: 'planner';
  format: 1;
  source: 'download' | 'nightly';
  exported_at: string;
  app_version?: string;
  tables: Record<string, unknown[]>;
}

export async function buildBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = await db.table(t).toArray();
  return {
    app: 'planner',
    format: 1,
    source: 'download',
    exported_at: new Date().toISOString(),
    app_version: __APP_VERSION__,
    tables,
  };
}

/** Save the backup file: share sheet on the phone (Save to Files), a normal download elsewhere. */
export async function downloadBackup(): Promise<{ name: string; counts: Record<string, number> }> {
  const backup = await buildBackup();
  const name = `planner-backup-${todayISO()}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  const counts = Object.fromEntries(Object.entries(backup.tables).map(([t, rows]) => [t, rows.length]));

  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return { name, counts };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e; // user closed the share sheet
      // otherwise fall back to a normal download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { name, counts };
}
