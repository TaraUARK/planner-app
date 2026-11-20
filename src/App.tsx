import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { Shell } from './components/Shell';
import { ensureSettings } from './lib/settings';
import { supabase } from './lib/supabase';
import { startSync } from './lib/sync';

export default function App() {
  if (!supabase) return <LocalOnly />;
  return <SignedIn client={supabase} />;
}

/** Not connected to Supabase yet: everything stays on this device. */
function LocalOnly() {
  useEffect(() => {
    void ensureSettings('local');
  }, []);
  return <Shell account={{ mode: 'local', settingsId: 'local' }} />;
}

function SignedIn({ client }: { client: SupabaseClient }) {
  // undefined = still checking the saved session
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [client]);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    return startSync(client, () => ensureSettings(userId));
  }, [client, userId]);

  if (session === undefined) return null;
  if (!session) return <AuthScreen client={client} />;
  return (
    <Shell
      account={{ mode: 'synced', settingsId: session.user.id, email: session.user.email ?? '', client }}
    />
  );
}
