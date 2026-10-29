import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { href } from '../../app/router';
import { formatMoney } from '../../lib/format';
import { useToast } from '../../components/ui/toastContext';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import Dropzone from './Dropzone';
import FileQueue from './FileQueue';
import DraftEditor from './DraftEditor';
import { processFile } from './importPipeline';
import { validateFile, MAX_FILES } from './fileTypes';
import { validateDraft, draftToRow, amountOf, emptyDraft } from './extract/draft';

const TEMPLATE = 'Invoice Number,Customer Name,Phone,Email,Invoice Date,Due Date,Subtotal,Tax,Amount,Currency,Amount Paid,Promise Date\nINV-001,Acme Traders,9876543210,accounts@acme.in,01/10/2026,31/10/2026,"1,00,000","18,000","1,18,000",INR,"50,000",15/11/2026\n';

function downloadText(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let fileSeq = 0;

export default function ImportPage() {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const processing = useRef(false);
  const queue = useRef([]);
  const removed = useRef(new Set());

  const patchFile = (id, patch) => setFiles((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  // Files are processed one at a time: OCR is CPU-heavy and this keeps the UI responsive.
  async function drain() {
    if (processing.current) return;
    processing.current = true;
    while (queue.current.length) {
      const item = queue.current.shift();
      patchFile(item.id, { status: 'processing', stage: 'Starting', progress: 0 });
      try {
        const found = await processFile(item.file, ({ stage, progress }) => patchFile(item.id, { stage, progress }));
        if (!removed.current.has(item.id)) {
          setDrafts((list) => [...list, ...found.map((d) => ({ ...d, fileId: item.id }))]);
          patchFile(item.id, { status: 'done', draftCount: found.length });
        }
      } catch (err) {
        patchFile(item.id, { status: 'error', error: err.message || 'Something went wrong reading this file.', retryable: /internet|connection/i.test(err.message) });
      }
    }
    processing.current = false;
  }

  function addFiles(list) {
    setResult(null);
    const room = MAX_FILES - files.filter((f) => f.status !== 'error').length;
    if (list.length > room) toast.error(`You can add up to ${MAX_FILES} files at a time. ${list.length - Math.max(room, 0)} file(s) were skipped.`);
    const items = list.slice(0, Math.max(room, 0)).map((file) => {
      const { format, error } = validateFile(file);
      return { id: `f${++fileSeq}`, file, format, status: error ? 'error' : 'queued', error };
    });
    setFiles((current) => [...current, ...items]);
    queue.current.push(...items.filter((i) => i.status === 'queued'));
    drain();
  }

  function removeFile(id) {
    removed.current.add(id);
    queue.current = queue.current.filter((i) => i.id !== id);
    setFiles((list) => list.filter((f) => f.id !== id));
    setDrafts((list) => list.filter((d) => d.fileId !== id));
  }

  function retryFile(id) {
    const item = files.find((f) => f.id === id);
    if (!item) return;
    patchFile(id, { status: 'queued', error: null });
    queue.current.push(item);
    drain();
  }

  const updateDraft = (key, patch) => setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const withErrors = useMemo(() => drafts.map((d) => ({ d, errors: validateDraft(d) })), [drafts]);
  const included = withErrors.filter(({ d }) => d.include);
  const blocking = included.filter(({ d, errors }) => Object.keys(errors).length || d.serverError);
  const attention = withErrors.filter(({ d, errors }) => Object.keys(errors).length || d.serverError || d.warnings.length);
  const shown = filter === 'attention' ? attention : withErrors;
  const busy = files.some((f) => f.status === 'queued' || f.status === 'processing');

  // Warn before leaving with unsaved, reviewed drafts
  useEffect(() => {
    if (!drafts.length || result) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [drafts.length, result]);

  async function submit() {
    if (!included.length || blocking.length) return;
    setSubmitting(true);
    const rows = included.map(({ d }, i) => draftToRow(d, i + 1));
    const byRow = new Map(included.map(({ d }, i) => [i + 1, d.key]));
    const fileName = [...new Set(included.map(({ d }) => d.source.fileName))].join(', ').slice(0, 255);
    try {
      const preview = await api('/import/preview', { method: 'POST', body: { rows } });
      const problems = [...preview.errors, ...preview.duplicates];
      if (problems.length) {
        setDrafts((list) => list.map((d) => {
          const p = problems.find((x) => byRow.get(x.row) === d.key);
          return p ? { ...d, serverError: p.reason } : d;
        }));
        setFilter('attention');
        toast.error(`${problems.length} invoice${problems.length === 1 ? '' : 's'} need attention before importing.`);
        return;
      }
      const res = await api('/import/commit', { method: 'POST', body: { rows, fileName } });
      const total = included.reduce((s, { d }) => s + amountOf(d.amount), 0);
      setResult({ count: res.count ?? rows.length, total, currency: included[0].d.currency, payments: res.payments || 0, promises: res.promises || 0 });
      (res.warnings || []).forEach((w) => toast.error(w));
      setDrafts([]);
      setFiles([]);
      toast.success(`Imported ${res.count ?? rows.length} invoice${rows.length === 1 ? '' : 's'}.`);
    } catch (err) {
      if (err.body?.errors || err.body?.duplicates) {
        const problems = [...(err.body.errors || []), ...(err.body.duplicates || [])];
        setDrafts((list) => list.map((d) => {
          const p = problems.find((x) => byRow.get(x.row) === d.key);
          return p ? { ...d, serverError: p.reason } : d;
        }));
        setFilter('attention');
      }
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="page">
        <div className="card">
          <EmptyState icon="checkCircle" title={`${result.count} invoice${result.count === 1 ? '' : 's'} imported`}
            action={<div className="row" style={{ justifyContent: 'center' }}><a className="btn btn-primary" href={href('/invoices')}>View invoices</a><Button onClick={() => setResult(null)}>Import more</Button></div>}>
            {formatMoney(result.total, result.currency)} added to your receivables
            {result.payments > 0 && `, with ${result.payments} payment${result.payments === 1 ? '' : 's'} recorded`}
            {result.promises > 0 && ` and ${result.promises} promise date${result.promises === 1 ? '' : 's'} saved`}
            . Overdue items will show up in today’s action plan.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Import invoices</h1>
          <p className="page-subtitle">Upload invoices in any common format. We’ll extract the details for you to review before saving.</p>
        </div>
        <div className="page-actions">
          <Button icon="download" onClick={() => downloadText('invoice-import-template.csv', TEMPLATE)}>CSV template</Button>
          <Button icon="plus" onClick={() => { setResult(null); setEditing('new'); }}>Add manually</Button>
        </div>
      </div>

      <Dropzone onFiles={addFiles} compact={drafts.length > 0} />
      <FileQueue items={files} onRemove={removeFile} onRetry={retryFile} />

      {drafts.length > 0 && (
        <section className="card" aria-labelledby="review-title">
          <div className="card-header">
            <div>
              <h2 id="review-title" className="card-title">Review extracted invoices</h2>
              <p className="card-subtitle">Check the highlighted fields. Click a row’s edit button for line items and more details.</p>
            </div>
            <div className="segmented" role="group" aria-label="Show">
              <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All <span className="count">{drafts.length}</span></button>
              <button type="button" aria-pressed={filter === 'attention'} onClick={() => setFilter('attention')}>Needs attention <span className="count">{attention.length}</span></button>
            </div>
          </div>

          {shown.length === 0 ? (
            <EmptyState icon="checkCircle" title="Nothing needs attention">Everything looks good. You can import now.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table table-responsive review-table">
                <caption className="sr-only">Extracted invoices</caption>
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Include</span></th>
                    <th scope="col">Invoice #</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Due date</th>
                    <th scope="col" className="num">Total</th>
                    <th scope="col">Source</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Edit</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ d, errors }) => {
                    const issues = Object.keys(errors).length + (d.serverError ? 1 : 0);
                    return (
                      <tr key={d.key} data-excluded={!d.include}>
                        <td data-label="Include">
                          <input type="checkbox" className="checkbox" checked={d.include} onChange={(e) => updateDraft(d.key, { include: e.target.checked })} aria-label={`Include ${d.invoice_number || 'invoice'} in import`} />
                        </td>
                        <td data-label="Invoice #">
                          <input className="input input-sm" value={d.invoice_number} onChange={(e) => updateDraft(d.key, { invoice_number: e.target.value, serverError: null })} aria-label="Invoice number" aria-invalid={Boolean(errors.invoice_number)} placeholder="Required" />
                        </td>
                        <td data-label="Customer">
                          <input className="input input-sm" value={d.customer_name} onChange={(e) => updateDraft(d.key, { customer_name: e.target.value })} aria-label="Customer" aria-invalid={Boolean(errors.customer_name)} placeholder="Required" />
                        </td>
                        <td data-label="Due date">
                          <input type="date" className="input input-sm" value={d.due_date} onChange={(e) => updateDraft(d.key, { due_date: e.target.value })} aria-label="Due date" aria-invalid={Boolean(errors.due_date)} />
                        </td>
                        <td data-label="Total" className="num">
                          <input className="input input-sm tabular amount-input" inputMode="decimal" value={d.amount} onChange={(e) => updateDraft(d.key, { amount: e.target.value })} aria-label={`Total in ${d.currency}`} aria-invalid={Boolean(errors.amount)} placeholder="0.00" />
                          <span className="hint">{d.currency}</span>
                          {amountOf(d.paid_amount) > 0 && <span className="hint paid-note">{formatMoney(amountOf(d.paid_amount), d.currency)} paid</span>}
                        </td>
                        <td data-label="Source" className="muted source-cell" title={d.source.fileName}>
                          <span className="truncate">{d.source.fileName}</span>
                          {d.source.method === 'ocr' && <Badge plain>OCR</Badge>}
                        </td>
                        <td data-label="Status">
                          {d.serverError ? <Badge tone="danger">{d.serverError}</Badge>
                            : issues ? <Badge tone="danger">{issues} to fix</Badge>
                              : d.warnings.length ? <Badge tone="warning">Check</Badge>
                                : <Badge tone="success">Ready</Badge>}
                        </td>
                        <td>
                          <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                            <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(d.key)} aria-label={`Edit details for ${d.invoice_number || 'invoice'}`} />
                            <Button size="sm" variant="ghost" icon="trash" onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))} aria-label={`Remove ${d.invoice_number || 'invoice'}`} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="review-footer">
            {blocking.length > 0 ? (
              <Alert tone="danger">{blocking.length} selected invoice{blocking.length === 1 ? ' has' : 's have'} missing or invalid fields. Fix or untick {blocking.length === 1 ? 'it' : 'them'} to continue.</Alert>
            ) : busy ? (
              <span className="hint">Still reading files…</span>
            ) : (
              <span className="hint">{included.length} of {drafts.length} selected · {formatMoney(included.reduce((s, { d }) => s + amountOf(d.amount), 0), included[0]?.d.currency)}</span>
            )}
            <Button variant="primary" size="lg" icon="check" onClick={submit} loading={submitting} disabled={!included.length || blocking.length > 0 || busy}>
              Import {included.length} invoice{included.length === 1 ? '' : 's'}
            </Button>
          </div>
        </section>
      )}

      {!drafts.length && !files.length && (
        <div className="format-grid" aria-label="Supported formats">
          {[
            ['file', 'PDF', 'Text PDFs are read instantly; scanned PDFs use OCR.'],
            ['image', 'Photos & scans', 'JPG, PNG, WEBP and iPhone HEIC photos via OCR.'],
            ['table', 'Spreadsheets', 'XLSX, XLS and CSV, one invoice per row. Tally exports work.'],
            ['code', 'E-invoices', 'UBL (Peppol), Factur-X / ZUGFeRD XML, JSON, and Word documents.'],
          ].map(([icon, title, text]) => (
            <div key={title} className="card card-pad format-card">
              <span className="stat-icon"><Icon name={icon} size={16} /></span>
              <h3>{title}</h3>
              <p className="hint">{text}</p>
            </div>
          ))}
        </div>
      )}

      {editing === 'new' && (
        <DraftEditor
          key="new"
          mode="create"
          draft={emptyDraft()}
          onClose={() => setEditing(null)}
          onSave={(d) => { setDrafts((list) => [...list, d]); setEditing(null); toast.info('Added to the list below. Import when you’re ready.'); }}
        />
      )}
      {editing && editing !== 'new' && (
        <DraftEditor
          key={editing}
          draft={drafts.find((d) => d.key === editing)}
          onClose={() => setEditing(null)}
          onSave={(d) => { updateDraft(editing, d); setEditing(null); }}
        />
      )}
    </div>
  );
}
