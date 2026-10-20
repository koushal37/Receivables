import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import AuthPage from './components/AuthPage';
import Team from './components/Team';
import InvoicesPage from './components/InvoicesPage';
import OverviewPage from './components/OverviewPage';

export default function App() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'invoices' | 'team'
  const [invoiceFilter, setInvoiceFilter] = useState('all');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleNavigateToInvoices = (filter) => {
    setInvoiceFilter(filter);
    setActiveTab('invoices');
  };

  if (!session) {
    return <AuthPage />;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0b0f17', color: '#f3f4f6' }}>
      {/* Navigation Header */}
      <header style={{ borderBottom: '1px solid #1f2937', backgroundColor: '#111827', padding: '0.75rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#60a5fa' }}>Receivables Assistant</span>
            
            <nav style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => setActiveTab('overview')}
                style={{
                  ...navTabStyle,
                  borderBottom: activeTab === 'overview' ? '2px solid #2563eb' : '2px solid transparent',
                  color: activeTab === 'overview' ? '#ffffff' : '#9ca3af'
                }}
              >
                Overview
              </button>
              <button 
                onClick={() => { setInvoiceFilter('all'); setActiveTab('invoices'); }}
                style={{
                  ...navTabStyle,
                  borderBottom: activeTab === 'invoices' ? '2px solid #2563eb' : '2px solid transparent',
                  color: activeTab === 'invoices' ? '#ffffff' : '#9ca3af'
                }}
              >
                Invoices
              </button>
              <button 
                onClick={() => setActiveTab('team')}
                style={{
                  ...navTabStyle,
                  borderBottom: activeTab === 'team' ? '2px solid #2563eb' : '2px solid transparent',
                  color: activeTab === 'team' ? '#ffffff' : '#9ca3af'
                }}
              >
                Team
              </button>
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{session.user.email}</span>
            <button onClick={handleLogout} style={logoutBtnStyle}>Log out</button>
          </div>
        </div>
      </header>

      {/* Main Page Body */}
      <main style={{ maxWidth: '1200px', margin: '2rem auto', padding: '0 1rem' }}>
        {activeTab === 'overview' && (
          <OverviewPage 
            token={session.access_token} 
            onNavigateToInvoices={handleNavigateToInvoices} 
          />
        )}
        {activeTab === 'invoices' && (
          <InvoicesPage 
            token={session.access_token} 
            initialStatus={invoiceFilter}
          />
        )}
        {activeTab === 'team' && (
          <Team session={session} token={session.access_token} />
        )}
      </main>
    </div>
  );
}

const navTabStyle = {
  background: 'none',
  border: 'none',
  padding: '0.5rem 0.25rem',
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer'
};

const logoutBtnStyle = {
  backgroundColor: '#374151',
  border: 'none',
  borderRadius: '4px',
  color: '#d1d5db',
  padding: '0.35rem 0.75rem',
  fontSize: '0.8rem',
  cursor: 'pointer'
};