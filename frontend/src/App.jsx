import { createContext, useEffect, useState } from 'react';
import { supabase, enterDemoMode } from './supabaseClient';
import { api } from './api';
import AuthPage from './components/AuthPage';
import InvoicesPage from './components/InvoicesPage';
import OverviewPage from './components/OverviewPage';
import CustomersPage from './components/CustomersPage';
import ReportsPage from './components/ReportsPage';
import Team from './components/Team';
import InvoiceImportModal from './components/InvoiceImportModal';

export const AuthContext = createContext(null);

export default function App() {
  const [session, setSession] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [initialStatusFilter, setInitialStatusFilter] = useState('all');
  const [bizNameInput, setBizNameInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [backendDownError, setBackendDownError] = useState('');
  const [isQuickImportOpen, setIsQuickImportOpen] = useState(false);

  const fetchUserContext = async () => {
    setBackendDownError('');
    try {
      const res = await api('/me');
      setUserData(res);
    } catch (err) {
      console.error('Failed to fetch context:', err);
      setBackendDownError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedDemo = localStorage.getItem('receivables_demo_session');
    if (savedDemo) {
      const parsed = JSON.parse(savedDemo);
      setSession(parsed);
      fetchUserContext();
      return;
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) fetchUserContext();
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) fetchUserContext();
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

  const handleSignOut = async () => {
    localStorage.removeItem('receivables_demo_session');
    await supabase.auth.signOut();
    setSession(null);
    setUserData(null);
  };

  const switchDemoRole = (role) => {
    const newSession = enterDemoMode(role);
    setSession(newSession);
    fetchUserContext();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white font-sans text-sm">
        Loading AI Receivables Recovery System...
      </div>
    );
  }

  if (!session) {
    return (
      <AuthPage
        onDemoLogin={(s) => {
          setSession(s);
          fetchUserContext();
        }}
      />
    );
  }

  if (backendDownError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl space-y-4">
          <div className="text-xs font-bold uppercase text-red-600 bg-red-50 px-3 py-1 rounded-full inline-block">
            Backend Connection Check
          </div>
          <h2 className="text-xl font-bold text-slate-900">Backend Server Not Reachable (HTTP 502)</h2>
          <p className="text-xs text-slate-600 leading-relaxed">{backendDownError}</p>
          <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs space-y-1">
            <div># Terminal 1: Start the Backend API Server</div>
            <div className="text-emerald-400">cd backend &amp;&amp; npm install &amp;&amp; npm run dev</div>
            <div className="pt-2"># Terminal 2: Start the Frontend Vite App</div>
            <div className="text-indigo-400">cd frontend &amp;&amp; npm install &amp;&amp; npm run dev</div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={fetchUserContext}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
            >
              ↻ Retry Connection
            </button>
            <button
              onClick={handleSignOut}
              className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!userData?.membership || !userData?.business) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome! Let’s set up your business</h2>
          <p className="text-xs text-slate-600 mb-6">
            Enter your registered trading or manufacturing company name to initialize your tenant workspace.
          </p>
          {errorMsg && <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-600">{errorMsg}</div>}
          <form onSubmit={handleOnboard} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">Business Name</label>
              <input
                type="text"
                required
                value={bizNameInput}
                onChange={(e) => setBizNameInput(e.target.value)}
                placeholder="e.g. Rourkela Ispat & Alloys Pvt Ltd"
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Create Business Workspace
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user: userData.user,
        role: userData.membership.role,
        business: userData.business,
      }}
    >
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col justify-between p-5 shrink-0">
          <div>
            <div className="mb-6 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                  {userData.supabaseConnected ? 'Supabase Live DB' : 'Prototype Store Active'}
                </span>
              </div>
              <h1 className="text-lg font-bold leading-snug text-white">{userData.business.name}</h1>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                <span>Role: <strong className="text-slate-200 uppercase">{userData.membership.role}</strong></span>
                <span>IST (UTC+5:30)</span>
              </div>
            </div>

            <nav className="space-y-1.5 text-sm">
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition flex items-center gap-2.5 ${
                  activeTab === 'overview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>📊</span>
                <span>Overview & Action Plan</span>
              </button>
              <button
                onClick={() => {
                  setInitialStatusFilter('all');
                  setActiveTab('invoices');
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition flex items-center gap-2.5 ${
                  activeTab === 'invoices' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>🧾</span>
                <span>Invoices & Ledger</span>
              </button>
              <button
                onClick={() => setActiveTab('customers')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition flex items-center gap-2.5 ${
                  activeTab === 'customers' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>🏢</span>
                <span>Customer Directory</span>
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition flex items-center gap-2.5 ${
                  activeTab === 'reports' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>📈</span>
                <span>Ageing & Reports</span>
              </button>
              <button
                onClick={() => setActiveTab('team')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl font-medium transition flex items-center gap-2.5 ${
                  activeTab === 'team' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>👥</span>
                <span>Team & Roles</span>
              </button>
            </nav>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-800 space-y-3">
            {userData.isDemoMode && (
              <div className="p-3 rounded-xl bg-slate-800/90 text-xs space-y-2">
                <div className="text-[11px] font-bold uppercase text-amber-400">Switch Demo Role</div>
                <div className="grid grid-cols-3 gap-1">
                  {['owner', 'employee', 'read_only'].map((r) => (
                    <button
                      key={r}
                      onClick={() => switchDemoRole(r)}
                      className={`py-1 px-1.5 rounded text-[10px] font-bold uppercase ${
                        userData.membership.role === r ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {r === 'read_only' ? 'Audit' : r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleSignOut}
              className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {activeTab === 'overview' && (
            <OverviewPage
              onNavigateToInvoices={(status) => {
                setInitialStatusFilter(status);
                setActiveTab('invoices');
              }}
              onOpenImport={() => setIsQuickImportOpen(true)}
            />
          )}
          {activeTab === 'invoices' && <InvoicesPage initialStatus={initialStatusFilter} />}
          {activeTab === 'customers' && (
            <CustomersPage
              onSelectCustomerInvoices={() => {
                setInitialStatusFilter('all');
                setActiveTab('invoices');
              }}
            />
          )}
          {activeTab === 'reports' && <ReportsPage />}
          {activeTab === 'team' && <Team />}
        </main>

        <InvoiceImportModal
          isOpen={isQuickImportOpen}
          onClose={() => setIsQuickImportOpen(false)}
          onImportSuccess={() => {
            setInitialStatusFilter('all');
            setActiveTab('invoices');
          }}
        />
      </div>
    </AuthContext.Provider>
  );
}
