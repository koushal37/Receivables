import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { api } from './api';
import AuthPage from './components/AuthPage';
import InvoicesPage from './components/InvoicesPage';
import OverviewPage from './components/OverviewPage';
import Team from './components/Team';

export const AuthContext = createContext(null);

export default function App() {
  const [session, setSession] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [initialStatusFilter, setInitialStatusFilter] = useState('all');
  const [bizNameInput, setBizNameInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchUserContext = async () => {
    try {
      const res = await api('/me');
      setUserData(res);
    } catch (err) {
      console.error('Failed to fetch context:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserContext();
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserContext();
      else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleOnboard = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await api('/onboard', {
        method: 'POST',
        body: JSON.stringify({ businessName: bizNameInput }),
      });
      await fetchUserContext();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center font-sans">Loading application...</div>;
  }

  if (!session) {
    return <AuthPage />;
  }

  // Problem 5 Fix: Onboarding Gate
  if (!userData?.membership || !userData?.business) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome! Let’s set up your business</h2>
          <p className="text-sm text-gray-600 mb-6">Enter your registered trading or company name to begin.</p>
          {errorMsg && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{errorMsg}</div>}
          <form onSubmit={handleOnboard} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Business Name</label>
              <input
                type="text"
                required
                value={bizNameInput}
                onChange={(e) => setBizNameInput(e.target.value)}
                placeholder="e.g. Acme Logistics India Pvt Ltd"
                className="mt-1 w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700"
            >
              Create Business
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user: userData.user, role: userData.membership.role, business: userData.business }}>
      <div className="min-h-screen bg-slate-50 flex">
        <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-4">
          <div>
            <div className="mb-8">
              <h1 className="text-xl font-bold">{userData.business.name}</h1>
              <span className="text-xs text-slate-400 capitalize">Role: {userData.membership.role}</span>
            </div>
            <nav className="space-y-2">
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'overview' ? 'bg-indigo-600' : 'hover:bg-slate-800'}`}
              >
                Overview
              </button>
              <button
                onClick={() => {
                  setInitialStatusFilter('all');
                  setActiveTab('invoices');
                }}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'invoices' ? 'bg-indigo-600' : 'hover:bg-slate-800'}`}
              >
                Invoices
              </button>
              <button
                onClick={() => setActiveTab('team')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'team' ? 'bg-indigo-600' : 'hover:bg-slate-800'}`}
              >
                Team
              </button>
            </nav>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full rounded bg-slate-800 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Sign Out
          </button>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto">
          {activeTab === 'overview' && (
            <OverviewPage
              onNavigateInvoices={(status) => {
                setInitialStatusFilter(status);
                setActiveTab('invoices');
              }}
            />
          )}
          {activeTab === 'invoices' && <InvoicesPage initialStatus={initialStatusFilter} />}
          {activeTab === 'team' && <Team />}
        </main>
      </div>
    </AuthContext.Provider>
  );
}