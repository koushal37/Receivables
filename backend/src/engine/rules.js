// Priority rules as data: first match wins. `priority` uses the queue's text levels.
export const COLLECTION_RULES = [
  {
    code: 'MISSED_PROMISE',
    priority: 'critical',
    label: 'Critical: Missed Promise',
    evaluate: (invoice, promise) => promise?.status === 'missed',
  },
  {
    code: 'HIGH_VALUE_OVERDUE',
    priority: 'critical',
    label: 'High: Overdue > ₹1,00,000',
    evaluate: (invoice) => invoice.days_overdue > 0 && invoice.outstanding_amount >= 100000,
  },
  {
    code: 'OVERDUE_30_DAYS',
    priority: 'important',
    label: 'Medium: Overdue > 30 Days',
    evaluate: (invoice) => invoice.days_overdue > 30,
  },
  {
    code: 'OVERDUE',
    priority: 'routine',
    label: 'Standard: Overdue',
    evaluate: (invoice) => invoice.days_overdue > 0,
  },
  {
    code: 'DUE_TODAY',
    priority: 'routine',
    label: 'Standard: Due Today',
    evaluate: (invoice) => invoice.computed_status === 'due_today',
  },
];
