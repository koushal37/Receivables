export const COLLECTION_RULES = [
  {
    code: 'MISSED_PROMISE',
    priority: 1, // Highest
    label: 'Critical: Missed Promise',
    evaluate: (invoice, promise) => {
      return promise && promise.status === 'missed';
    },
  },
  {
    code: 'HIGH_VALUE_OVERDUE',
    priority: 2,
    label: 'High: Overdue > ₹1,00,000',
    evaluate: (invoice) => {
      return invoice.days_overdue > 0 && invoice.outstanding_amount >= 100000;
    },
  },
  {
    code: 'OVERDUE_30_DAYS',
    priority: 3,
    label: 'Medium: Overdue > 30 Days',
    evaluate: (invoice) => {
      return invoice.days_overdue > 30;
    },
  },
  {
    code: 'DUE_TODAY',
    priority: 4,
    label: 'Standard: Due Today',
    evaluate: (invoice) => {
      return invoice.computed_status === 'due_today';
    },
  },
];
