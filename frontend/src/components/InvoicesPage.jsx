import { useState, useEffect } from 'react';
import { api } from '../api';
import InvoiceImportModal from './InvoiceImportModal';

export default function InvoicesPage({ initialStatus = 'all' }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Sync prop changes from dashboard clicks
  useEffect(() => {
    setStatusFilter(initialStatus);
  }, [initialStatus]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      // Invoice listing uses the updated Asia/Kolkata summary view
      const data = await api('/invoices');
      setInvoices(data || []);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const filteredInvoices = invoices.filter((inv) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'overdue') return inv.computed_status === 'overdue' || inv.status === 'overdue';
    if (statusFilter === 'due_today') return inv.computed_status === 'due_today';
    if (statusFilter === 'paid') return inv.computed_status === 'paid' || inv.status === 'paid';
    return inv.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
          <p className="text-sm text-gray-500">Manage, import, and track receivables</p>
        </div>
        <div className="flex space-x-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="all">All Invoices</option>
            <option value="overdue">Overdue</option>
            <option value="due_today">Due Today</option>
            <option value="paid">Paid</option>
          </select>
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700"
          >
            Import CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading invoices...</div>
      ) : filteredInvoices.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-lg border text-gray-500">
          No invoices found matching filter: <span className="font-semibold">{statusFilter}</span>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3">Invoice #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Due Date</th>
                <th className="p-3">Total Amount</th>
                <th className="p-3">Outstanding</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{inv.invoice_number}</td>
                  <td className="p-3">{inv.customer_name}</td>
                  <td className="p-3">{inv.due_date}</td>
                  <td className="p-3">₹{Number(inv.amount).toLocaleString('en-IN')}</td>
                  <td className="p-3 text-red-600 font-medium">
                    ₹{Number(inv.outstanding_amount || inv.amount).toLocaleString('en-IN')}
                  </td>
                  <td className="p-3 capitalize">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        inv.computed_status === 'overdue'
                          ? 'bg-red-100 text-red-800'
                          : inv.computed_status === 'paid'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {inv.computed_status || inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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