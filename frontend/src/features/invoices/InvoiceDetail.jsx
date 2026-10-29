import { useState } from 'react';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../app/authContext';
import { formatMoney, formatDate } from '../../lib/format';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { Skeleton, StatusBadge, Alert } from '../../components/ui/Feedback';
import ActionDialogs from '../dashboard/ActionDialogs';
import { displayStatus, toActionItem } from './invoiceStatus';

const EVENT = {
  payment: { icon: 'wallet', label: (d) => `Payment received · ${formatMoney(d.allocated_amount ?? d.received_amount)}` },
  promise: { icon: 'calendar', label: (d) => `Promise to pay ${formatMoney(d.promised_amount)} by ${formatDate(d.promised_date)} (${d.status})` },
  dispute: { icon: 'flag', label: (d) => `Dispute: ${String(d.reason).replace(/_/g, ' ')} (${d.status})` },
  message: { icon: 'message', label: (d) => `${d.direction === 'inbound' ? 'Reply received' : 'Reminder sent'} · ${d.status}` },
};

export default function InvoiceDetail({ invoice, onClose, onChanged }) {
  const { can } = useAuth();
  const timeline = useApi(`/invoices/${invoice.id}/timeline`);
  const [active, setActive] = useState(null);
  const item = toActionItem(invoice);
  const open = Number(invoice.outstanding_balance) > 0 && !['void', 'disputed'].includes(invoice.payment_status);
  const done = () => { onChanged(); timeline.reload(); };

  return (
    <>
      <Modal open={!active} onClose={onClose} size="lg" title={`Invoice ${invoice.invoice_number}`} description={invoice.customer_name}
        footer={can('write') && open && (
          <>
            <Button icon="flag" variant="ghost" onClick={() => setActive({ type: 'dispute', item })}>Dispute</Button>
            <Button icon="calendar" onClick={() => setActive({ type: 'promise', item })}>Promise</Button>
            <Button icon="message" onClick={() => setActive({ type: 'reminder', item })}>Remind</Button>
            <Button icon="wallet" variant="primary" onClick={() => setActive({ type: 'payment', item })}>Record payment</Button>
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
                  <div>
                    <div>{EVENT[ev.type]?.label(ev.details) ?? ev.type}</div>
                    <div className="hint">{ev.date ? new Date(ev.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Modal>
      <ActionDialogs active={active} onClose={() => setActive(null)} onDone={done} />
    </>
  );
}
