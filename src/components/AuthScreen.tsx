import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent } from 'react';

/** Email + password sign-in. There is no sign-up form (public sign-ups are off). */
export function AuthScreen({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) {
      setError("You're offline. Connect to the internet to sign in the first time.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
  };

  return (
    <div className="auth">
      <form onSubmit={(e) => void submit(e)}>
        <h1>Planner</h1>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
