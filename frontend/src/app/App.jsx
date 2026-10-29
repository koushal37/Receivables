import { useAuth } from './authContext';
import { useRoute } from './router';
import AppShell from './AppShell';
import AuthPage from '../features/auth/AuthPage';
import OnboardingPage from '../features/auth/OnboardingPage';
import OverviewPage from '../features/dashboard/OverviewPage';
import InvoicesPage from '../features/invoices/InvoicesPage';
import ImportPage from '../features/import/ImportPage';
import TeamPage from '../features/team/TeamPage';
import { EmptyState, Alert } from '../components/ui/Feedback';
import Button from '../components/ui/Button';
import { href } from './router';

function NotFound() {
  return (
    <div className="card">
      <EmptyState icon="search" title="Page not found" action={<a className="btn btn-secondary" href={href('/')}>Back to overview</a>}>
        The page you’re looking for doesn’t exist or you don’t have access to it.
      </EmptyState>
    </div>
  );
}

export default function App() {
  const { session, business, loading, error, refresh, signOut, can } = useAuth();
  const { path, params } = useRoute();

  if (loading) {
    return <div className="splash" role="status"><span className="spinner" aria-hidden="true" /><span className="sr-only">Loading</span></div>;
  }
  if (!session) return <AuthPage />;

  if (error) {
    return (
      <div className="auth-main" style={{ minHeight: '100vh' }}>
        <div className="auth-card">
          <Alert tone="danger">{error.message}</Alert>
          <div className="row">
            <Button variant="primary" onClick={refresh}>Try again</Button>
            <Button variant="ghost" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </div>
    );
  }
  if (!business) return <OnboardingPage />;

  let page;
  if (path === '/') page = <OverviewPage />;
  else if (path === '/invoices') page = <InvoicesPage status={params.status || 'all'} search={params.q || ''} />;
  else if (path === '/import' && can('write')) page = <ImportPage />;
  else if (path === '/team' && can('manageTeam')) page = <TeamPage />;
  else page = <NotFound />;

  return <AppShell path={path}>{page}</AppShell>;
}
