import { useState } from 'react';

export default function InvoiceImportModal({ token, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPreview(null);
      setError('');
    }
  };

  const handleUploadPreview = async () => {
    if (!file) return;
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('http://localhost:5001/api/invoices/import-preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to preview file');

      setPreview(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!preview || !preview.validRows || preview.validRows.length === 0) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('http://localhost:5001/api/invoices/import-commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ rows: preview.validRows })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import invoices');

      onSuccess(data.count);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f3f4f6' }}>Upload Invoices (Excel / CSV)</h2>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        {!preview ? (
          <div>
            <div style={dropzoneStyle}>
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                onChange={handleFileChange}
                style={{ display: 'none' }} 
                id="invoice-file-input" 
              />
              <label htmlFor="invoice-file-input" style={{ cursor: 'pointer', textAlign: 'center' }}>
                <p style={{ color: '#9ca3af', marginBottom: '0.5rem' }}>
                  {file ? file.name : 'Click to select or drop your .xlsx or .csv file'}
                </p>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  Required columns: Invoice Number, Customer Name, Due Date, Amount
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.75rem' }}>
              <button onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
              <button 
                disabled={!file || loading} 
                onClick={handleUploadPreview} 
                style={file && !loading ? primaryButtonStyle : disabledButtonStyle}
              >
                {loading ? 'Analyzing File...' : 'Preview Records'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ ...summaryCardStyle, borderColor: '#10b981' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10b981' }}>{preview.summary.validCount}</div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Ready to Import</div>
              </div>
              <div style={{ ...summaryCardStyle, borderColor: '#f59e0b' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f59e0b' }}>{preview.summary.duplicateCount}</div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Duplicates (Skipped)</div>
              </div>
              <div style={{ ...summaryCardStyle, borderColor: '#ef4444' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ef4444' }}>{preview.summary.invalidCount}</div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Errors (Skipped)</div>
              </div>
            </div>

            {/* Preview Sample Table */}
            <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #374151', borderRadius: '6px', marginBottom: '1.25rem' }}>
              <table style={{ width: '100%', fontSize: '0.8rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#1f2937', color: '#9ca3af', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '8px' }}>Inv #</th>
                    <th style={{ padding: '8px' }}>Customer</th>
                    <th style={{ padding: '8px' }}>Amount</th>
                    <th style={{ padding: '8px' }}>Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.validRows.slice(0, 10).map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #374151' }}>
                      <td style={{ padding: '8px', color: '#f3f4f6' }}>{r.invoiceNumber}</td>
                      <td style={{ padding: '8px', color: '#f3f4f6' }}>{r.customerName}</td>
                      <td style={{ padding: '8px', color: '#f3f4f6' }}>₹{r.originalAmount.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px', color: '#f3f4f6' }}>{r.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setPreview(null)} style={secondaryButtonStyle}>Back to File</button>
              <button 
                disabled={preview.summary.validCount === 0 || loading} 
                onClick={handleCommit}
                style={preview.summary.validCount > 0 && !loading ? primaryButtonStyle : disabledButtonStyle}
              >
                {loading ? 'Importing...' : `Confirm & Import ${preview.summary.validCount} Invoices`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalContentStyle = {
  backgroundColor: '#111827',
  borderRadius: '8px',
  border: '1px solid #374151',
  width: '100%',
  maxWidth: '560px',
  padding: '1.5rem',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
};

const dropzoneStyle = {
  border: '2px dashed #4b5563',
  borderRadius: '8px',
  padding: '2rem 1rem',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: '#1f2937'
};

const summaryCardStyle = {
  border: '1px solid',
  borderRadius: '6px',
  padding: '0.75rem',
  backgroundColor: '#1f2937',
  textAlign: 'center'
};

const primaryButtonStyle = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  padding: '0.5rem 1rem',
  borderRadius: '6px',
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer'
};

const secondaryButtonStyle = {
  backgroundColor: '#374151',
  color: '#d1d5db',
  padding: '0.5rem 1rem',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer'
};

const disabledButtonStyle = {
  backgroundColor: '#4b5563',
  color: '#9ca3af',
  padding: '0.5rem 1rem',
  borderRadius: '6px',
  border: 'none',
  cursor: 'not-allowed'
};

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#9ca3af',
  fontSize: '1.25rem',
  cursor: 'pointer'
};

const errorStyle = {
  backgroundColor: 'rgba(239, 68, 68, 0.2)',
  color: '#f87171',
  padding: '0.5rem',
  borderRadius: '4px',
  marginBottom: '1rem',
  fontSize: '0.85rem'
};