import { useEffect, useState } from 'react'
import { api } from '../api'

const empty = { name: '', email: '', phone: '', role: 'employee', tempPassword: '' }
const field = { padding: 8, marginRight: 8, marginBottom: 8 }

export default function Team({ session }) {
  const [members, setMembers] = useState([])
  const [form, setForm] = useState(empty)
  const [message, setMessage] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    api('/api/team', session).then(setMembers).catch((e) => setMessage(e.message))
  }, [session, version])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  async function add(e) {
    e.preventDefault()
    setMessage('')
    try {
      await api('/api/team', session, { method: 'POST', body: JSON.stringify(form) })
      setForm(empty)
      setVersion((v) => v + 1)
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <div>
      <h3>Team</h3>
      <table cellPadding={6} style={{ borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr><th align="left">Name</th><th align="left">Role</th><th align="left">Phone</th><th align="left">Email</th></tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.display_name || '(owner)'}</td>
              <td>{m.role}</td>
              <td>{m.phone || '-'}</td>
              <td>{m.email || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Add an employee</h4>
      <form onSubmit={add}>
        <input style={field} placeholder="Full name" value={form.name} onChange={set('name')} required />
        <input style={field} type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
        <input style={field} placeholder="Phone (10 digits)" value={form.phone} onChange={set('phone')} required />
        <select style={field} value={form.role} onChange={set('role')}>
          <option value="employee">Employee</option>
          <option value="read_only">Read only</option>
        </select>
        <input style={field} type="text" placeholder="Temporary password (8+)" value={form.tempPassword} onChange={set('tempPassword')} required minLength={8} />
        <button>Add</button>
      </form>
      {message && <p style={{ color: '#b00020' }}>{message}</p>}
    </div>
  )
}