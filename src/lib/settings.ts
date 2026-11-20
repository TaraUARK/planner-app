import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { createRow, updateRow } from './outbox';
import type { Settings } from './types';

export const DEFAULT_SETTINGS = { hide_completed: false, show_holidays: true };

/** Create the settings row if this account doesn't have one yet. */
export async function ensureSettings(id: string): Promise<void> {
  if (await db.settings.get(id)) return;
  await createRow(db, 'settings', { id, ...DEFAULT_SETTINGS });
}

export function useSettings(id: string): Settings | undefined {
  return useLiveQuery(() => db.settings.get(id), [id]);
}

export async function setSetting(
  id: string,
  patch: Partial<Pick<Settings, 'hide_completed' | 'show_holidays'>>,
): Promise<void> {
  if (await db.settings.get(id)) await updateRow(db, 'settings', id, patch);
  else await createRow(db, 'settings', { id, ...DEFAULT_SETTINGS, ...patch });
}
