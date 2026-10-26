import { useState } from 'react';
import Papa from 'papaparse';
import { api } from '../api';

export default function InvoiceImportModal({ isOpen, onClose, onImportSuccess }) {
  const [activeTab, setActiveTab] = useState('valid');
  const [previewData, setPreviewData] = useState({ valid: [], duplicates: [], errors: [] });
  const [loading, setLoading] = useState(false);
  const [commitStatus, setCommitStatus] = useState('');

  if (!isOpen) return null;

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const res = await api('/import/preview', {
            method: 'POST',
            body: JSON.stringify({ rows: results.data }),
          });
          setPreviewData(res);
          setActiveTab(res.valid.length > 0 ? 'valid' : res.errors.length > 0 ? 'errors' : 'duplicates');
        } catch (err) {
          alert('Failed to parse file: ' + err.message);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleCommit = async () => {
    setLoading(true);
    try {
      await api('/import/commit', {
        method: 'POST',
        body: JSON.stringify({ rows: previewData.valid }),
      });
      setCommitStatus('Import successful!');
      setTimeout(() => {
        onImportSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      alert('Commit failed: ' + err.message);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-xl font-bold">Import Invoices (CSV)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
        </div>

        <div className="my-4">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>

        {/* Tabs */}
        <div className="flex space-x-4 border-b">
          <button
            onClick={() => setActiveTab('valid')}
            className={`py-2 px-4 border-b-2 font-medium ${activeTab === 'valid' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}
          >
            Valid Rows ({previewData.valid.length})
          </button>
          <button
            onClick={() => setActiveTab('duplicates')}
            className={`py-2 px-4 border-b-2 font-medium ${activeTab === 'duplicates' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}
          >
            Duplicates ({previewData.duplicates.length})
          </button>
          <button
            onClick={() => setActiveTab('errors')}
            className={`py-2 px-4 border-b-2 font-medium ${activeTab === 'errors' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}
          >
            Errors ({previewData.errors.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {activeTab === 'valid' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2">Row</th>
                  <th className="p-2">Customer</th>
                  <th className="p-2">Invoice #</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {previewData.valid.map((r) => (
                  <tr key={r.row} className="border-b">
                    <td className="p-2">{r.row}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{r.invoice_number}</td>
                    <td className="p-2">₹{r.amount.toLocaleString('en-IN')}</td>
                    <td className="p-2">{r.due_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'duplicates' && (
            <div className="space-y-2">
              {previewData.duplicates.map((d) => (
                <div key={d.row} className="p-3 bg-amber-50 text-amber-800 rounded border border-amber-200 text-sm">
                  <strong>Row {d.row}:</strong> {d.reason} ({d.data.invoice_number})
                </div>
              ))}
            </div>
          )}

          {activeTab === 'errors' && (
            <div className="space-y-2">
              {previewData.errors.length > 0 && (
                <button onClick={downloadErrorCsv} className="mb-2 text-sm text-indigo-600 underline">
                  Download Error Rows as CSV
                </button>
              )}
              {previewData.errors.map((e) => (
                <div key={e.row} className="p-3 bg-red-50 text-red-800 rounded border border-red-200 text-sm">
                  <strong>Row {e.row}:</strong> {e.reason}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t pt-4 flex justify-between items-center">
          <span className="text-sm text-green-600 font-semibold">{commitStatus}</span>
          <div className="space-x-3">
            <button onClick={onClose} className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleCommit}
              disabled={loading || previewData.valid.length === 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              Commit Valid Rows ({previewData.valid.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}