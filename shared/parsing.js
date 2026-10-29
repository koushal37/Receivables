// Pure parsers shared by the backend and the browser import pipeline. No I/O, no Node or DOM APIs.

const CURRENCY_TOKENS = /(₹|\$|€|£|¥|\b(?:rs|inr|usd|eur|gbp|aed|sgd)\b\.?)/gi;

// Parses "₹1,50,000.50", "Rs. 500", "INR 2,000", 1500 -> number > 0, else null.
export function parseAmount(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? round2(raw) : null;
  if (raw === null || raw === undefined) return null;
  const str = String(raw).replace(CURRENCY_TOKENS, '').replace(/[\s,]/g, '');
  if (!/^\d+(\.\d+)?$/.test(str)) return null;
  const n = Number(str);
  return n > 0 ? round2(n) : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function toIso(year, month, day) {
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

// Excel stores dates as days since 1899-12-30. Pure UTC math so the server
// timezone can never shift the result by a day.
export function excelSerialToIso(serial) {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

// Day-first parsing (Indian convention). Accepts dd/mm/yyyy, dd-mm-yy,
// yyyy-mm-dd, "15 Oct 2026", "Oct 15, 2026", Excel serials and Date objects.
export function parseDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : toIso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }
  if (typeof raw === 'number') return excelSerialToIso(raw);

  const str = String(raw).trim();
  if (/^\d{4,5}(\.\d+)?$/.test(str)) return excelSerialToIso(Number(str));

  let m = str.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[T\s].*)?$/);
  if (m) return toIso(+m[1], +m[2], +m[3]);

  m = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return toIso(+m[3], +m[2], +m[1]);

  m = str.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s/.-]+([a-z]{3,9})\.?,?[\s/.-]+(\d{2}|\d{4})$/i);
  if (m && monthFromName(m[2])) return toIso(+m[3], monthFromName(m[2]), +m[1]);

  m = str.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
  if (m && monthFromName(m[1])) return toIso(+m[3], monthFromName(m[1]), +m[2]);

  return null;
}

function monthFromName(name) {
  const lower = name.toLowerCase();
  return MONTHS[lower.slice(0, 4)] ?? MONTHS[lower.slice(0, 3)] ?? null;
}

// Indian 10-digit numbers get +91; anything with an explicit country code is kept.
export function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const hasPlus = str.startsWith('+');
  const digits = str.replace(/\D/g, '');
  if (hasPlus && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  return null;
}

export function normalizeCurrency(raw, fallback = 'INR') {
  if (!raw) return fallback;
  const str = String(raw).trim().toUpperCase();
  const symbols = { '₹': 'INR', RS: 'INR', 'RS.': 'INR', $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
  if (symbols[str]) return symbols[str];
  return /^[A-Z]{3}$/.test(str) ? str : fallback;
}
