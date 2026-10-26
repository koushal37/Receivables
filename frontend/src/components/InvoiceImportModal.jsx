import { useState } from 'react';
import Papa from 'papaparse';
import { api } from '../api';

export default function InvoiceImportModal({ isOpen, onClose, onImportSuccess }) {
  const [activeTab, setActiveTab] = useState('valid');
  const [previewData, setPreviewData] = useState({ valid: [], duplicates: [], errors: [] });
  const [loading, setLoading] = useState(false);
  const [commitStatus, setCommitStatus] = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  if (!isOpen) return null;

  const parseAndPreviewRows = async (rows) => {
    setLoading(true);
    setErrorBanner('');
    setCommitStatus('');
    try {
      const res = await api('/import/preview', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      setPreviewData(res);
      setActiveTab(res.valid.length > 0 ? 'valid' : res.errors.length > 0 ? 'errors' : 'duplicates');
    } catch (err) {
      setErrorBanner('Failed to preview rows: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        await parseAndPreviewRows(results.data);
      },
    });
  };

  const loadSampleTallyBatch = async () => {
    const sampleRows = [
      {
        invoice_number: `INV-2026-${Math.floor(200 + Math.random() * 700)}`,
        customer_name: 'Odisha Ferro Alloys Corp',
        phone: '+919437889900',
        amount: '₹1,85,000',
        due_date: '18/10/2026',
      },
      {
        invoice_number: `INV-2026-${Math.floor(200 + Math.random() * 700)}`,
        customer_name: 'Brahmani Infratech Pvt Ltd',
        phone: '+919861554433',
        amount: '2,45,500',
        due_date: '26/10/2026',
      },
      {
        invoice_number: 'INV-2026-101', // Deliberate duplicate against existing DB
        customer_name: 'Kalinga Infra Projects Ltd',
        phone: '+919437123456',
        amount: '3,40,000',
        due_date: '08/10/2026',
      },
      {
        invoice_number: 'INV-ERR-999', // Deliberate invalid row to showcase error detection
        customer_name: 'Incomplete Party Record',
        phone: '+919000000000',
        amount: '-5000',
        due_date: '35/13/2026',
      },
    ];
    await parseAndPreviewRows(sampleRows);
  };

  const downloadSampleTemplate = () => {
    const templateCsv =
      'invoice_number,customer_name,phone,amount,due_date\n' +
      'INV-2026-301,Rourkela Cement Works,+919437111222,"1,50,000",20/10/2026\n' +
      'INV-2026-302,Sambalpur Traders,+919861333444,"85,000",26/10/2026\n';
    const blob = new Blob([templateCsv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tally-invoice-import-template.csv';
    a.click();
  };

  const handleCommit = async () => {
    setLoading(true);
    setErrorBanner('');
    try {
      const res = await api('/import/commit', {
        method: 'POST',
        body: JSON.stringify({ rows: previewData.valid }),
      });
      setCommitStatus(`✅ Successfully imported ${res.count || previewData.valid.length} invoices!`);
      setTimeout(() => {
        onImportSuccess();
        onClose();
      }, 900);
    } catch (err) {
      setErrorBanner('Commit failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadErrorCsv = () => {
    const csvContent = Papa.unparse(
      previewData.errors.map((e) => ({
        Row: e.row,
        Reason: e.reason,
        ...e.data,
      }))
    );
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Import Invoices (Tally / Excel CSV)</h3>
            <p className="text-xs text-slate-500">
              Supports Indian currency formatting (₹1,50,000), DD/MM/YYYY dates, duplicate detection & atomic commit
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
        </div>

        {errorBanner && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {errorBanner}
          </div>
        )}

        <div className="my-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:font-semibold hover:file:bg-indigo-700"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadSampleTallyBatch}
              className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold transition"
            >
              ⚡ Load Sample Tally Test Batch
            </button>
            <button
              type="button"
              onClick={downloadSampleTemplate}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
            >
              ⬇ Sample CSV Template
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-4 border-b border-slate-200 text-sm">
          <button
            onClick={() => setActiveTab('valid')}
            className={`py-2 px-4 border-b-2 font-semibold ${
              activeTab === 'valid' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'
            }`}
          >
            Valid Rows ({previewData.valid.length})
          </button>
          <button
            onClick={() => setActiveTab('duplicates')}
            className={`py-2 px-4 border-b-2 font-semibold ${
              activeTab === 'duplicates' ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-500'
            }`}
          >
            Duplicates Skipped ({previewData.duplicates.length})
          </button>
          <button
            onClick={() => setActiveTab('errors')}
            className={`py-2 px-4 border-b-2 font-semibold ${
              activeTab === 'errors' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500'
            }`}
          >
            Validation Errors ({previewData.errors.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 min-h-[220px]">
          {activeTab === 'valid' && (
            previewData.valid.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">
                Upload a CSV file or click &ldquo;⚡ Load Sample Tally Test Batch&rdquo; above to preview records.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-600 uppercase">
                    <th className="p-2.5">Row</th>
                    <th className="p-2.5">Customer Name</th>
                    <th className="p-2.5">Phone</th>
                    <th className="p-2.5">Invoice #</th>
                    <th className="p-2.5">Parsed Amount</th>
                    <th className="p-2.5">Normalized Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.valid.map((r) => (
                    <tr key={r.row} className="border-b hover:bg-slate-50">
                      <td className="p-2.5 font-mono">{r.row}</td>
                      <td className="p-2.5 font-semibold text-slate-900">{r.name}</td>
                      <td className="p-2.5 text-slate-500">{r.phone || '-'}</td>
                      <td className="p-2.5 font-mono text-indigo-600 font-semibold">{r.invoice_number}</td>
                      <td className="p-2.5 font-bold text-emerald-700">₹{Number(r.amount).toLocaleString('en-IN')}</td>
                      <td className="p-2.5">{r.due_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {activeTab === 'duplicates' && (
            <div className="space-y-2">
              {previewData.duplicates.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No duplicate invoice numbers detected.</div>
              ) : (
                previewData.duplicates.map((d) => (
                  <div key={d.row} className="p-3 bg-amber-50 text-amber-900 rounded-lg border border-amber-200 text-xs">
                    <strong>Row {d.row}:</strong> {d.reason} — Invoice <span className="font-mono font-bold">{d.data?.invoice_number}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'errors' && (
            <div className="space-y-2">
              {previewData.errors.length > 0 && (
                <button
                  onClick={downloadErrorCsv}
                  className="mb-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-xs font-semibold"
                >
                  ⬇ Download Rejected Rows as CSV
                </button>
              )}
              {previewData.errors.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">Zero formatting errors found.</div>
              ) : (
                previewData.errors.map((e) => (
                  <div key={e.row} className="p-3 bg-red-50 text-red-800 rounded-lg border border-red-200 text-xs">
                    <strong>Row {e.row}:</strong> {e.reason}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-4 flex justify-between items-center">
          <span className="text-sm text-emerald-600 font-semibold">{commitStatus}</span>
          <div className="space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={loading || previewData.valid.length === 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : `Confirm & Import Valid Rows (${previewData.valid.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
