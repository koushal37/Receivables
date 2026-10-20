import { useState, useEffect } from 'react';
import InvoiceImportModal from './InvoiceImportModal';

export default function InvoicesPage({ token }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showImport, setShowImport] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');
  const [recordingPay, setRecordingPay] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Data fetching runs strictly inside useEffect - eliminates exhaustive-deps warnings
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    let url = `http://localhost:5001/api/invoices?status=${statusFilter}`;
    if (appliedSearch.trim()) {
      url += `&search=${encodeURIComponent(appliedSearch.trim())}`;
    }

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Server responded with status ${res.status}`);
        }
        return data;
      })
      .then((data) => {
        if (isMounted) {
          setInvoices(data.invoices || []);
        }
      })
      .catch((err) => {
        console.error('Error fetching invoices:', err);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token, statusFilter, appliedSearch, refreshTrigger]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(search);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedInvoice || !payAmount) return;
    setRecordingPay(true);

    try {
      const res = await fetch('http://localhost:5001/api/invoices/record-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          customerId: selectedInvoice.customer_id,
          receivedAmount: parseFloat(payAmount),
          paymentReference: payRef
        })
      });

      if (!res.ok) throw new Error('Failed to record payment');

      setSelectedInvoice(null);
      setPayAmount('');
      setPayRef('');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      alert(err.message);
    } finally {
      setRecordingPay(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      overdue: { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171' },
      partially_paid: { bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24' },
      paid: { bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399' },
      open: { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' }
    };
    const s = styles[status] || { bg: '#374151', text: '#9ca3af' };
    return (
      <span style={{ backgroundColor: s.bg, color: s.text, padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div>
      {/* Top action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Search invoice or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
          <button type="submit" style={actionButtonStyle}>Search</button>
        </form>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)} 
            style={{ ...inputStyle, width: 'auto' }}
          >
            <option value="all">All Invoices</option>
            <option value="overdue">Overdue</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="open">Open</option>
            <option value="paid">Paid</option>
          </select>

          <button onClick={() => setShowImport(true)} style={primaryButtonStyle}>
            + Upload Invoices
          </button>
        </div>
      </div>

      {/* Invoice Ledger Table */}
      <div style={{ border: '1px solid #374151', borderRadius: '8px', overflowX: 'auto', backgroundColor: '#111827' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead style={{ backgroundColor: '#1f2937', color: '#9ca3af' }}>
            <tr>
              <th style={{ padding: '12px' }}>Invoice #</th>
              <th style={{ padding: '12px' }}>Customer</th>
              <th style={{ padding: '12px' }}>Due Date</th>
              <th style={{ padding: '12px' }}>Original</th>
              <th style={{ padding: '12px' }}>Paid</th>
              <th style={{ padding: '12px' }}>Outstanding</th>
              <th style={{ padding: '12px' }}>Overdue</th>
              <th style={{ padding: '12px' }}>Status</th>
              <th style={{ padding: '12px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Loading invoices...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>No invoices found. Import a file to get started.</td></tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid #1f2937' }}>
                  <td style={{ padding: '12px', fontWeight: 600, color: '#f3f4f6' }}>{inv.invoice_number}</td>
                  <td style={{ padding: '12px', color: '#f3f4f6' }}>
                    <div>{inv.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{inv.customer_phone || 'No phone'}</div>
                  </td>
                  <td style={{ padding: '12px', color: '#9ca3af' }}>{inv.due_date}</td>
                  <td style={{ padding: '12px', color: '#f3f4f6' }}>₹{Number(inv.original_amount).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '12px', color: '#10b981' }}>₹{Number(inv.total_paid).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '12px', fontWeight: 600, color: '#f87171' }}>
                    ₹{Number(inv.outstanding_balance).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '12px', color: inv.days_overdue > 0 ? '#f87171' : '#9ca3af' }}>
                    {inv.days_overdue > 0 ? `${inv.days_overdue} days` : '-'}
                  </td>
                  <td style={{ padding: '12px' }}>{getStatusBadge(inv.payment_status)}</td>
                  <td style={{ padding: '12px' }}>
                    {inv.outstanding_balance > 0 && (
                      <button 
                        onClick={() => { setSelectedInvoice(inv); setPayAmount(inv.outstanding_balance); }}
                        style={payBtnStyle}
                      >
                        Record Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Import Modal */}
      {showImport && (
        <InvoiceImportModal
          token={token}
          onClose={() => setShowImport(false)}
          onSuccess={() => setRefreshTrigger((prev) => prev + 1)}
        />
      )}

      {/* Record Payment Modal */}
      {selectedInvoice && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '420px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: '#f3f4f6' }}>
              Record Payment: {selectedInvoice.invoice_number}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1rem' }}>
              Customer: <strong>{selectedInvoice.customer_name}</strong> | Outstanding: ₹{selectedInvoice.outstanding_balance}
            </p>

            <form onSubmit={handleRecordPayment}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Amount Received (₹)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  max={selectedInvoice.outstanding_balance} 
                  required 
                  value={payAmount} 
                  onChange={(e) => setPayAmount(e.target.value)} 
                  style={inputStyle} 
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={labelStyle}>UTR / Reference / Cheque No.</label>
                <input 
                  type="text" 
                  placeholder="e.g. UTR123987456" 
                  value={payRef} 
                  onChange={(e) => setPayRef(e.target.value)} 
                  style={inputStyle} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setSelectedInvoice(null)} style={secondaryButtonStyle}>Cancel</button>
                <button type="submit" disabled={recordingPay} style={primaryButtonStyle}>
                  {recordingPay ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '6px',
  color: '#f3f4f6',
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem'
};

const actionButtonStyle = {
  backgroundColor: '#374151',
  border: 'none',
  borderRadius: '6px',
  color: '#f3f4f6',
  padding: '0.5rem 1rem',
  cursor: 'pointer'
};

const primaryButtonStyle = {
  backgroundColor: '#2563eb',
  border: 'none',
  borderRadius: '6px',
  color: '#ffffff',
  padding: '0.5rem 1rem',
  fontWeight: 500,
  cursor: 'pointer'
};

const secondaryButtonStyle = {
  backgroundColor: '#374151',
  border: 'none',
  borderRadius: '6px',
  color: '#d1d5db',
  padding: '0.5rem 1rem',
  cursor: 'pointer'
};

const payBtnStyle = {
  backgroundColor: '#059669',
  border: 'none',
  borderRadius: '4px',
  color: '#ffffff',
  padding: '4px 8px',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer'
};

const labelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  color: '#9ca3af',
  marginBottom: '4px'
};

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
  padding: '1.5rem'
};