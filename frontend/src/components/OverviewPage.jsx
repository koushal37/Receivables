import { useState, useEffect } from 'react';

export default function OverviewPage({ token, onNavigateToInvoices }) {
  const [metrics, setMetrics] = useState({
    totalOutstanding: 0,
    overdue: 0,
    dueToday: 0,
    receivedThisMonth: 0
  });
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [selectedAction, setSelectedAction] = useState(null);
  const [modalType, setModalType] = useState(null); // 'promise' | 'dispute' | 'whatsapp'
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseNotes, setPromiseNotes] = useState('');
  const [disputeReason, setDisputeReason] = useState('pricing_error');
  const [disputeNotes, setDisputeNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [mRes, aRes] = await Promise.all([
        fetch('http://localhost:5001/api/dashboard/metrics', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('http://localhost:5001/api/dashboard/action-plan', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const mData = await mRes.json();
      const aData = await aRes.json();

      if (mData.metrics) setMetrics(mData.metrics);
      if (aData.actionPlan) setActions(aData.actionPlan);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [token]);

  const showToast = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(''), 4000);
  };

  // 1. Send WhatsApp Reminder
  const handleSendWhatsApp = async (e) => {
    e.preventDefault();
    if (!selectedAction) return;
    setSubmitting(true);

    try {
      const res = await fetch('http://localhost:5001/api/messages/send-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ invoiceId: selectedAction.id })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch WhatsApp reminder');

      showToast(`WhatsApp reminder dispatched for ${selectedAction.invoiceNumber}! Status: ${data.log?.status || 'sent'}`);
      setSelectedAction(null);
      setModalType(null);
      loadDashboardData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Record Payment Promise
  const handleSavePromise = async (e) => {
    e.preventDefault();
    if (!selectedAction || !promiseDate) return;
    setSubmitting(true);

    try {
      const res = await fetch('http://localhost:5001/api/dashboard/record-promise', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customerId: selectedAction.customerId,
          invoiceId: selectedAction.id,
          promisedAmount: selectedAction.outstandingBalance,
          promisedDate: promiseDate,
          notes: promiseNotes
        })
      });

      if (!res.ok) throw new Error('Failed to save promise');
      showToast('Payment promise successfully saved.');
      setSelectedAction(null);
      setModalType(null);
      loadDashboardData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Record Dispute
  const handleSaveDispute = async (e) => {
    e.preventDefault();
    if (!selectedAction) return;
    setSubmitting(true);

    try {
      const res = await fetch('http://localhost:5001/api/dashboard/flag-dispute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customerId: selectedAction.customerId,
          invoiceId: selectedAction.id,
          reason: disputeReason,
          description: disputeNotes
        })
      });

      if (!res.ok) throw new Error('Failed to flag dispute');
      showToast('Invoice marked disputed and removed from routine follow-ups.');
      setSelectedAction(null);
      setModalType(null);
      loadDashboardData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityStyle = (priority) => {
    if (priority === 'critical') return { bg: '#ef4444', text: '#ffffff', label: 'CRITICAL' };
    if (priority === 'important') return { bg: '#f59e0b', text: '#111827', label: 'IMPORTANT' };
    return { bg: '#3b82f6', text: '#ffffff', label: 'ROUTINE' };
  };

  return (
    <div>
      {/* Toast Notification */}
      {feedbackMsg && (
        <div style={toastStyle}>
          {feedbackMsg}
        </div>
      )}

      {/* 4 Financial Indicators */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div onClick={() => onNavigateToInvoices('all')} style={metricCardStyle}>
          <div style={metricLabelStyle}>Total Outstanding</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f3f4f6' }}>
            ₹{metrics.totalOutstanding.toLocaleString('en-IN')}
          </div>
          <span style={metricHintStyle}>Click to view all open invoices →</span>
        </div>

        <div onClick={() => onNavigateToInvoices('overdue')} style={{ ...metricCardStyle, borderColor: '#ef4444' }}>
          <div style={{ ...metricLabelStyle, color: '#f87171' }}>Overdue</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f87171' }}>
            ₹{metrics.overdue.toLocaleString('en-IN')}
          </div>
          <span style={metricHintStyle}>Due date passed →</span>
        </div>

        <div onClick={() => onNavigateToInvoices('open')} style={{ ...metricCardStyle, borderColor: '#3b82f6' }}>
          <div style={{ ...metricLabelStyle, color: '#60a5fa' }}>Due Today</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#60a5fa' }}>
            ₹{metrics.dueToday.toLocaleString('en-IN')}
          </div>
          <span style={metricHintStyle}>Contractually due today →</span>
        </div>

        <div style={{ ...metricCardStyle, borderColor: '#10b981' }}>
          <div style={{ ...metricLabelStyle, color: '#34d399' }}>Received This Month</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399' }}>
            ₹{metrics.receivedThisMonth.toLocaleString('en-IN')}
          </div>
          <span style={metricHintStyle}>Confirmed receipts →</span>
        </div>
      </div>

      {/* Today's Action Plan */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f3f4f6' }}>Today's Action Plan</h2>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Prioritized collection queue ranked by business urgency</p>
          </div>
          <button onClick={loadDashboardData} style={refreshBtnStyle}>↻ Refresh Plan</button>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Calculating priorities...</div>
        ) : actions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#111827', borderRadius: '8px', color: '#9ca3af' }}>
            🎉 No pending collection follow-ups for today!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {actions.map((act) => {
              const pStyle = getPriorityStyle(act.priority);
              return (
                <div key={act.id} style={actionCardStyle}>
                  <div style={{ flex: '1 1 300px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ backgroundColor: pStyle.bg, color: pStyle.text, padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>
                        {pStyle.label}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f3f4f6' }}>{act.customerName}</span>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>({act.invoiceNumber})</span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: '#d1d5db', marginBottom: '0.25rem' }}>
                      <strong>Reason:</strong> {act.priorityReason}
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#60a5fa' }}>
                      💡 <strong>Recommended step:</strong> {act.recommendedNextStep}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: '220px' }}>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f87171' }}>
                        ₹{Number(act.outstandingBalance).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        {act.daysOverdue > 0 ? `${act.daysOverdue} days overdue` : 'Due today'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => { setSelectedAction(act); setModalType('whatsapp'); }}
                        style={cardBtnWhatsApp}
                      >
                        💬 WhatsApp
                      </button>
                      <button
                        onClick={() => { setSelectedAction(act); setModalType('promise'); }}
                        style={cardBtnSecondary}
                      >
                        + Promise
                      </button>
                      <button
                        onClick={() => { setSelectedAction(act); setModalType('dispute'); }}
                        style={cardBtnDanger}
                      >
                        Dispute
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* WhatsApp Confirmation / Preview Modal */}
      {modalType === 'whatsapp' && selectedAction && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#f3f4f6' }}>
              Confirm WhatsApp Reminder
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1rem' }}>
              Send an authorized reminder to <strong>{selectedAction.customerName}</strong> ({selectedAction.customerPhone || 'No phone attached'}).
            </p>

            <div style={previewBoxStyle}>
              <div style={{ fontSize: '0.8rem', color: '#60a5fa', marginBottom: '0.5rem', fontWeight: 600 }}>Message Preview:</div>
              <p style={{ fontSize: '0.85rem', color: '#d1d5db', margin: 0, lineHeight: 1.4 }}>
                "Hello {selectedAction.customerName}, our records show that invoice {selectedAction.invoiceNumber} for ₹{Number(selectedAction.outstandingBalance).toLocaleString('en-IN')} remains outstanding. If payment was already made, kindly share the UTR reference. Thank you!"
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" onClick={() => setModalType(null)} style={secondaryButtonStyle}>Cancel</button>
              <button
                type="button"
                disabled={submitting || !selectedAction.customerPhone}
                onClick={handleSendWhatsApp}
                style={{ ...primaryButtonStyle, backgroundColor: '#059669' }}
              >
                {submitting ? 'Sending...' : 'Send via WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promise Modal */}
      {modalType === 'promise' && selectedAction && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#f3f4f6' }}>
              Record Payment Promise
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1rem' }}>
              {selectedAction.customerName} - {selectedAction.invoiceNumber} (₹{selectedAction.outstandingBalance})
            </p>

            <form onSubmit={handleSavePromise}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Promised Payment Date</label>
                <input
                  type="date"
                  required
                  value={promiseDate}
                  onChange={(e) => setPromiseDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={labelStyle}>Notes / Customer Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Promised RTGS by Friday"
                  value={promiseNotes}
                  onChange={(e) => setPromiseNotes(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setModalType(null)} style={secondaryButtonStyle}>Cancel</button>
                <button type="submit" disabled={submitting} style={primaryButtonStyle}>
                  {submitting ? 'Saving...' : 'Record Promise'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {modalType === 'dispute' && selectedAction && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#f3f4f6' }}>
              Flag Invoice Dispute
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1rem' }}>
              Puts routine follow-ups on hold for {selectedAction.invoiceNumber}.
            </p>

            <form onSubmit={handleSaveDispute}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Dispute Reason</label>
                <select
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  style={inputStyle}
                >
                  <option value="pricing_error">Pricing / Rate Discrepancy</option>
                  <option value="damaged_goods">Damaged / Rejected Goods</option>
                  <option value="short_shipment">Short Material Received</option>
                  <option value="already_paid">Customer Claims Already Paid</option>
                  <option value="other">Other Dispute</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={labelStyle}>Description</label>
                <input
                  type="text"
                  placeholder="Details regarding the dispute"
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setModalType(null)} style={secondaryButtonStyle}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, backgroundColor: '#dc2626' }}>
                  {submitting ? 'Holding...' : 'Confirm Dispute & Hold'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const metricCardStyle = {
  backgroundColor: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '8px',
  padding: '1.25rem',
  cursor: 'pointer'
};

const metricLabelStyle = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#9ca3af',
  textTransform: 'uppercase',
  marginBottom: '0.25rem'
};

const metricHintStyle = {
  fontSize: '0.75rem',
  color: '#6b7280',
  marginTop: '0.5rem',
  display: 'block'
};

const actionCardStyle = {
  backgroundColor: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '8px',
  padding: '1rem',
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '1rem'
};

const inputStyle = {
  width: '100%',
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '6px',
  color: '#f3f4f6',
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem'
};

const labelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  color: '#9ca3af',
  marginBottom: '4px'
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

const cardBtnWhatsApp = {
  backgroundColor: '#065f46',
  border: '1px solid #059669',
  borderRadius: '4px',
  color: '#ffffff',
  padding: '4px 10px',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer'
};

const cardBtnSecondary = {
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '4px',
  color: '#d1d5db',
  padding: '4px 8px',
  fontSize: '0.75rem',
  cursor: 'pointer'
};

const cardBtnDanger = {
  backgroundColor: 'rgba(239, 68, 68, 0.2)',
  border: '1px solid #ef4444',
  borderRadius: '4px',
  color: '#f87171',
  padding: '4px 8px',
  fontSize: '0.75rem',
  cursor: 'pointer'
};

const refreshBtnStyle = {
  backgroundColor: 'transparent',
  border: '1px solid #374151',
  color: '#9ca3af',
  borderRadius: '4px',
  padding: '4px 8px',
  fontSize: '0.8rem',
  cursor: 'pointer'
};

const previewBoxStyle = {
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '6px',
  padding: '0.75rem',
  marginBottom: '1.25rem'
};

const toastStyle = {
  position: 'fixed',
  bottom: '24px',
  right: '24px',
  backgroundColor: '#065f46',
  color: '#ffffff',
  padding: '10px 18px',
  borderRadius: '6px',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
  fontSize: '0.85rem',
  zIndex: 2000
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
  maxWidth: '460px',
  padding: '1.5rem'
};