import { useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../app/authContext';
import AuthLayout from './AuthLayout';
import Button from '../../components/ui/Button';
import { Alert, Field } from '../../components/ui/Feedback';

export default function OnboardingPage() {
  const { refresh, signOut, user } = useAuth();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const inlineError = name.trim().length < 2 ? 'Enter at least 2 characters' : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (inlineError) return;
    setBusy(true);
    setError('');
    try {
      await api('/onboard', { method: 'POST', body: { businessName: name.trim() } });
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div>
          <h1>Set up your business</h1>
          <p className="page-subtitle">Signed in as {user?.email}. You’ll be the owner and can invite your team next.</p>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <form onSubmit={handleSubmit} className="stack" noValidate>
          <Field label="Business name" htmlFor="biz" error={touched && inlineError} hint="Your registered trading or company name">
            <input
              id="biz"
              className="input"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={Boolean(touched && inlineError)}
              placeholder="e.g. Acme Logistics India Pvt Ltd"
              autoFocus
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>Create business</Button>
          <Button variant="ghost" block onClick={signOut}>Use a different account</Button>
        </form>
      </div>
    </AuthLayout>
  );
}
