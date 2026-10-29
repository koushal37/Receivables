import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AuthLayout from './AuthLayout';
import Button from '../../components/ui/Button';
import { Alert, Field } from '../../components/ui/Feedback';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const isSignup = mode === 'signup';
  const errors = {
    email: !email.trim() ? 'Enter your email' : !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address' : null,
    password: !password ? 'Enter your password' : isSignup && password.length < 8 ? 'Use at least 8 characters' : null,
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (errors.email || errors.password) return;
    setBusy(true);
    setMessage(null);
    const creds = { email: email.trim(), password };
    const { data, error } = isSignup ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds);
    if (error) setMessage({ tone: 'danger', text: error.message });
    else if (isSignup && !data.session) setMessage({ tone: 'success', text: 'Account created. Check your email to confirm it, then log in.' });
    setBusy(false);
  }

  const switchMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setMessage(null);
    setTouched({});
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        <div>
          <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="page-subtitle">{isSignup ? 'Start tracking receivables in minutes.' : 'Log in to your receivables workspace.'}</p>
        </div>

        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        <form onSubmit={handleSubmit} className="stack" noValidate>
          <Field label="Email" htmlFor="email" error={touched.email && errors.email}>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              aria-invalid={Boolean(touched.email && errors.email)}
              aria-describedby={touched.email && errors.email ? 'email-error' : undefined}
              placeholder="you@company.com"
            />
          </Field>
          <Field label="Password" htmlFor="password" hint={isSignup ? 'At least 8 characters' : undefined} error={touched.password && errors.password}>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={Boolean(touched.password && errors.password)}
              aria-describedby={touched.password && errors.password ? 'password-error' : undefined}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            {isSignup ? 'Create account' : 'Log in'}
          </Button>
        </form>

        <p className="hint" style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>
          {isSignup ? 'Already have an account? ' : 'New here? '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={switchMode} style={{ color: 'var(--color-accent)' }}>
            {isSignup ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
