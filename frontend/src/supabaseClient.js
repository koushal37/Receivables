import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseKey.includes('your-anon-key')
);

// Stub client when env vars are missing so the app never crashes on load
const mockAuthClient = {
  auth: {
    getSession: async () => {
      const saved = localStorage.getItem('receivables_demo_session');
      return { data: { session: saved ? JSON.parse(saved) : null }, error: null };
    },
    onAuthStateChange: (callback) => {
      window.__triggerDemoAuthChange = callback;
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    signInWithPassword: async ({ email }) => {
      const session = {
        access_token: 'demo-token-owner',
        user: { id: 'u0000001-0000-4000-8000-000000000001', email },
      };
      localStorage.setItem('receivables_demo_session', JSON.stringify(session));
      if (window.__triggerDemoAuthChange) window.__triggerDemoAuthChange('SIGNED_IN', session);
      return { data: { session, user: session.user }, error: null };
    },
    signUp: async ({ email }) => {
      const session = {
        access_token: 'demo-token-owner',
        user: { id: 'u0000001-0000-4000-8000-000000000001', email },
      };
      localStorage.setItem('receivables_demo_session', JSON.stringify(session));
      if (window.__triggerDemoAuthChange) window.__triggerDemoAuthChange('SIGNED_IN', session);
      return { data: { session, user: session.user }, error: null };
    },
    signOut: async () => {
      localStorage.removeItem('receivables_demo_session');
      if (window.__triggerDemoAuthChange) window.__triggerDemoAuthChange('SIGNED_OUT', null);
      return { error: null };
    },
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : mockAuthClient;

export function enterDemoMode(role = 'owner') {
  const session = {
    access_token: `demo-token-${role}`,
    demo_role: role,
    user: {
      id: role === 'owner' ? 'u0000001-0000-4000-8000-000000000001' : 'u0000002-0000-4000-8000-000000000002',
      email: role === 'owner' ? 'owner@rourkelaispat.in' : 'priya@rourkelaispat.in',
    },
  };
  localStorage.setItem('receivables_demo_session', JSON.stringify(session));
  if (window.__triggerDemoAuthChange) window.__triggerDemoAuthChange('SIGNED_IN', session);
  return session;
}
