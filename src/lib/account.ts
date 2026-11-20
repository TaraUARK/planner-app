import type { SupabaseClient } from '@supabase/supabase-js';

/** Who is using the app on this device. */
export type Account =
  | { mode: 'local'; settingsId: 'local' }
  | { mode: 'synced'; settingsId: string; email: string; client: SupabaseClient };
