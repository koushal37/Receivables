import { useState } from 'react';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useToast } from '../../components/ui/toastContext';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Field, Alert } from '../../components/ui/Feedback';

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const DISPUTE_REASONS = [
  ['pricing_error', 'Pricing / rate discrepancy'],
  ['damaged_goods', 'Damaged or rejected goods'],
  ['short_shipment', 'Short material received'],
  ['already_paid', 'Customer says already paid'],
  ['other', 'Other'],
];

// One component per dialog type; `key` on the item resets form state between uses.
export default function ActionDialogs({ active, onClose, onDone }) {
  if (!active) return null;
  const Dialog = { payment: PaymentDialog, reminder: ReminderDialog, promise: PromiseDialog, dispute: DisputeDialog }[active.type];
  return Dialog ? <Dialog key={`${active.type}-${active.item.id}`} item={active.item} onClose={onClose} onDone={onDone} /> : null;
}

function useSubmit(onClose, onDone) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn, successMessage) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      toast.success(successMessage);
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function PaymentDialog({ item, onClose, onDone }) {
  const [amount, setAmount] = useState(String(item.outstandingBalance));
  const [method, setMethod] = useState('bank_transfer');
  const [utr, setUtr] = useState('');
  const { busy, error, run } = useSubmit(onClose, onDone);
  const n = Number(amount);
  const amountError = !amount ? 'Enter an amount' : !(n > 0) ? 'Amount must be greater than 0' : n > item.outstandingBalance ? `Can’t exceed ${formatMoney(item.outstandingBalance)}` : null;

  const submit = (e) => {
    e.preventDefault();
    if (amountError) return;
    run(() => api('/payments/record', { method: 'POST', body: { invoiceId: item.id, amount: n, paymentMethod: method, utr: utr.trim() || null } }),
      `Payment of ${formatMoney(n)} recorded for ${item.invoiceNumber}.`);
  };

  return (
    <Modal open onClose={onClose} busy={busy} title="Record payment" description={`${item.customerName} · ${item.invoiceNumber} · ${formatMoney(item.outstandingBalance)} outstanding`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form="payment-form" loading={busy}>Record payment</Button></>}>
      {error && <Alert tone="danger">{error}</Alert>}
      <form id="payment-form" onSubmit={submit} className="stack" noValidate>
        <Field label="Amount received" htmlFor="pay-amount" error={amountError}>
          <input id="pay-amount" className="input tabular" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(amountError)} data-autofocus />
        </Field>
        <div className="form-grid">
          <Field label="Method" htmlFor="pay-method">
            <select id="pay-method" className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="UTR / reference" htmlFor="pay-utr" optional>
            <input id="pay-utr" className="input" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. HDFC0012345" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function ReminderDialog({ item, onClose, onDone }) {
  const { busy, error, run } = useSubmit(onClose, onDone);
  const send = () => run(() => api('/messages/send-reminder', { method: 'POST', body: { invoiceId: item.id } }), `Reminder sent to ${item.customerName}.`);
  return (
    <Modal open onClose={onClose} busy={busy} title="Send WhatsApp reminder" description={`To ${item.customerName} · ${item.customerPhone || 'no phone on file'}`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" icon="message" onClick={send} loading={busy} disabled={!item.customerPhone}>Send reminder</Button></>}>
      {error && <Alert tone="danger">{error}</Alert>}
      {!item.customerPhone && <Alert tone="warning">Add a phone number for this customer before sending reminders.</Alert>}
      <div className="message-preview">
        <span className="hint">Message preview</span>
        <p>
          Hello {item.customerName}, our records show that invoice {item.invoiceNumber} for {formatMoney(item.outstandingBalance)} remains outstanding.
          If payment was already made, kindly share the UTR reference. Thank you!
        </p>
      </div>
    </Modal>
  );
}

function PromiseDialog({ item, onClose, onDone }) {
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState(String(item.outstandingBalance));
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const { busy, error, run } = useSubmit(onClose, onDone);
  const min = todayIso();
  const dateError = !date ? 'Pick the promised date' : date < min ? 'Date can’t be in the past' : null;
  const amountError = !(Number(amount) > 0) ? 'Enter an amount greater than 0' : null;

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (dateError || amountError) return;
    run(() => api('/dashboard/record-promise', { method: 'POST', body: { invoiceId: item.id, promisedAmount: Number(amount), promisedDate: date, notes: notes.trim() || null } }),
      'Payment promise saved.');
  };

  return (
    <Modal open onClose={onClose} busy={busy} title="Record payment promise" description={`${item.customerName} · ${item.invoiceNumber}`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form="promise-form" loading={busy}>Save promise</Button></>}>
      {error && <Alert tone="danger">{error}</Alert>}
      <form id="promise-form" onSubmit={submit} className="stack" noValidate>
        <div className="form-grid">
          <Field label="Promised date" htmlFor="pr-date" error={touched && dateError}>
            <input id="pr-date" type="date" className="input" min={min} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(touched && dateError)} data-autofocus />
          </Field>
          <Field label="Amount" htmlFor="pr-amount" error={touched && amountError}>
            <input id="pr-amount" className="input tabular" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(touched && amountError)} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="pr-notes" optional>
          <input id="pr-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Will pay by RTGS on Friday" />
        </Field>
      </form>
    </Modal>
  );
}

function DisputeDialog({ item, onClose, onDone }) {
  const [reason, setReason] = useState('pricing_error');
  const [description, setDescription] = useState('');
  const { busy, error, run } = useSubmit(onClose, onDone);
  const submit = (e) => {
    e.preventDefault();
    run(() => api('/dashboard/flag-dispute', { method: 'POST', body: { invoiceId: item.id, reason, description: description.trim() || null } }),
      `${item.invoiceNumber} marked as disputed. Follow-ups are paused.`);
  };
  return (
    <Modal open onClose={onClose} busy={busy} title="Flag a dispute" description={`Pauses follow-ups for ${item.invoiceNumber} until resolved.`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="danger-solid" type="submit" form="dispute-form" loading={busy}>Flag dispute</Button></>}>
      {error && <Alert tone="danger">{error}</Alert>}
      <form id="dispute-form" onSubmit={submit} className="stack">
        <Field label="Reason" htmlFor="dp-reason">
          <select id="dp-reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus>
            {DISPUTE_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Details" htmlFor="dp-desc" optional>
          <textarea id="dp-desc" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
      </form>
    </Modal>
  );
}
