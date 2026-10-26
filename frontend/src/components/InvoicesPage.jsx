import { useState, useEffect, useContext } from 'react';
import { api } from '../api';
import { AuthContext } from '../App';
import InvoiceImportModal from './InvoiceImportModal';

export default function InvoicesPage({ initialStatus = 'all' }) {
  const auth = useContext(AuthContext);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Selected Invoice for Detail & Timeline Drawer
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Action Modals inside Invoice Page
  const [paymentModalInv, setPaymentModalInv] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('neft_rtgs');
  const [payUtr, setPayUtr] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // New Manual Invoice Modal
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);
  const [newInvForm, setNewInvForm] = useState({
    customerName: '',
    customerPhone: '+91',
    invoiceNumber: '',
    dueDate: '',
    amount: '',
  });

  // Simulate Inbound Reply in Timeline
  const [replyInput, setReplyInput] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    setStatusFilter(initialStatus);
  }, [initialStatus]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const data = await api('/invoices');
      setInvoices(Array.isArray(data) ? data : data?.invoices || []);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const openTimelineDrawer = async (invId) => {
    setSelectedInvoiceId(invId);
    setTimelineLoading(true);
    setAiResult(null);
    try {
      const data = await api(`/invoices/${invId}/timeline`);
      setTimelineData(data);
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentModalInv) return;
    try {
      await api('/payments/record', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: paymentModalInv.id,
          amount: Number(payAmount),
          paymentMethod: payMethod,
          utr: payUtr || null,
          notes: payNotes || null,
        }),
      });
      showToast(`Recorded ₹${Number(payAmount).toLocaleString('en-IN')} for ${paymentModalInv.invoice_number}`);
      setPaymentModalInv(null);
      setPayAmount('');
      setPayUtr('');
      setPayNotes('');
      await loadInvoices();
      if (selectedInvoiceId === paymentModalInv.id) {
        openTimelineDrawer(paymentModalInv.id);
      }
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  };

  const handleReversePayment = async (paymentId) => {
    try {
      await api('/payments/reverse', {
        method: 'POST',
        body: JSON.stringify({
          paymentId,
          reason: 'Reversed by business owner during ledger audit',
        }),
      });
      showToast('Payment reversed and invoice balance recalculated.');
      await loadInvoices();
      if (selectedInvoiceId) openTimelineDrawer(selectedInvoiceId);
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  };

  const handleCreateManualInvoice = async (e) => {
    e.preventDefault();
    try {
      await api('/invoices', {
        method: 'POST',
        body: JSON.stringify(newInvForm),
      });
      showToast(`Created invoice ${newInvForm.invoiceNumber}`);
      setIsNewInvoiceOpen(false);
      setNewInvForm({ customerName: '', customerPhone: '+91', invoiceNumber: '', dueDate: '', amount: '' });
      loadInvoices();
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  };

  const handleSimulateReply = async (e) => {
    e.preventDefault();
    if (!selectedInvoiceId || !replyInput.trim()) return;
    try {
      const res = await api('/messages/simulate-reply', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: selectedInvoiceId,
          replyText: replyInput,
        }),
      });
      setAiResult(res.aiClassification);
      setReplyInput('');
      openTimelineDrawer(selectedInvoiceId);
      loadInvoices();
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  };

  const handleResolveDispute = async (invId) => {
    try {
      await api('/dashboard/resolve-dispute', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: invId, resolutionNotes: 'Dispute resolved and returned to active ledger' }),
      });
      showToast('Dispute marked resolved.');
      await loadInvoices();
      if (selectedInvoiceId === invId) openTimelineDrawer(invId);
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const pStatus = inv.payment_status || inv.computed_status || inv.status;
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'overdue'
        ? pStatus === 'overdue' || Number(inv.days_overdue) > 0
        : statusFilter === 'due_today'
        ? pStatus === 'due_today' || inv.ageing_bucket === 'due_today'
        : statusFilter === 'paid'
        ? pStatus === 'paid' || Number(inv.outstanding_balance ?? inv.outstanding_amount) <= 0
        : statusFilter === 'disputed'
        ? pStatus === 'disputed'
        : pStatus === statusFilter;

    const matchesSearch =
      !searchQuery.trim() ||
      inv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (inv) => {
    const st = inv.payment_status || inv.computed_status || inv.status;
    if (st === 'paid') return 'bg-emerald-100 text-emerald-800';
    if (st === 'disputed') return 'bg-purple-100 text-purple-800';
    if (st === 'overdue' || Number(inv.days_overdue) > 0) return 'bg-red-100 text-red-800';
    if (st === 'due_today') return 'bg-blue-100 text-blue-800';
    if (st === 'partially_paid') return 'bg-amber-100 text-amber-800';
    return 'bg-slate-100 text-slate-800';
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-xs font-semibold">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Invoice Ledger & Audit Timeline</h2>
          <p className="text-xs text-slate-500">
            Deterministic balance calculations (Original − Confirmed Payments − Adjustments)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search invoice # or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white w-56"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white font-medium"
          >
            <option value="all">All Invoices ({invoices.length})</option>
            <option value="overdue">Overdue</option>
            <option value="due_today">Due Today</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="disputed">Disputed</option>
            <option value="paid">Paid / Settled</option>
          </select>
          <button
            onClick={() => setIsNewInvoiceOpen(true)}
            className="px-3.5 py-2 bg-white border border-slate-300 text-slate-800 rounded-lg text-xs font-semibold hover:bg-slate-100"
          >
            + New Invoice
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm"
          >
            📥 Import CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500 text-sm">Loading invoice ledger...</div>
      ) : filteredInvoices.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-sm">
          No invoices found matching filter: <span className="font-bold">{statusFilter}</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
              <tr>
                <th className="p-3.5">Invoice #</th>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Due Date</th>
                <th className="p-3.5 text-right">Original Total</th>
                <th className="p-3.5 text-right">Paid</th>
                <th className="p-3.5 text-right">Outstanding</th>
                <th className="p-3.5">Overdue</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredInvoices.map((inv) => {
                const orig = Number(inv.original_amount ?? inv.amount ?? 0);
                const paid = Number(inv.total_paid ?? 0);
                const out = Number(inv.outstanding_balance ?? inv.outstanding_amount ?? 0);
                const days = Number(inv.days_overdue ?? 0);
                const st = inv.payment_status || inv.computed_status || inv.status;

                return (
                  <tr key={inv.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5 font-mono font-bold text-indigo-600">
                      <button onClick={() => openTimelineDrawer(inv.id)} className="hover:underline">
                        {inv.invoice_number}
                      </button>
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-900">{inv.customer_name}</div>
                      <div className="text-[11px] text-slate-400">{inv.customer_phone || 'No phone'}</div>
                    </td>
                    <td className="p-3.5 text-slate-700">{inv.due_date}</td>
                    <td className="p-3.5 text-right font-medium">₹{orig.toLocaleString('en-IN')}</td>
                    <td className="p-3.5 text-right text-emerald-700 font-medium">₹{paid.toLocaleString('en-IN')}</td>
                    <td className="p-3.5 text-right font-bold text-red-600">₹{out.toLocaleString('en-IN')}</td>
                    <td className="p-3.5">
                      {days > 0 ? (
                        <span className="text-red-600 font-semibold">{days}d overdue</span>
                      ) : out <= 0 ? (
                        <span className="text-emerald-600">Settled</span>
                      ) : (
                        <span className="text-slate-500">Current</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${getStatusBadge(inv)}`}>
                        {st.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3.5 text-right space-x-1.5">
                      {out > 0 && (
                        <button
                          onClick={() => {
                            setPaymentModalInv(inv);
                            setPayAmount(String(out));
                          }}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-semibold"
                        >
                          + Pay
                        </button>
                      )}
                      {st === 'disputed' && (
                        <button
                          onClick={() => handleResolveDispute(inv.id)}
                          className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded font-semibold"
                        >
                          Resolve
                        </button>
                      )}
                      <button
                        onClick={() => openTimelineDrawer(inv.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold"
                      >
                        Timeline →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Timeline & AI Reply Simulator Slide-Over Modal */}
      {selectedInvoiceId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end">
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 shadow-2xl flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <span className="text-xs font-bold uppercase text-indigo-600">Unified Invoice Audit Trail</span>
                  <h3 className="text-xl font-bold text-slate-900">
                    {timelineData?.invoice?.invoice_number || 'Loading...'} — {timelineData?.invoice?.customer_name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Due: {timelineData?.invoice?.due_date} • Outstanding: ₹{Number(timelineData?.invoice?.outstanding_balance || 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedInvoiceId(null)}
                  className="text-slate-400 hover:text-slate-700 font-bold text-lg"
                >
                  ✕
                </button>
              </div>

              {/* AI Inbound WhatsApp Reply Classifier */}
              <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                    🤖 AI Customer Reply Classifier (Interactive Demo)
                  </span>
                  <span className="text-[11px] text-slate-400">Section 16B Guardrails</span>
                </div>
                <p className="text-xs text-slate-300">
                  Simulate an incoming WhatsApp reply from the customer (e.g., &ldquo;We transferred via RTGS UTR99123&rdquo;, &ldquo;Will pay by Friday&rdquo;, &ldquo;Damaged goods in lot&rdquo;, or &ldquo;STOP&rdquo;):
                </p>
                <form onSubmit={handleSimulateReply} className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Type simulated customer WhatsApp message..."
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold"
                  >
                    Classify & Log
                  </button>
                </form>

                {aiResult && (
                  <div className="p-3 rounded-lg bg-slate-800 border border-indigo-500/40 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="font-bold text-indigo-300">
                        Category: {aiResult.category}
                      </span>
                      <span className="text-emerald-400">Confidence: {(aiResult.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-slate-300">Recommended Next Step: {aiResult.suggestedAction}</p>
                    <p className="text-[11px] text-amber-300">
                      🛡️ AI Safeguard: Human review required before altering ledger balances.
                    </p>
                  </div>
                )}
              </div>

              {/* Chronological Event Stream */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Chronological Activity Log ({timelineData?.timeline?.length || 0} events)
                </h4>

                {timelineLoading ? (
                  <div className="text-xs text-slate-400 py-6 text-center">Loading events...</div>
                ) : (
                  <div className="space-y-3">
                    {(timelineData?.timeline || []).map((ev, i) => (
                      <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold uppercase text-slate-700">
                            {ev.type === 'payment' && '💰 Payment Recorded'}
                            {ev.type === 'promise' && '📅 Promise to Pay'}
                            {ev.type === 'dispute' && '⚠️ Dispute Logged'}
                            {ev.type === 'message' && `💬 WhatsApp (${ev.details.direction})`}
                            {ev.type === 'created' && '📄 Invoice Issued'}
                          </span>
                          <span className="text-slate-400">{String(ev.date).slice(0, 10)}</span>
                        </div>

                        {ev.type === 'payment' && (
                          <div className="flex justify-between items-center pt-1">
                            <div>
                              <span className="font-bold text-emerald-700">
                                ₹{Number(ev.details.received_amount || ev.details.amount).toLocaleString('en-IN')}
                              </span>{' '}
                              via {ev.details.payment_method} (UTR: {ev.details.utr || ev.details.payment_reference || 'N/A'})
                              {ev.details.status === 'reversed' && (
                                <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 rounded font-bold">REVERSED</span>
                              )}
                            </div>
                            {auth?.role === 'owner' && ev.details.status !== 'reversed' && (
                              <button
                                onClick={() => handleReversePayment(ev.details.id)}
                                className="text-red-600 hover:underline font-semibold"
                              >
                                Reverse
                              </button>
                            )}
                          </div>
                        )}

                        {ev.type === 'promise' && (
                          <div>
                            Promised <strong>₹{Number(ev.details.promised_amount).toLocaleString('en-IN')}</strong> by{' '}
                            <strong>{ev.details.promised_date || ev.details.promise_date}</strong> ({ev.details.status}).{' '}
                            {ev.details.notes}
                          </div>
                        )}

                        {ev.type === 'dispute' && (
                          <div>
                            Reason: <strong>{ev.details.reason}</strong> ({ev.details.status}) — {ev.details.description}
                          </div>
                        )}

                        {ev.type === 'message' && (
                          <div className="text-slate-700 whitespace-pre-line">
                            {ev.details.message_content || ev.details.content}
                          </div>
                        )}

                        {ev.type === 'created' && <div>{ev.details.note}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedInvoiceId(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold"
              >
                Close Timeline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Recording Modal */}
      {paymentModalInv && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Record Payment for {paymentModalInv.invoice_number}</h3>
            <p className="text-xs text-slate-500">
              Customer: {paymentModalInv.customer_name} • Balance: ₹{Number(paymentModalInv.outstanding_balance ?? paymentModalInv.outstanding_amount).toLocaleString('en-IN')}
            </p>
            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Received (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="neft_rtgs">NEFT / RTGS</option>
                  <option value="upi">UPI</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">UTR / Bank Reference (Deduplicated)</label>
                <input
                  type="text"
                  placeholder="e.g. UTR771928341"
                  value={payUtr}
                  onChange={(e) => setPayUtr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalInv(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Manual Invoice Modal */}
      {isNewInvoiceOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create New Invoice</h3>
            <form onSubmit={handleCreateManualInvoice} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Customer / Party Name</label>
                <input
                  type="text"
                  required
                  value={newInvForm.customerName}
                  onChange={(e) => setNewInvForm({ ...newInvForm, customerName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Phone</label>
                <input
                  type="text"
                  value={newInvForm.customerPhone}
                  onChange={(e) => setNewInvForm({ ...newInvForm, customerPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Number</label>
                <input
                  type="text"
                  required
                  placeholder="INV-2026-205"
                  value={newInvForm.invoiceNumber}
                  onChange={(e) => setNewInvForm({ ...newInvForm, invoiceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    required
                    value={newInvForm.amount}
                    onChange={(e) => setNewInvForm({ ...newInvForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    required
                    value={newInvForm.dueDate}
                    onChange={(e) => setNewInvForm({ ...newInvForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewInvoiceOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
                >
                  Save Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <InvoiceImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={loadInvoices}
      />
    </div>
  );
}
