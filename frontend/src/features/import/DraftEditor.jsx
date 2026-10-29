import { useState } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { Field, Alert } from '../../components/ui/Feedback';
import { validateDraft, amountOf } from './extract/draft';
import { formatMoney } from '../../lib/format';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];

const COPY = {
  review: { title: 'Review invoice', save: 'Save changes' },
  create: { title: 'New invoice', save: 'Save invoice' },
  edit: { title: 'Edit invoice', save: 'Save changes' },
};

// Full invoice form, including line items and payment status. Used to review an
// extracted invoice, type one in manually ("create") or correct a saved one ("edit").
// onSave may return a promise; a rejection keeps the form open and shows its message.
export default function DraftEditor({ draft, mode = 'review', onSave, onClose }) {
  const [d, setD] = useState(() => structuredClone(draft));
  const [touched, setTouched] = useState(mode !== 'create');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const errors = validateDraft(d);
  const show = (key) => (touched ? errors[key] : undefined);

  const set = (key) => (e) => setD((x) => ({ ...x, [key]: e.target.value }));
  const setItem = (i, key) => (e) => setD((x) => {
    const line_items = x.line_items.map((it, j) => (j === i ? { ...it, [key]: e.target.value } : it));
    return { ...x, line_items };
  });
  const itemsTotal = d.line_items.reduce((s, it) => s + amountOf(it.amount), 0);
  const paidSoFar = mode === 'edit' ? d.total_paid || 0 : amountOf(d.paid_amount);
  const balance = Math.max(0, amountOf(d.amount) - paidSoFar);

  const input = (key, props = {}) => (
    <input id={`ed-${key}`} className="input" value={d[key] ?? ''} onChange={set(key)} aria-invalid={Boolean(show(key))} {...props} />
  );

  async function save() {
    setTouched(true);
    if (Object.keys(errors).length) {
      setSaveError('Fix the highlighted fields first.');
      return;
    }
    setBusy(true);
    setSaveError('');
    try {
      await onSave({ ...d, serverError: null });
    } catch (err) {
      setSaveError(err.message || 'Could not save. Try again.');
      setBusy(false);
    }
  }

  const description = mode === 'review'
    ? `From ${draft.source.fileName}${draft.source.index ? ` · row ${draft.source.index}` : ''}`
    : mode === 'create'
      ? 'Type in the invoice details. Only the starred fields are required.'
      : `${draft.invoice_number} · changes are saved to the invoice and its customer`;

  return (
    <Modal open onClose={onClose} busy={busy} size="lg" title={COPY[mode].title} description={description}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>{COPY[mode].save}</Button></>}>
      {saveError && <Alert tone="danger">{saveError}</Alert>}
      {d.warnings.length > 0 && <Alert tone="warning">{d.warnings.join(' ')}</Alert>}
      {draft.serverError && <Alert tone="danger">{draft.serverError}</Alert>}

      <div className="form-grid">
        <Field label="Invoice number *" htmlFor="ed-invoice_number" error={show('invoice_number')}>{input('invoice_number', { 'data-autofocus': true, placeholder: 'e.g. INV-0042' })}</Field>
        <Field label="Customer *" htmlFor="ed-customer_name" error={show('customer_name')}>{input('customer_name', { placeholder: 'Who owes the money' })}</Field>
        <Field label="Vendor" htmlFor="ed-vendor_name" optional>{input('vendor_name')}</Field>
      </div>
      <div className="form-grid">
        <Field label="Invoice date" htmlFor="ed-invoice_date" optional>{input('invoice_date', { type: 'date' })}</Field>
        <Field label="Due date *" htmlFor="ed-due_date" error={show('due_date')}>{input('due_date', { type: 'date' })}</Field>
        <Field label="Currency" htmlFor="ed-currency">
          <select id="ed-currency" className="select" value={d.currency} onChange={set('currency')}>
            {[...new Set([d.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Customer phone" htmlFor="ed-phone" optional error={show('phone')}>{input('phone', { type: 'tel', placeholder: '10 digits or +countrycode' })}</Field>
        <Field label="Customer email" htmlFor="ed-email" optional error={show('email')}>{input('email', { type: 'email' })}</Field>
      </div>
      <div className="form-grid">
        <Field label="Subtotal" htmlFor="ed-subtotal" optional>{input('subtotal', { inputMode: 'decimal', className: 'input tabular' })}</Field>
        <Field label="Tax" htmlFor="ed-tax" optional>{input('tax', { inputMode: 'decimal', className: 'input tabular' })}</Field>
        <Field label="Total *" htmlFor="ed-amount" error={show('amount')}>{input('amount', { inputMode: 'decimal', className: 'input tabular', placeholder: '0.00' })}</Field>
      </div>

      <section className="payment-box" aria-labelledby="ed-payment-title">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 id="ed-payment-title" className="section-title" style={{ margin: 0 }}>Payment</h3>
          <span className="hint tabular">Balance due <strong className="text-strong">{formatMoney(balance, d.currency)}</strong></span>
        </div>
        {mode === 'edit' ? (
          <p className="hint">
            {formatMoney(paidSoFar, d.currency)} received so far. Use <strong>Record payment</strong> to add a payment, or reverse a wrong one from the activity list.
          </p>
        ) : (
          <div className="form-grid">
            <Field label="Amount already paid" htmlFor="ed-paid_amount" optional error={show('paid_amount')} hint="Money received before adding this invoice">
              {input('paid_amount', { inputMode: 'decimal', className: 'input tabular', placeholder: '0.00' })}
            </Field>
            {balance > 0 && (
              <Field label="Promised payment date" htmlFor="ed-promise_date" optional error={show('promise_date')} hint="If the customer committed to a date">
                {input('promise_date', { type: 'date' })}
              </Field>
            )}
          </div>
        )}
      </section>

      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 className="section-title" style={{ margin: 0 }}>Line items</h3>
          <Button size="sm" icon="plus" onClick={() => setD((x) => ({ ...x, line_items: [...x.line_items, { description: '', quantity: 1, unit_price: '', amount: '' }] }))}>Add line</Button>
        </div>
        {d.line_items.length === 0 ? (
          <p className="hint">{mode === 'review' ? 'No line items were detected. ' : ''}Line items are optional.</p>
        ) : (
          <div className="table-wrap line-items">
            <table className="table">
              <thead><tr><th scope="col">Description</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Unit price</th><th scope="col" className="num">Amount</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>
                {d.line_items.map((it, i) => (
                  <tr key={i}>
                    <td><input className="input input-sm" aria-label={`Line ${i + 1} description`} value={it.description} onChange={setItem(i, 'description')} /></td>
                    <td><input className="input input-sm tabular" aria-label={`Line ${i + 1} quantity`} inputMode="decimal" value={it.quantity} onChange={setItem(i, 'quantity')} /></td>
                    <td><input className="input input-sm tabular" aria-label={`Line ${i + 1} unit price`} inputMode="decimal" value={it.unit_price} onChange={setItem(i, 'unit_price')} /></td>
                    <td><input className="input input-sm tabular" aria-label={`Line ${i + 1} amount`} inputMode="decimal" value={it.amount} onChange={setItem(i, 'amount')} /></td>
                    <td><button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove line ${i + 1}`} onClick={() => setD((x) => ({ ...x, line_items: x.line_items.filter((_, j) => j !== i) }))}><Icon name="trash" size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d.line_items.length > 0 && (
          <p className="hint">Line items total {formatMoney(itemsTotal, d.currency)}{d.subtotal !== '' && Math.abs(itemsTotal - amountOf(d.subtotal)) > 1 ? ' · doesn’t match the subtotal' : ''}</p>
        )}
      </div>
    </Modal>
  );
}
