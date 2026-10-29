import { useMemo, useState } from 'react';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../app/authContext';
import { href, navigate } from '../../app/router';
import { formatMoney, formatDate } from '../../lib/format';
import Icon from '../../components/ui/Icon';
import Button from '../../components/ui/Button';
import { Skeleton, EmptyState, Alert, StatusBadge } from '../../components/ui/Feedback';
import { displayStatus, matchesFilter, todayIst } from './invoiceStatus';
import InvoiceDetail from './InvoiceDetail';
import DraftEditor from '../import/DraftEditor';
import { emptyDraft } from '../import/extract/draft';
import { createInvoice } from './invoiceApi';
import { useToast } from '../../components/ui/toastContext';

const FILTERS = [
  ['all', 'All'],
  ['overdue', 'Overdue'],
  ['due_today', 'Due today'],
  ['open', 'Open'],
  ['partially_paid', 'Part paid'],
  ['paid', 'Paid'],
  ['disputed', 'Disputed'],
];

export default function InvoicesPage({ status = 'all', search: initialSearch = '' }) {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi('/invoices');
  const [search, setSearch] = useState(initialSearch);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const invoices = useMemo(() => data?.invoices ?? [], [data]);
  const today = todayIst();
  const term = search.trim().toLowerCase();

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([key]) => [key, invoices.filter((i) => matchesFilter(i, key, today)).length])), [invoices, today]);
  const rows = invoices.filter((i) => matchesFilter(i, status, today) && (!term || `${i.invoice_number} ${i.customer_name}`.toLowerCase().includes(term)));
  const selected = invoices.find((i) => i.id === selectedId);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">Track every receivable and its balance</p>
        </div>
        {can('write') && (
          <div className="page-actions">
            <Button icon="plus" onClick={() => setCreating(true)}>New invoice</Button>
            <a className="btn btn-primary" href={href('/import')}><Icon name="upload" size={17} />Import invoices</a>
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Filter by status">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={status === key} onClick={() => navigate('/invoices', key === 'all' ? {} : { status: key })}>
              {label} {!loading && <span className="count">{counts[key]}</span>}
            </button>
          ))}
        </div>
        <div className="input-group">
          <Icon name="search" size={16} />
          <label htmlFor="inv-search" className="sr-only">Search invoices</label>
          <input id="inv-search" className="input" type="search" placeholder="Search number or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {error && <Alert tone="danger">Couldn’t load invoices: {error.message} <Button size="sm" variant="ghost" onClick={reload}>Retry</Button></Alert>}

      <div className="card">
        {loading && !data ? (
          <div className="stack card-pad" aria-busy="true" aria-label="Loading invoices">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={20} />)}
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState icon="file" title="No invoices yet" action={can('write') && <div className="row" style={{ justifyContent: 'center' }}><a className="btn btn-primary" href={href('/import')}><Icon name="upload" size={17} />Import invoices</a><Button icon="plus" onClick={() => setCreating(true)}>Add one manually</Button></div>}>
            Upload PDFs, spreadsheets, images or e-invoices and we’ll extract the details for you.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon="search" title="No matching invoices" action={<Button onClick={() => { setSearch(''); navigate('/invoices'); }}>Clear filters</Button>}>
            Try a different status or search term.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table-responsive">
              <caption className="sr-only">Invoices, {rows.length} shown</caption>
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Due</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col" className="num">Outstanding</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id}>
                    <td data-label="Invoice">
                      <button type="button" className="link-button strong" onClick={() => setSelectedId(inv.id)}>{inv.invoice_number}</button>
                    </td>
                    <td data-label="Customer">{inv.customer_name}</td>
                    <td data-label="Due" className="muted">{formatDate(inv.due_date)}</td>
                    <td data-label="Amount" className="num">{formatMoney(inv.original_amount, inv.currency_code)}</td>
                    <td data-label="Outstanding" className="num strong">{formatMoney(inv.outstanding_balance, inv.currency_code)}</td>
                    <td data-label="Status"><StatusBadge status={displayStatus(inv, today)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <InvoiceDetail invoice={selected} onClose={() => setSelectedId(null)} onChanged={reload} />}

      {creating && (
        <DraftEditor
          mode="create"
          draft={emptyDraft()}
          onClose={() => setCreating(false)}
          onSave={async (d) => {
            const res = await createInvoice(d);
            (res.warnings || []).forEach((w) => toast.error(w));
            toast.success(`Invoice ${d.invoice_number.trim()} added.`);
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
