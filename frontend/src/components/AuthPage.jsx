import { useState } from 'react';
import { supabase, isSupabaseConfigured, enterDemoMode } from '../supabaseClient';

export default function AuthPage({ onDemoLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');

    if (!isSupabaseConfigured) {
      const session = enterDemoMode('owner');
      if (onDemoLogin) onDemoLogin(session);
      setBusy(false);
      return;
    }

    const creds = { email: email.trim(), password };
    const { data, error } =
      mode === 'signup'
        ? await supabase.auth.signUp(creds)
        : await supabase.auth.signInWithPassword(creds);

    if (error) setMessage(error.message);
    else if (mode === 'signup' && !data.session)
      setMessage('Account created! Check your email to confirm it (or disable Confirm Email in Supabase Auth settings), then log in.');
    setBusy(false);
  }

  const handleInstantDemo = (role) => {
    const session = enterDemoMode(role);
    if (onDemoLogin) onDemoLogin(session);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-indigo-600 p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider bg-indigo-500 px-2.5 py-1 rounded-full">
              B2B Receivables Recovery
            </span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isSupabaseConfigured ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-slate-900'}`}>
              {isSupabaseConfigured ? '● Supabase Live' : '● Prototype Mode Ready'}
            </span>
          </div>
          <h1 className="text-2xl font-bold">AI Receivables Assistant</h1>
          <p className="text-indigo-100 text-sm mt-1">
            Systematic invoice tracking, priority queues & WhatsApp follow-ups
          </p>
        </div>

        <div className="p-6">
          {/* Instant Prototype Demo Launchers for Pitch Presentation */}
          <div className="mb-6 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-800 mb-1">
              ⚡ Instant Pitch Prototype Access
            </div>
            <p className="text-xs text-indigo-700 mb-3">
              Launch immediately with pre-loaded Indian B2B steel & manufacturing receivables data:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleInstantDemo('owner')}
                className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs shadow-sm transition"
              >
                Enter as Business Owner
              </button>
              <button
                type="button"
                onClick={() => handleInstantDemo('employee')}
                className="w-full py-2 px-3 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-300 font-semibold rounded-lg text-xs transition"
              >
                Enter as Collector Staff
              </button>
            </div>
          </div>

          <div className="relative flex py-2 items-center mb-4">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-xs text-slate-400 uppercase font-medium">
              Or {mode === 'login' ? 'Sign In with Supabase Auth' : 'Create Account'}
            </span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Work Email</label>
              <input
                type="email"
                placeholder="owner@company.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Password</label>
              <input
                type="password"
                placeholder={mode === 'signup' ? 'Password (8+ characters)' : '••••••••'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={mode === 'signup' ? 8 : undefined}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50"
            >
              {busy ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {message && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {message}
            </div>
          )}

          <p className="mt-5 text-center text-xs text-slate-600">
            {mode === 'login' ? 'New business account? ' : 'Already registered? '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setMessage('');
              }}
              className="text-indigo-600 font-semibold hover:underline"
            >
              {mode === 'login' ? 'Create an account' : 'Log in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
