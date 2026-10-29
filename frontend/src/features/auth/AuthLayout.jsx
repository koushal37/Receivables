import Icon from '../../components/ui/Icon';

const POINTS = ['Import invoices from PDF, Excel, images and more', 'See exactly who to follow up with today', 'Send reminders and record promises in one click'];

export default function AuthLayout({ children }) {
  return (
    <div className="auth-layout">
      <aside className="auth-aside">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span className="brand-name">Receivables</span>
        </div>
        <div>
          <h2>Get paid on time, without the spreadsheet chase.</h2>
          <ul>
            {POINTS.map((p) => (
              <li key={p}><Icon name="check" size={18} />{p}</li>
            ))}
          </ul>
        </div>
        <p className="hint">Your data is isolated per business and protected by role-based access.</p>
      </aside>
      <main className="auth-main">
        <div className="auth-card" style={{ gap: 'var(--space-6)' }}>
          <div className="brand auth-mobile-brand">
            <span className="brand-mark" aria-hidden="true">R</span>
            <span className="brand-name">Receivables</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
