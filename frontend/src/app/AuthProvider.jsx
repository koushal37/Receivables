import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { api } from '../lib/api';
import { AuthContext } from './authContext';

const WRITE_ROLES = new Set(['owner', 'employee']);

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState(null);
  const [meLoading, setMeLoading] = useState(false);

  const loadMe = useCallback(async () => {
    setMeLoading(true);
    setMeError(null);
    try {
      setMe(await api('/me'));
    } catch (err) {
      setMeError(err);
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => active && setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ?? null));
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    // Fetch the membership once per signed-in user (not on every token refresh)
    // Deferred so the state updates happen outside the effect's synchronous body.
    let cancelled = false;
    queueMicrotask(() => !cancelled && loadMe());
    return () => { cancelled = true; };
  }, [userId, loadMe]);

  const value = useMemo(() => {
    const role = me?.membership?.role ?? null;
    return {
      session,
      user: session?.user ?? null,
      role,
      business: me?.business ?? null,
      loading: session === undefined || (Boolean(session) && !me && !meError) || meLoading,
      error: meError,
      refresh: loadMe,
      signOut: async () => {
        await supabase.auth.signOut();
        setMe(null);
      },
      can: (action) => (action === 'write' ? WRITE_ROLES.has(role) : action === 'manageTeam' ? role === 'owner' : Boolean(role)),
    };
  }, [session, me, meError, meLoading, loadMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
