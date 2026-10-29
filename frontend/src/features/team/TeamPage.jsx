import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { initials } from '../../lib/format';
import { useToast } from '../../components/ui/toastContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Skeleton, EmptyState, Alert, Badge, Field } from '../../components/ui/Feedback';

const EMPTY = { name: '', email: '', phone: '', role: 'employee', tempPassword: '' };

function validate(f) {
  return {
    name: f.name.trim().length < 2 ? 'Enter the full name' : null,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) ? 'Enter a valid email' : null,
    phone: !/^(\+\d{8,15}|\d{10})$/.test(f.phone.replace(/[\s()-]/g, '')) ? '10 digits, or + and country code' : null,
    tempPassword: f.tempPassword.length < 8 ? 'At least 8 characters' : null,
  };
}

export default function TeamPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/team');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const members = data?.members ?? [];
  const errors = validate(form);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const blur = (key) => () => setTouched((t) => ({ ...t, [key]: true }));
  const show = (key) => touched[key] && errors[key];

  async function add(e) {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true, tempPassword: true });
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setSubmitError('');
    try {
      await api('/team', { method: 'POST', body: form });
      toast.success(`${form.name} was added to your team.`);
      setForm(EMPTY);
      setTouched({});
      setOpen(false);
      reload();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const input = (key, props) => (
    <input id={`tm-${key}`} className="input" value={form[key]} onChange={set(key)} onBlur={blur(key)} aria-invalid={Boolean(show(key))} {...props} />
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Invite collectors and give read-only access to your accountant</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>Add member</Button>
        </div>
      </div>

      {error && <Alert tone="danger">{error.message}</Alert>}

      <div className="card">
        {loading && !data ? (
          <div className="stack card-pad">{[0, 1, 2].map((i) => <Skeleton key={i} height={20} />)}</div>
        ) : members.length <= 1 ? (
          <EmptyState icon="users" title="It’s just you so far" action={<Button variant="primary" icon="plus" onClick={() => setOpen(true)}>Add your first member</Button>}>
            Employees can work the collection queue. Read-only members can view everything but change nothing.
          </EmptyState>
        ) : null}
        {members.length > 0 && (
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.id} className="member">
                <span className="avatar" aria-hidden="true">{initials(m.display_name || m.email)}</span>
                <div className="member-info">
                  <div className="strong">{m.display_name || 'Owner'}</div>
                  <div className="hint">{[m.email, m.phone].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'} plain>{m.role.replace('_', ' ')}</Badge>
                {m.status !== 'active' && <Badge tone="warning">{m.status}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} busy={busy} title="Add team member" description="They can log in right away with the temporary password."
        footer={<><Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form="team-form" loading={busy}>Add member</Button></>}>
        {submitError && <Alert tone="danger">{submitError}</Alert>}
        <form id="team-form" onSubmit={add} className="stack" noValidate>
          <Field label="Full name" htmlFor="tm-name" error={show('name')}>{input('name', { autoComplete: 'off', 'data-autofocus': true })}</Field>
          <div className="form-grid">
            <Field label="Email" htmlFor="tm-email" error={show('email')}>{input('email', { type: 'email', autoComplete: 'off' })}</Field>
            <Field label="Phone" htmlFor="tm-phone" error={show('phone')} hint="10 digits or +countrycode">{input('phone', { type: 'tel', inputMode: 'tel' })}</Field>
          </div>
          <div className="form-grid">
            <Field label="Role" htmlFor="tm-role">
              <select id="tm-role" className="select" value={form.role} onChange={set('role')}>
                <option value="employee">Employee: can record and follow up</option>
                <option value="read_only">Read only: view only</option>
              </select>
            </Field>
            <Field label="Temporary password" htmlFor="tm-tempPassword" error={show('tempPassword')} hint="Share it securely; 8+ characters">
              {input('tempPassword', { type: 'text', autoComplete: 'new-password' })}
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}
