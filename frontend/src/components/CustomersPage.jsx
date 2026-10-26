import { useEffect, useState } from 'react';
import { api } from '../api';

export default function CustomersPage({ onSelectCustomerInvoices }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await api('/reports/customers');
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const filtered = customers.filter(
    (c) =>
      !search.trim() ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Customer Accounts & Consent Directory</h2>
          <p className="text-xs text-slate-500">
            Consolidated party balances, WhatsApp communication permissions & opt-out status
          </p>
        </div>
        <input
          type="text"
          placeholder="Search party name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-300 rounded-lg px-3.5 py-2 text-xs bg-white w-64"
        />
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500 text-sm">Loading customer accounts...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4"
            >
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{c.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    📞 {c.phone || 'No phone'} • ✉️ {c.email || 'No email'}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                    c.opt_out
                      ? 'bg-red-100 text-red-700'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {c.opt_out ? 'Opted Out (STOP)' : 'WhatsApp Active'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                <div>
                  <div className="text-slate-400">Open Bills</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{c.openInvoicesCount || 0}</div>
                </div>
                <div>
                  <div className="text-slate-400">Total Outstanding</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    ₹{Number(c.totalOutstanding || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Overdue</div>
                  <div className="font-bold text-red-600 text-sm mt-0.5">
                    ₹{Number(c.overdueBalance || 0).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-1 text-xs">
                <span className="text-slate-400">
                  Preferred Channel: <strong className="text-slate-600 uppercase">{c.preferred_channel || 'whatsapp'}</strong>
                </span>
                {onSelectCustomerInvoices && (
                  <button
                    onClick={() => onSelectCustomerInvoices(c.name)}
                    className="text-indigo-600 font-semibold hover:underline"
                  >
                    View Party Invoices →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
