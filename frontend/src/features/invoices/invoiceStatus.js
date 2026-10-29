export const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

// Single status used for display and filtering, derived from ledger fields.
export function displayStatus(inv, today = todayIst()) {
  const status = inv.payment_status;
  if (status === 'void' || status === 'disputed') return status;
  if (Number(inv.outstanding_balance) <= 0) return 'paid';
  if (inv.due_date < today) return 'overdue';
  if (status === 'partially_paid') return 'partially_paid';
  return 'open';
}

export function matchesFilter(inv, filter, today = todayIst()) {
  if (filter === 'all') return true;
  if (filter === 'due_today') return inv.due_date === today && Number(inv.outstanding_balance) > 0;
  return displayStatus(inv, today) === filter;
}

export function toActionItem(inv) {
  return {
    id: inv.id,
    customerName: inv.customer_name,
    customerPhone: inv.customer_phone,
    invoiceNumber: inv.invoice_number,
    outstandingBalance: Number(inv.outstanding_balance),
  };
}
