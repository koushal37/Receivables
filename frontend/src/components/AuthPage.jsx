import { useState } from 'react'
import { supabase } from '../supabaseClient'

const box = { width: '100%', padding: 10, marginBottom: 12, boxSizing: 'border-box', fontSize: 15 }

export default function AuthPage() {
  const [mode, setMode] = useState('login') // 'login' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const creds = { email: email.trim(), password }
    const { data, error } =
      mode === 'signup'
        ? await supabase.auth.signUp(creds)
        : await supabase.auth.signInWithPassword(creds)

    if (error) setMessage(error.message)
    else if (mode === 'signup' && !data.session)
      setMessage('Account created. Check your email to confirm it, then log in.')
    setBusy(false)
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24, background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}>
      <h2 style={{ marginTop: 0 }}>{mode === 'login' ? 'Log in' : 'Create your account'}</h2>

      <form onSubmit={handleSubmit}>
        <input style={box} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          style={box}
          type="password"
          placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={mode === 'signup' ? 8 : undefined}
          required
        />
        <button style={{ ...box, background: '#1a1a1a', color: '#fff', border: 'none' }} disabled={busy}>
          {busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
      </form>

      {message && <p style={{ color: '#b00020' }}>{message}</p>}

      <p style={{ fontSize: 14 }}>
        {mode === 'login' ? "New here? " : 'Already have an account? '}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>
          {mode === 'login' ? 'Create an account' : 'Log in'}
        </a>
      </p>
    </div>
  )
}
