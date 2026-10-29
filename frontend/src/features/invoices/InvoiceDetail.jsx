import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useToast } from '../../components/ui/toastContext';
import { useAuth } from '../../app/authContext';
import { formatMoney, formatDate } from '../../lib/format';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { Skeleton, StatusBadge, Alert, Field } from '../../components/ui/Feedback';
import DraftEditor from '../import/DraftEditor';
import { invoiceToDraft } from '../import/extract/draft';
import { loadInvoice, updateInvoice } from './invoiceApi';
import ActionDialogs from '../dashboard/ActionDialogs';
import { displayStatus, toActionItem } from './invoiceStatus';

const EVENT = {
  payment: { icon: 'wallet', label: (d) => `Payment received · ${formatMoney(paymentAmount(d))}${d.payment_reference || d.utr ? ` · ${d.payment_reference || d.utr}` : ''}${isReversed(d) ? ' (reversed)' : ''}` },
  promise: { icon: 'calendar', label: (d) => `Promise to pay ${formatMoney(d.promised_amount)} by ${formatDate(d.promised_date)} (${d.status})` },
  dispute: { icon: 'flag', label: (d) => `Dispute: ${String(d.reason).replace(/_/g, ' ')} (${d.status})` },
  message: { icon: 'message', label: (d) => `${d.direction === 'inbound' ? 'Reply received' : 'Reminder sent'} · ${d.status}` },
};

const paymentAmount = (d) => d.allocated_amount ?? d.received_amount ?? d.amount;
const isReversed = (d) => d.confirmation_status === 'reversed' || d.status === 'reversed' || Boolean(d.reversed_at);

export default function InvoiceDetail({ invoice, onClose, onChanged }) {
  const { can } = useAuth();
  const toast = useToast();
  const timeline = useApi(`/invoices/${invoice.id}/timeline`);
  const [active, setActive] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [reversing, setReversing] = useState(null);
  const item = toActionItem(invoice);
  const open = Number(invoice.outstanding_balance) > 0 && !['void', 'disputed'].includes(invoice.payment_status);
  const done = () => { onChanged(); timeline.reload(); };

  async function startEdit() {
    setLoadingEdit(true);
    try {
      setEditDraft(invoiceToDraft(await loadInvoice(invoice.id)));
    } catch (err) {
      toast.error(`Couldn’t open the invoice for editing: ${err.message}`);
    } finally {
      setLoadingEdit(false);
    }
  }

  return (
    <>
      <Modal open={!active && !editDraft && !reversing} onClose={onClose} size="lg" title={`Invoice ${invoice.invoice_number}`} description={invoice.customer_name}
        footer={can('write') && (
          <>
            <Button icon="edit" variant="ghost" onClick={startEdit} loading={loadingEdit}>Edit</Button>
            {open && <>
            <Button icon="flag" variant="ghost" onClick={() => setActive({ type: 'dispute', item })}>Dispute</Button>
            <Button icon="calendar" onClick={() => setActive({ type: 'promise', item })}>Promise</Button>
            <Button icon="message" onClick={() => setActive({ type: 'reminder', item })}>Remind</Button>
            <Button icon="wallet" variant="primary" onClick={() => setActive({ type: 'payment', item })}>Record payment</Button>
            </>}
          </>
        )}>
        <dl className="detail-grid">
          <div><dt>Status</dt><dd><StatusBadge status={displayStatus(invoice)} /></dd></div>
          <div><dt>Invoice date</dt><dd>{formatDate(invoice.invoice_date)}</dd></div>
          <div><dt>Due date</dt><dd>{formatDate(invoice.due_date)}</dd></div>
          <div><dt>Amount</dt><dd className="tabular">{formatMoney(invoice.original_amount, invoice.currency_code)}</dd></div>
          <div><dt>Paid</dt><dd className="tabular">{formatMoney(invoice.total_paid, invoice.currency_code)}</dd></div>
          <div><dt>Outstanding</dt><dd className="tabular strong">{formatMoney(invoice.outstanding_balance, invoice.currency_code)}</dd></div>
          <div><dt>Phone</dt><dd>{invoice.customer_phone || '—'}</dd></div>
          <div><dt>Days overdue</dt><dd>{invoice.days_overdue || 0}</dd></div>
        </dl>

        <div>
          <h3 className="section-title">Activity</h3>
          {timeline.error ? (
            <Alert tone="danger">{timeline.error.message}</Alert>
          ) : timeline.loading && !timeline.data ? (
            <div className="stack"><Skeleton /><Skeleton width="70%" /></div>
          ) : !timeline.data?.timeline?.length ? (
            <p className="hint">No activity yet. Payments, promises, disputes and reminders will appear here.</p>
          ) : (
            <ol className="timeline">
              {timeline.data.timeline.map((ev, i) => (
                <li key={`${ev.type}-${ev.details?.id ?? i}`}>
                  <span className="timeline-icon"><Icon name={EVENT[ev.type]?.icon} size={14} /></span>
                  <div className="timeline-body">
                    <div className={ev.type === 'payment' && isReversed(ev.details) ? 'struck' : undefined}>{EVENT[ev.type]?.label(ev.details) ?? ev.type}</div>
                    <div className="hint">{ev.date ? new Date(ev.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</div>
                  </div>
                  {ev.type === 'payment' && can('manageTeam') && !isReversed(ev.details) && ev.details?.id && (
                    <Button size="sm" variant="ghost" onClick={() => setReversing(ev.details)}>Reverse</Button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </Modal>
      <ActionDialogs active={active} onClose={() => setActive(null)} onDone={done} />
      {editDraft && (
        <DraftEditor
          mode="edit"
          draft={editDraft}
          onClose={() => setEditDraft(null)}
          onSave={async (d) => {
            await updateInvoice(d);
            toast.success(`Invoice ${d.invoice_number.trim()} updated.`);
            setEditDraft(null);
            done();
          }}
        />
      )}
      {reversing && <ReverseDialog payment={reversing} onClose={() => setReversing(null)} onDone={() => { setReversing(null); done(); }} />}
    </>
  );
}

// Owner-only: undo a payment recorded by mistake (e.g. wrong amount). The balance reopens.
function ReverseDialog({ payment, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tooShort = reason.trim().length < 3;

  async function submit(e) {
    e.preventDefault();
    if (tooShort) return;
    setBusy(true);
    setError('');
    try {
      await api('/payments/reverse', { method: 'POST', body: { paymentId: payment.id, reason: reason.trim() } });
      toast.success('Payment reversed. The balance has been reopened.');
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} busy={busy} title="Reverse payment" description={`${formatMoney(paymentAmount(payment))} will be removed from this invoice’s paid amount.`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="danger-solid" type="submit" form="reverse-form" loading={busy} disabled={tooShort}>Reverse payment</Button></>}>
      {error && <Alert tone="danger">{error}</Alert>}
      <form id="reverse-form" onSubmit={submit} className="stack">
        <Field label="Reason" htmlFor="rv-reason" hint="Kept in the audit log, e.g. “Entered ₹5,000 instead of ₹500”">
          <input id="rv-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} data-autofocus />
        </Field>
        <p className="hint">To record the correct amount, use <strong>Record payment</strong> afterwards.</p>
      </form>
    </Modal>
  );
}
