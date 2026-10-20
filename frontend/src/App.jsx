import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { api } from './api'
import Team from './components/Team'
import AuthPage from './components/AuthPage'



function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [me, setMe] = useState(null)
  const [businessName, setBusinessName] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setMe(null); return }
    api('/api/me', session).then(setMe).catch((e) => setMessage(e.message))
  }, [session])

  async function createBusiness() {
    try {
      await api('/api/onboard', session, { method: 'POST', body: JSON.stringify({ name: businessName }) })
      setMe(await api('/api/me', session))
      setMessage('')
    } catch (e) {
      setMessage(e.message)
    }
  }

  if (session === undefined) return <p style={{ padding: 24 }}>Loading...</p>
  if (!session) return <AuthPage />
  if (!me) return <p style={{ padding: 24 }}>{message || 'Loading...'}</p>

    return (
    <div style={{ maxWidth: 720, margin: '60px auto', padding: 24 }}>
      <p>Logged in as {me.user.email}</p>

      {me.membership ? (
        <p>Business: <b>{me.membership.business.name}</b> (role: {me.membership.role})</p>
      ) : (
        <>
          <p>You don't have a business yet.</p>
          <input placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          <button onClick={createBusiness}>Create business</button>
        </>
      )}

      {me.membership?.role === 'owner' && <Team session={session} />}

      <p style={{ color: '#b00020' }}>{message}</p>
      <button onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  )
}

export default App