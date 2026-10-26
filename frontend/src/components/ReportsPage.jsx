import { useEffect, useState } from 'react';
import { api } from '../api';

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/reports/ageing')
      .then(setReport)
      .catch((err) => console.error('Failed to load reports:', err))
      .finally(() => setLoading(false));
  }, []);

  const exportCustomerCsv = () => {
    if (!report?.customerSummary) return;
    const headers = ['Customer Name,Phone,Open Invoices,Total Billed,Total Paid,Total Outstanding,Overdue Amount,Max Days Overdue'];
    const rows = report.customerSummary.map((c) =>
      `"${c.customer_name}","${c.customer_phone || ''}",${c.invoice_count},${c.total_billed},${c.total_paid},${c.total_outstanding},${c.overdue_amount},${c.max_days_overdue}`
    );
    const blob = new Blob([[...headers, ...rows].join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'receivables-ageing-report.csv';
    a.click();
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-500 text-sm">Generating financial & operational reports...</div>;
  }

  const b = report?.buckets || {};
  const totalOut = Math.max(1, Number(b.total_outstanding || 0));

  const bucketItems = [
    { label: 'Not Yet Due', amount: b.not_yet_due || 0, color: 'bg-emerald-500' },
    { label: 'Due Today', amount: b.due_today || 0, color: 'bg-blue-500' },
    { label: '1–7 Days Overdue', amount: b.days_1_7 || 0, color: 'bg-amber-400' },
    { label: '8–30 Days Overdue', amount: b.days_8_30 || 0, color: 'bg-orange-500' },
    { label: '31–60 Days Overdue', amount: b.days_31_60 || 0, color: 'bg-red-500' },
    { label: '60+ Days Overdue', amount: b.days_60_plus || 0, color: 'bg-rose-800' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Ageing & Collection Performance Reports</h2>
          <p className="text-xs text-slate-500">
            Mutually exclusive ageing buckets (Section 18) & customer-wise ledger reconciliation
          </p>
        </div>
        <button
          onClick={exportCustomerCsv}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
        >
          ⬇ Export Ageing Report (CSV)
        </button>
      </div>

      {/* Ageing Buckets Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Invoice Ageing Distribution
          </h3>
          <span className="text-sm font-extrabold text-slate-900">
            Total Unpaid: ₹{Number(b.total_outstanding || 0).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {bucketItems.map((item) => {
            const pct = Math.round((Number(item.amount) / totalOut) * 100);
            return (
              <div key={item.label} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-semibold text-slate-600">{item.label}</div>
                <div className="text-base font-extrabold text-slate-900">
                  ₹{Number(item.amount).toLocaleString('en-IN')}
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full ${item.color}`} style={{ width: `${pct}%` }}></div>
                </div>
                <div className="text-[11px] text-slate-400">{pct}% of outstanding</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Promise & Dispute Operational Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Promise-to-Pay Reliability
          </h3>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-lg font-extrabold text-slate-900">{report?.promiseStats?.upcoming || 0}</div>
              <div className="text-[11px] text-slate-500">Upcoming</div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50">
              <div className="text-lg font-extrabold text-emerald-700">{report?.promiseStats?.fulfilled || 0}</div>
              <div className="text-[11px] text-emerald-700">Fulfilled</div>
            </div>
            <div className="p-3 rounded-lg bg-red-50">
              <div className="text-lg font-extrabold text-red-700">{report?.promiseStats?.missed || 0}</div>
              <div className="text-[11px] text-red-700">Missed</div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50">
              <div className="text-lg font-extrabold text-amber-700">{report?.promiseStats?.revised || 0}</div>
              <div className="text-[11px] text-amber-700">Revised</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Disputes & Confirmed Collections
          </h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-lg bg-purple-50">
              <div className="text-lg font-extrabold text-purple-800">{report?.disputeStats?.open || 0}</div>
              <div className="text-[11px] text-purple-700">Open Disputes</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-lg font-extrabold text-slate-800">{report?.disputeStats?.resolved || 0}</div>
              <div className="text-[11px] text-slate-500">Resolved</div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50">
              <div className="text-lg font-extrabold text-emerald-700">
                ₹{Number(report?.totalCollectedAllTime || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-emerald-700">Total Collected</div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer-wise Outstanding Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">Customer-Wise Outstanding Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
              <tr>
                <th className="p-3.5">Customer Name</th>
                <th className="p-3.5">Invoices</th>
                <th className="p-3.5 text-right">Total Billed</th>
                <th className="p-3.5 text-right">Confirmed Paid</th>
                <th className="p-3.5 text-right">Outstanding</th>
                <th className="p-3.5 text-right">Overdue Balance</th>
                <th className="p-3.5">Max Delay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(report?.customerSummary || []).map((c) => (
                <tr key={c.customer_id} className="hover:bg-slate-50">
                  <td className="p-3.5 font-semibold text-slate-900">{c.customer_name}</td>
                  <td className="p-3.5">{c.invoice_count}</td>
                  <td className="p-3.5 text-right">₹{Number(c.total_billed).toLocaleString('en-IN')}</td>
                  <td className="p-3.5 text-right text-emerald-700">₹{Number(c.total_paid).toLocaleString('en-IN')}</td>
                  <td className="p-3.5 text-right font-bold text-slate-900">
                    ₹{Number(c.total_outstanding).toLocaleString('en-IN')}
                  </td>
                  <td className="p-3.5 text-right font-bold text-red-600">
                    ₹{Number(c.overdue_amount).toLocaleString('en-IN')}
                  </td>
                  <td className="p-3.5">
                    {c.max_days_overdue > 0 ? `${c.max_days_overdue} days` : 'Current'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
