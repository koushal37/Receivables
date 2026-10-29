import { useState } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { Field, Alert } from '../../components/ui/Feedback';
import { validateDraft, amountOf } from './extract/draft';
import { formatMoney } from '../../lib/format';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];

// Full editor for one draft, including line items. Edits stay local until Save.
export default function DraftEditor({ draft, onSave, onClose }) {
  const [d, setD] = useState(() => structuredClone(draft));
  const errors = validateDraft(d);
  const set = (key) => (e) => setD((x) => ({ ...x, [key]: e.target.value }));
  const setItem = (i, key) => (e) => setD((x) => {
    const line_items = x.line_items.map((it, j) => (j === i ? { ...it, [key]: e.target.value } : it));
    return { ...x, line_items };
  });
  const itemsTotal = d.line_items.reduce((s, it) => s + amountOf(it.amount), 0);

  const input = (key, props = {}) => (
    <input id={`ed-${key}`} className="input" value={d[key] ?? ''} onChange={set(key)} aria-invalid={Boolean(errors[key])} {...props} />
  );

  return (
    <Modal open onClose={onClose} size="lg" title="Review invoice" description={`From ${draft.source.fileName}${draft.source.index ? ` · row ${draft.source.index}` : ''}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave({ ...d, serverError: null })}>Save changes</Button></>}>
      {d.warnings.length > 0 && <Alert tone="warning">{d.warnings.join(' ')}</Alert>}
      {draft.serverError && <Alert tone="danger">{draft.serverError}</Alert>}

      <div className="form-grid">
        <Field label="Invoice number" htmlFor="ed-invoice_number" error={errors.invoice_number}>{input('invoice_number', { 'data-autofocus': true })}</Field>
        <Field label="Customer" htmlFor="ed-customer_name" error={errors.customer_name}>{input('customer_name')}</Field>
        <Field label="Vendor" htmlFor="ed-vendor_name" optional>{input('vendor_name')}</Field>
      </div>
      <div className="form-grid">
        <Field label="Invoice date" htmlFor="ed-invoice_date" optional>{input('invoice_date', { type: 'date' })}</Field>
        <Field label="Due date" htmlFor="ed-due_date" error={errors.due_date}>{input('due_date', { type: 'date' })}</Field>
        <Field label="Currency" htmlFor="ed-currency">
          <select id="ed-currency" className="select" value={d.currency} onChange={set('currency')}>
            {[...new Set([d.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Customer phone" htmlFor="ed-phone" optional error={errors.phone}>{input('phone', { type: 'tel', placeholder: '10 digits or +countrycode' })}</Field>
        <Field label="Customer email" htmlFor="ed-email" optional error={errors.email}>{input('email', { type: 'email' })}</Field>
      </div>
      <div className="form-grid">
        <Field label="Subtotal" htmlFor="ed-subtotal" optional>{input('subtotal', { inputMode: 'decimal', className: 'input tabular' })}</Field>
        <Field label="Tax" htmlFor="ed-tax" optional>{input('tax', { inputMode: 'decimal', className: 'input tabular' })}</Field>
        <Field label="Total" htmlFor="ed-amount" error={errors.amount}>{input('amount', { inputMode: 'decimal', className: 'input tabular' })}</Field>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 className="section-title" style={{ margin: 0 }}>Line items</h3>
          <Button size="sm" icon="plus" onClick={() => setD((x) => ({ ...x, line_items: [...x.line_items, { description: '', quantity: 1, unit_price: '', amount: '' }] }))}>Add line</Button>
        </div>
        {d.line_items.length === 0 ? (
          <p className="hint">No line items were detected. They’re optional.</p>
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
