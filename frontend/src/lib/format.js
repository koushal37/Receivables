const moneyCache = new Map();

export function formatMoney(value, currency = 'INR') {
  const n = Number(value) || 0;
  const key = currency || 'INR';
  if (!moneyCache.has(key)) {
    try {
      moneyCache.set(key, new Intl.NumberFormat(key === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: key, maximumFractionDigits: 2 }));
    } catch {
      moneyCache.set(key, new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }));
    }
  }
  return moneyCache.get(key).format(n);
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// 'YYYY-MM-DD' -> '15 Oct 2026'
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(text = '') {
  return text.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || '?';
}

export const STATUS_META = {
  overdue: { label: 'Overdue', tone: 'danger' },
  open: { label: 'Open', tone: 'neutral' },
  partially_paid: { label: 'Partially paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  disputed: { label: 'Disputed', tone: 'warning' },
  void: { label: 'Void', tone: 'neutral' },
};
