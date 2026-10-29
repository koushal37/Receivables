const RANK = { critical: 1, important: 2, routine: 3 };

// Turns due/overdue ledger rows into a ranked collection queue.
export function buildActionPlan(invoices, missedPromiseInvoiceIds = new Set()) {
  return invoices
    .map((inv) => {
      const days = Number(inv.days_overdue) || 0;
      let priority = 'routine';
      let reason = 'Invoice due today.';
      let recommendedStep = 'Send friendly payment reminder.';

      if (missedPromiseInvoiceIds.has(inv.id)) {
        priority = 'critical';
        reason = 'Customer missed an agreed payment promise date.';
        recommendedStep = 'Urgent call required. Follow up on missed commitment.';
      } else if (days > 30) {
        priority = 'critical';
        reason = `${days} days overdue (high delay).`;
        recommendedStep = 'Escalate with phone call to accounts head.';
      } else if (days > 7) {
        priority = 'important';
        reason = `${days} days overdue without confirmed settlement.`;
        recommendedStep = 'Place follow-up phone call to verify payment status.';
      } else if (days > 0) {
        reason = `${days} day(s) overdue.`;
        recommendedStep = 'Send follow-up WhatsApp notice.';
      }

      return {
        id: inv.id,
        customerId: inv.customer_id,
        customerName: inv.customer_name,
        customerPhone: inv.customer_phone,
        invoiceNumber: inv.invoice_number,
        outstandingBalance: Number(inv.outstanding_balance),
        daysOverdue: days,
        priority,
        missedPromise: missedPromiseInvoiceIds.has(inv.id),
        priorityReason: reason,
        recommendedNextStep: recommendedStep
      };
    })
    .sort((a, b) => {
      if (RANK[a.priority] !== RANK[b.priority]) return RANK[a.priority] - RANK[b.priority];
      if (a.missedPromise !== b.missedPromise) return a.missedPromise ? -1 : 1;
      if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
      return b.outstandingBalance - a.outstandingBalance;
    });
}
