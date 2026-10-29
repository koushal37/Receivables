import { useState } from 'react';
import Icon from '../components/ui/Icon';
import Button from '../components/ui/Button';
import { useAuth } from './authContext';
import { href } from './router';
import { initials } from '../lib/format';

const NAV = [
  { path: '/', label: 'Overview', icon: 'home' },
  { path: '/invoices', label: 'Invoices', icon: 'file' },
  { path: '/import', label: 'Import invoices', icon: 'upload', requires: 'write' },
  { path: '/team', label: 'Team', icon: 'users', requires: 'manageTeam' },
];

export default function AppShell({ path, children }) {
  const { business, role, user, signOut, can } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const links = NAV.filter((n) => !n.requires || can(n.requires));
  const close = () => setDrawerOpen(false);

  return (
    <div className="shell">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>

      <div className="drawer-backdrop" data-open={drawerOpen} onClick={close} aria-hidden="true" />

      <aside className="sidebar" data-open={drawerOpen} aria-label="Main navigation">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">{initials(business?.name)[0]}</span>
            <div style={{ minWidth: 0 }}>
              <div className="brand-name">{business?.name}</div>
              <div className="brand-role">{role?.replace('_', ' ')}</div>
            </div>
          </div>
        </div>

        <nav className="nav">
          {links.map((item) => (
            <a
              key={item.path}
              href={href(item.path)}
              className="nav-link"
              aria-current={path === item.path ? 'page' : undefined}
              onClick={close}
            >
              <Icon name={item.icon} />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">{initials(user?.email)}</span>
            <span className="user-email" title={user?.email}>{user?.email}</span>
          </div>
          <Button variant="ghost" icon="logout" block onClick={signOut} style={{ justifyContent: 'flex-start' }}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Button variant="ghost" icon="menu" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" aria-expanded={drawerOpen} />
          <span className="brand-name">{business?.name}</span>
          <span className="avatar" aria-hidden="true">{initials(user?.email)}</span>
        </header>
        <main id="main" className="content" tabIndex={-1} style={{ outline: 'none' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
