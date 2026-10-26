import { useState, useEffect } from 'react';
import { api } from '../api';

export default function OverviewPage({ onNavigateToInvoices, onOpenImport }) {
  const [metrics, setMetrics] = useState({
    totalOutstanding: 0,
    overdue: 0,
    dueToday: 0,
    receivedThisMonth: 0,
    receivedToday: 0,
    promisedToday: 0,
    disputedAmount: 0,
    missedPromisesCount: 0,
    openInvoicesCount: 0,
  });
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Modals state
  const [selectedAction, setSelectedAction] = useState(null);
  const [modalType, setModalType] = useState(null); // 'promise' | 'dispute' | 'whatsapp' | 'payment'
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseNotes, setPromiseNotes] = useState('');
  const [disputeReason, setDisputeReason] = useState('pricing_error');
  const [disputeNotes, setDisputeNotes] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('neft_rtgs');
  const [paymentUtr, setPaymentUtr] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const loadDashboardData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [mData, aData] = await Promise.all([
        api('/dashboard/metrics'),
        api('/dashboard/action-plan'),
      ]);

      if (mData?.metrics) setMetrics(mData.metrics);
      if (aData?.actionPlan) setActions(aData.actionPlan);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const showToast = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(''), 4500);
  };

  // 1. Send WhatsApp Reminder
  const handleSendWhatsApp = async (e) => {
    e.preventDefault();
    if (!selectedAction) return;
    setSubmitting(true);

    try {
      const data = await api('/messages/send-reminder', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: selectedAction.id }),
      });

      showToast(
        `WhatsApp reminder dispatched for ${selectedAction.invoiceNumber}! Status: ${data.log?.status || 'delivered'}`
      );
      setSelectedAction(null);
      setModalType(null);
      loadDashboardData();
    } catch (err) {
      setErrorMsg(err.message);
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
      await api('/dashboard/record-promise', {
        method: 'POST',
        body: JSON.stringify({
          customerId: selectedAction.customerId,
          invoiceId: selectedAction.id,
          promisedAmount: selectedAction.outstandingBalance,
          promisedDate: promiseDate,
          notes: promiseNotes,
        }),
      });

      showToast(`Payment promise recorded for ${selectedAction.invoiceNumber} (${promiseDate}).`);
      setSelectedAction(null);
      setModalType(null);
      setPromiseDate('');
      setPromiseNotes('');
      loadDashboardData();
    } catch (err) {
      setErrorMsg(err.message);
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
      await api('/dashboard/flag-dispute', {
        method: 'POST',
        body: JSON.stringify({
          customerId: selectedAction.customerId,
          invoiceId: selectedAction.id,
          reason: disputeReason,
          description: disputeNotes,
        }),
      });

      showToast(`Invoice ${selectedAction.invoiceNumber} marked disputed & paused from routine reminders.`);
      setSelectedAction(null);
      setModalType(null);
      setDisputeNotes('');
      loadDashboardData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Record Payment Directly from Queue
  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (!selectedAction || !paymentAmount) return;
    setSubmitting(true);

    try {
      const res = await api('/payments/record', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: selectedAction.id,
          amount: Number(paymentAmount),
          paymentMethod,
          utr: paymentUtr || null,
          notes: paymentNotes || null,
        }),
      });

      showToast(
        `Payment of ₹${Number(paymentAmount).toLocaleString('en-IN')} confirmed! Remaining balance: ₹${Number(res.remaining_balance || 0).toLocaleString('en-IN')}`
      );
      setSelectedAction(null);
      setModalType(null);
      setPaymentAmount('');
      setPaymentUtr('');
      setPaymentNotes('');
      loadDashboardData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityBadge = (priority) => {
    if (priority === 'critical')
      return 'bg-red-100 text-red-800 border border-red-200';
    if (priority === 'important')
      return 'bg-amber-100 text-amber-800 border border-amber-200';
    return 'bg-blue-100 text-blue-800 border border-blue-200';
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {feedbackMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-700 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2">
          <span>✅</span>
          <span>{feedbackMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex justify-between items-center">
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="text-red-500 font-bold">✕</button>
        </div>
      )}

      {/* Section B: Four Primary Financial Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigateToInvoices && onNavigateToInvoices('all')}
          className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            1. Total Outstanding
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">
            ₹{Number(metrics.totalOutstanding || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 mt-2 flex justify-between items-center">
            <span>{metrics.openInvoicesCount || 0} open bills</span>
            <span className="text-indigo-600 font-medium">View all →</span>
          </div>
        </div>

        <div
          onClick={() => onNavigateToInvoices && onNavigateToInvoices('overdue')}
          className="bg-white rounded-xl p-5 border-l-4 border-l-red-500 border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-red-600">
            2. Overdue Balance
          </div>
          <div className="text-2xl font-extrabold text-red-600 mt-1">
            ₹{Number(metrics.overdue || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 mt-2 flex justify-between items-center">
            <span>Due date passed</span>
            <span className="text-red-600 font-medium">Filter overdue →</span>
          </div>
        </div>

        <div
          onClick={() => onNavigateToInvoices && onNavigateToInvoices('due_today')}
          className="bg-white rounded-xl p-5 border-l-4 border-l-blue-500 border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
            3. Due Today
          </div>
          <div className="text-2xl font-extrabold text-blue-600 mt-1">
            ₹{Number(metrics.dueToday || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 mt-2 flex justify-between items-center">
            <span>Contractually due today</span>
            <span className="text-blue-600 font-medium">Filter due today →</span>
          </div>
        </div>

        <div
          onClick={() => onNavigateToInvoices && onNavigateToInvoices('paid')}
          className="bg-white rounded-xl p-5 border-l-4 border-l-emerald-500 border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">
            4. Received This Month
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1">
            ₹{Number(metrics.receivedThisMonth || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 mt-2 flex justify-between items-center">
            <span>Confirmed bank receipts</span>
            <span className="text-emerald-600 font-medium">View settled →</span>
          </div>
        </div>
      </div>

      {/* Section D & E: Today's Financial Expectations & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Today’s Financial Expectations (IST)
            </h3>
            <span className="text-xs text-slate-400">Promises ≠ Confirmed Cash</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">Invoices Due Today</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                ₹{Number(metrics.dueToday || 0).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
              <div className="text-xs text-indigo-700">Promised for Today</div>
              <div className="text-base font-bold text-indigo-900 mt-0.5">
                ₹{Number(metrics.promisedToday || 0).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <div className="text-xs text-emerald-700">Received Today</div>
              <div className="text-base font-bold text-emerald-900 mt-0.5">
                ₹{Number(metrics.receivedToday || 0).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
              <div className="text-xs text-amber-800">Active Disputes (On Hold)</div>
              <div className="text-base font-bold text-amber-900 mt-0.5">
                ₹{Number(metrics.disputedAmount || 0).toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onOpenImport && onOpenImport()}
              className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition text-center"
            >
              📥 Upload CSV / Tally
            </button>
            <button
              onClick={() => onNavigateToInvoices && onNavigateToInvoices('overdue')}
              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition text-center"
            >
              🔍 Overdue Ledger
            </button>
            <button
              onClick={() => onNavigateToInvoices && onNavigateToInvoices('disputed')}
              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition text-center"
            >
              ⚠️ Review Disputes
            </button>
            <button
              onClick={loadDashboardData}
              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition text-center"
            >
              ↻ Refresh Queue
            </button>
          </div>
        </div>
      </div>

      {/* Section C: Today's Action Plan (Prioritized Collection Queue) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Today’s Prioritized Collection Queue
            </h2>
            <p className="text-xs text-slate-500">
              Deterministic rules engine: Missed Promises → Overdue &gt;30d → High Value Overdue → Due Today
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            {actions.length} Action Items Requiring Follow-Up
          </span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500 text-sm">Calculating collection priorities...</div>
        ) : actions.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">
            🎉 All due and overdue follow-ups are settled or accounted for today!
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {actions.map((act) => (
              <div key={act.id} className="p-5 hover:bg-slate-50/80 transition flex flex-col lg:flex-row justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${getPriorityBadge(act.priority)}`}>
                      {act.priority}
                    </span>
                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      Rule: {act.ruleTriggered || 'PRIORITY_RULE'}
                    </span>
                    <span className="font-bold text-slate-900 text-base">{act.customerName}</span>
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {act.invoiceNumber}
                    </span>
                    {act.customerPhone && (
                      <span className="text-xs text-slate-500">📞 {act.customerPhone}</span>
                    )}
                  </div>

                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Why priority:</span> {act.priorityReason}
                  </p>

                  <p className="text-xs text-indigo-700 font-medium">
                    💡 <span className="font-semibold">Recommended Next Action:</span> {act.recommendedNextStep}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row lg:flex-col justify-between items-start sm:items-center lg:items-end gap-3 min-w-[260px]">
                  <div className="lg:text-right">
                    <div className="text-lg font-extrabold text-red-600">
                      ₹{Number(act.outstandingBalance).toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs text-slate-500">
                      {act.daysOverdue > 0 ? `${act.daysOverdue} days overdue (Due: ${act.dueDate})` : `Due Today (${act.dueDate})`}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setSelectedAction(act);
                        setModalType('whatsapp');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-sm"
                    >
                      💬 WhatsApp Reminder
                    </button>
                    <button
                      onClick={() => {
                        setSelectedAction(act);
                        setPaymentAmount(String(act.outstandingBalance));
                        setModalType('payment');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shadow-sm"
                    >
                      ₹ Record Payment
                    </button>
                    <button
                      onClick={() => {
                        setSelectedAction(act);
                        setModalType('promise');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold transition"
                    >
                      📅 Promise to Pay
                    </button>
                    <button
                      onClick={() => {
                        setSelectedAction(act);
                        setModalType('dispute');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold transition"
                    >
                      ⚠️ Flag Dispute
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal 1: WhatsApp Reminder */}
      {modalType === 'whatsapp' && selectedAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Send Authorized WhatsApp Reminder</h3>
            <p className="text-xs text-slate-600">
              Recipient: <strong>{selectedAction.customerName}</strong> ({selectedAction.customerPhone || 'No phone'})
            </p>
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-slate-800 space-y-1">
              <div className="font-bold text-emerald-800 uppercase mb-1">Approved Template Preview:</div>
              <p className="whitespace-pre-line leading-relaxed">
                {`Hello ${selectedAction.customerName},\n\nOur records show that invoice ${selectedAction.invoiceNumber} for ₹${Number(selectedAction.outstandingBalance).toLocaleString('en-IN')} (due on ${selectedAction.dueDate}) remains outstanding.\n\nIf payment was already made, kindly share the UTR reference so we can update our ledger.`}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSendWhatsApp}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                {submitting ? 'Dispatching...' : 'Confirm & Send WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Record Payment */}
      {modalType === 'payment' && selectedAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Record Confirmed Payment</h3>
            <p className="text-xs text-slate-600">
              {selectedAction.customerName} • <strong>{selectedAction.invoiceNumber}</strong> (Outstanding: ₹{Number(selectedAction.outstandingBalance).toLocaleString('en-IN')})
            </p>
            <form onSubmit={handleSavePayment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Received (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedAction.outstandingBalance}
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="neft_rtgs">NEFT / RTGS Bank Transfer</option>
                  <option value="upi">UPI Institutional</option>
                  <option value="cheque">Cheque / DD</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bank UTR / Reference Number</label>
                <input
                  type="text"
                  placeholder="e.g. UTR4029182231"
                  value={paymentUtr}
                  onChange={(e) => setPaymentUtr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Optional settlement remarks"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  {submitting ? 'Recording...' : 'Confirm Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Record Promise */}
      {modalType === 'promise' && selectedAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Record Promise to Pay</h3>
            <p className="text-xs text-slate-600">
              {selectedAction.customerName} • {selectedAction.invoiceNumber} (₹{Number(selectedAction.outstandingBalance).toLocaleString('en-IN')})
            </p>
            <form onSubmit={handleSavePromise} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Committed Payment Date</label>
                <input
                  type="date"
                  required
                  value={promiseDate}
                  onChange={(e) => setPromiseDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Call / Chat Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Spoken to Accounts Manager; RTGS scheduled Friday"
                  value={promiseNotes}
                  onChange={(e) => setPromiseNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  {submitting ? 'Saving...' : 'Save Promise'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Flag Dispute */}
      {modalType === 'dispute' && selectedAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Flag Invoice Dispute</h3>
            <p className="text-xs text-slate-600">
              Pauses routine automated reminders for <strong>{selectedAction.invoiceNumber}</strong> and routes to exception review.
            </p>
            <form onSubmit={handleSaveDispute} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dispute Category</label>
                <select
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="pricing_error">Pricing / Rate Discrepancy</option>
                  <option value="damaged_goods">Damaged / Rejected Goods</option>
                  <option value="short_shipment">Short Material Received</option>
                  <option value="already_paid">Customer Claims Already Paid</option>
                  <option value="other">Other Commercial Dispute</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dispute Details</label>
                <input
                  type="text"
                  placeholder="Describe issue reported by customer"
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                >
                  {submitting ? 'Holding...' : 'Flag Dispute & Pause Reminders'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
