import { useEffect, useState, useContext } from 'react';
import { api } from '../api';
import { AuthContext } from '../App';

const empty = { name: '', email: '', phone: '', role: 'employee', tempPassword: '' };

export default function Team() {
  const auth = useContext(AuthContext);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api('/team')
      .then((data) => setMembers(Array.isArray(data) ? data : []))
      .catch((e) => setMessage(e.message));
  }, [version]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function add(e) {
    e.preventDefault();
    setMessage('');
    setSuccessMsg('');
    try {
      await api('/team', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(empty);
      setSuccessMsg('Team member added!');
      setVersion((v) => v + 1);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function toggleStatus(id) {
    try {
      await api(`/team/${id}/toggle-status`, { method: 'POST' });
      setVersion((v) => v + 1);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Team Roles & Collection Rules</h2>
        <p className="text-xs text-slate-500">
          Role-based access control: Business Owner, Collection Employee & Read-Only Auditor
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-900">Active Business Memberships</h3>
          <span className="text-xs text-slate-500">Your current role: <strong className="uppercase">{auth?.role}</strong></span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
            <tr>
              <th className="p-3.5">Name</th>
              <th className="p-3.5">Role</th>
              <th className="p-3.5">Phone</th>
              <th className="p-3.5">Email</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="p-3.5 font-semibold text-slate-900">{m.display_name || 'Business Owner'}</td>
                <td className="p-3.5 uppercase font-bold text-indigo-600">{m.role}</td>
                <td className="p-3.5">{m.phone || '-'}</td>
                <td className="p-3.5">{m.email || '-'}</td>
                <td className="p-3.5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                      m.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {m.status}
                  </span>
                </td>
                <td className="p-3.5 text-right">
                  {auth?.role === 'owner' && m.role !== 'owner' && (
                    <button
                      onClick={() => toggleStatus(m.id)}
                      className="text-xs font-semibold text-slate-600 hover:text-red-600 underline"
                    >
                      {m.status === 'active' ? 'Revoke Access' : 'Restore Access'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {auth?.role === 'owner' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Invite Collection Employee or Read-Only User</h3>
          {message && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs">{message}</div>}
          {successMsg && <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs">{successMsg}</div>}

          <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              placeholder="Full Name"
              value={form.name}
              onChange={set('name')}
              required
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
            <input
              type="email"
              placeholder="Work Email"
              value={form.email}
              onChange={set('email')}
              required
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
            <input
              placeholder="Phone (10 digits)"
              value={form.phone}
              onChange={set('phone')}
              required
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
            <select
              value={form.role}
              onChange={set('role')}
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
            >
              <option value="employee">Collection Employee</option>
              <option value="read_only">Read-Only Auditor</option>
            </select>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Temp Password (8+)"
                value={form.tempPassword}
                onChange={set('tempPassword')}
                required
                minLength={8}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
