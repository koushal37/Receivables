import { parseAmount, parseDate, normalizePhone } from '@shared/parsing.js';

// Heuristic field extraction from free text (PDF text layer, OCR output, DOCX).
// Works line by line: find a label, take its value from the same or next line.

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_PATTERNS = [
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?[\\s/.-]+${MONTH},?[\\s/.-]+\\d{2,4}\\b`, 'i'),
  new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, 'i'),
  /\b\d{4}[/.-]\d{1,2}[/.-]\d{1,2}\b/,
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/,
];

const LABELS = {
  invoice_number: [
    /\b(?:tax\s+)?invoice\s*(?:no\.?|number|num\.?|#|id|ref(?:erence)?)\s*[:.#-]?\s*(.*)$/i,
    /\b(?:inv|bill|document|doc)\s*(?:no\.?|number|#)\s*[:.#-]?\s*(.*)$/i,
    /\binvoice\s*[:#]\s*(.*)$/i,
  ],
  due_date: [/\b(?:due\s*date|payment\s*due(?:\s*date)?|due\s*on|due\s*by|pay(?:able)?\s*by)\s*[:.-]?\s*(.*)$/i],
  invoice_date: [
    /\b(?:invoice|bill|issue|issued|tax\s*point|document)\s*date\s*[:.-]?\s*(.*)$/i,
    /\bdate\s*of\s*(?:issue|invoice)\s*[:.-]?\s*(.*)$/i,
    /^\s*(?:dated?)\s*[:.-]?\s*(.*)$/i,
  ],
  customer_name: [
    /\b(?:bill(?:ed)?\s*to|invoice\s*to|sold\s*to|customer(?:\s*name)?|buyer|client(?:\s*name)?|recipient|consignee)\s*[:.-]?\s*(.*)$/i,
    /\bship(?:ped)?\s*to\s*[:.-]?\s*(.*)$/i,
  ],
  vendor_name: [/\b(?:from|seller|supplier|vendor|sold\s*by|issued\s*by)\s*[:.-]\s*(.*)$/i],
};

// Order matters: the first group that matches wins, later lines in the same group win ties.
const TOTAL_LABELS = [
  /\b(?:grand\s*total|amount\s*due|balance\s*due|total\s*due|amount\s*payable|total\s*payable|net\s*payable|invoice\s*total|total\s*amount\s*due)\b/i,
  /\b(?:total\s*amount|total\s*\(?(?:inr|usd|eur|gbp|incl)|^\s*total)\b/i,
  /\btotal\b/i,
];
const SUBTOTAL_LABEL = /\b(?:sub\s*-?\s*total|taxable\s*(?:value|amount)|total\s*before\s*tax|net\s*amount|amount\s*before\s*tax)\b/i;
const TAX_TOTAL_LABEL = /\b(?:total\s*tax|tax\s*total|total\s*gst|gst\s*amount|tax\s*amount|total\s*vat|vat\s*amount)\b/i;
const TAX_PART_LABEL = /\b(?:cgst|sgst|igst|utgst|cess)\b/i;
const TAX_SINGLE_LABEL = /\b(?:gst|vat|sales\s*tax|tax)\b/i;
const NOT_TAX = /\b(?:gstin|gst\s*no|gst\s*number|vat\s*(?:no|number|reg)|tax\s*id|pan)\b/i;
const NOT_TOTAL = /\b(?:sub\s*-?\s*total|total\s*tax|tax\s*total|total\s*gst|total\s*vat|total\s*qty|total\s*quantity|total\s*items?)\b/i;

const NOISE_LINE = /^(?:tax\s+)?invoice$|^original|^duplicate|^page\s+\d/i;

export function findDate(str) {
  if (!str) return null;
  for (const re of DATE_PATTERNS) {
    const m = re.exec(str);
    if (m) {
      const iso = parseDate(m[0].replace(/(\d)(?:st|nd|rd|th)/i, '$1'));
      if (iso) return iso;
    }
  }
  return null;
}

// Amount-like tokens on a line, ignoring percentages, years in dates, and long ids.
export function findAmounts(line) {
  const out = [];
  const re = /(?:₹|rs\.?|inr|usd|eur|gbp|\$|€|£)?\s?(\d{1,3}(?:[, ]\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?!\s*%)(?![\d/.-]\d)/gi;
  const cleaned = line.replace(new RegExp(DATE_PATTERNS.map((r) => r.source).join('|'), 'gi'), ' ');
  let m;
  while ((m = re.exec(cleaned))) {
    const digits = m[1].replace(/[, ]/g, '');
    if (digits.replace('.', '').length > 12) continue;
    const n = parseAmount(m[1].replace(/ /g, ','));
    if (n !== null) out.push(n);
  }
  return out;
}

const lastAmount = (line) => {
  const a = findAmounts(line);
  return a.length ? a[a.length - 1] : null;
};

function valueAfter(lines, i, captured) {
  const same = (captured || '').trim();
  if (same) return same;
  for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) if (lines[j].trim()) return lines[j].trim();
  return '';
}

function firstMatch(lines, patterns, accept) {
  for (const re of patterns) {
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const value = accept(valueAfter(lines, i, m[1]), i);
      if (value) return { value, line: i };
    }
  }
  return null;
}

const cleanName = (s) => s
  .replace(/\s{2,}.*$/, '') // drop a second column on the same line
  .replace(/^(?:m\/s\.?|messrs\.?)\s*/i, '')
  .replace(/[:,;-]+$/, '')
  .trim();

const ID_TOKEN = /([A-Z0-9][A-Z0-9/_.-]*\d[A-Z0-9/_.-]*|\d[A-Z0-9/_.-]*)/i;

function extractCurrency(text) {
  const explicit = /\bcurrency\s*[:.-]?\s*([A-Z]{3})\b/i.exec(text);
  if (explicit) return explicit[1].toUpperCase();
  if (/₹|\brs\.?\s?\d|\binr\b/i.test(text)) return 'INR';
  if (/€|\beur\b/i.test(text)) return 'EUR';
  if (/£|\bgbp\b/i.test(text)) return 'GBP';
  if (/\$|\busd\b/i.test(text)) return 'USD';
  return '';
}

function extractLineItems(lines) {
  const header = lines.findIndex((l) => /\b(description|particulars|item|product|service|details)\b/i.test(l) && /\b(qty|quantity|hrs|hours|units?)\b|\b(rate|price|amount|total)\b/i.test(l));
  if (header === -1) return [];
  const items = [];
  for (let i = header + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (SUBTOTAL_LABEL.test(line) || TOTAL_LABELS.some((r) => r.test(line)) || TAX_PART_LABEL.test(line) || TAX_TOTAL_LABEL.test(line)) break;
    const nums = findAmounts(line);
    const desc = line
      .replace(/^\s*\d{1,3}[.)]?\s+/, '') // serial number
      .replace(/(?:₹|rs\.?|inr|usd|\$|€|£)?\s?\d[\d, ]*(?:\.\d+)?\s*%?/gi, ' ')
      .replace(/\b(?:nos?|pcs|units?|hrs?|kg|ea)\b\.?/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (nums.length < 1 || !/[a-z]{2,}/i.test(desc)) continue;
    const amount = nums[nums.length - 1];
    const unit = nums.length >= 2 ? nums[nums.length - 2] : '';
    const qty = nums.length >= 3 ? nums[nums.length - 3] : nums.length === 2 && unit ? Math.round((amount / unit) * 1000) / 1000 : '';
    items.push({ description: desc.slice(0, 200), quantity: qty === '' ? '' : qty, unit_price: unit, amount });
    if (items.length >= 200) break;
  }
  return items;
}

export function extractInvoiceFromText(rawText) {
  const text = String(rawText || '').replace(/\r/g, '').replace(/[ \t]+$/gm, '');
  const lines = text.split('\n').map((l) => l.replace(/\t/g, '  '));
  const out = { warnings: [] };

  const num = firstMatch(lines, LABELS.invoice_number, (v) => {
    const m = ID_TOKEN.exec(v.replace(/^[:#.\s-]+/, ''));
    return m && !findDate(m[0]) ? m[0].replace(/[.,;:]+$/, '') : null;
  });
  if (num) out.invoice_number = num.value;

  const due = firstMatch(lines, LABELS.due_date, (v) => findDate(v));
  if (due) out.due_date = due.value;

  const issued = firstMatch(lines.map((l) => (/\bdue\b/i.test(l) ? '' : l)), LABELS.invoice_date, (v) => findDate(v));
  if (issued) out.invoice_date = issued.value;
  if (!out.invoice_date) {
    const anyDate = lines.map((l) => (/\bdue\b/i.test(l) ? null : findDate(l))).find(Boolean);
    if (anyDate) out.invoice_date = anyDate;
  }

  const terms = /\bnet\s*(\d{1,3})\b|\b(\d{1,3})\s*days?\s*(?:credit|terms|from\s*invoice)/i.exec(text);
  if (terms) out.terms_days = Number(terms[1] || terms[2]);

  const customer = firstMatch(lines, LABELS.customer_name, (v) => {
    const name = cleanName(v);
    return name && /[a-z]{2,}/i.test(name) && !/^(?:details|address|name)$/i.test(name) ? name : null;
  });
  if (customer) {
    out.customer_name = customer.value;
    // Contact details usually sit in the few lines under the customer block
    const block = lines.slice(customer.line, customer.line + 7).join('\n');
    const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(block);
    if (email) out.email = email[0];
    const phone = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}/.exec(block.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ''));
    if (phone && normalizePhone(phone[0])) out.phone = normalizePhone(phone[0]);
  }

  const vendor = firstMatch(lines, LABELS.vendor_name, (v) => cleanName(v) || null);
  if (vendor) out.vendor_name = vendor.value;
  else {
    const first = lines.map((l) => l.trim()).find((l) => l && !NOISE_LINE.test(l) && /[a-z]{3,}/i.test(l) && !findDate(l));
    if (first && first !== out.customer_name) out.vendor_name = cleanName(first);
  }

  // Totals: scan from the bottom, where summary blocks usually are
  for (const re of TOTAL_LABELS) {
    for (let i = lines.length - 1; i >= 0 && out.amount === undefined; i--) {
      if (re.test(lines[i]) && !NOT_TOTAL.test(lines[i])) {
        const n = lastAmount(lines[i]) ?? (lines[i + 1] && findAmounts(lines[i + 1]).length === 1 ? lastAmount(lines[i + 1]) : null);
        if (n !== null) out.amount = n;
      }
    }
    if (out.amount !== undefined) break;
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    if (SUBTOTAL_LABEL.test(lines[i])) {
      const n = lastAmount(lines[i]);
      if (n !== null) { out.subtotal = n; break; }
    }
  }

  const taxTotalLine = lines.find((l) => TAX_TOTAL_LABEL.test(l) && !NOT_TAX.test(l) && lastAmount(l) !== null);
  if (taxTotalLine) out.tax = lastAmount(taxTotalLine);
  else {
    const parts = lines.filter((l) => TAX_PART_LABEL.test(l) && !NOT_TAX.test(l) && !TOTAL_LABELS[0].test(l)).map(lastAmount).filter((n) => n !== null);
    if (parts.length) out.tax = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
    else {
      const single = lines.find((l) => TAX_SINGLE_LABEL.test(l) && !NOT_TAX.test(l) && !NOT_TOTAL.test(l) && !TOTAL_LABELS[0].test(l) && lastAmount(l) !== null);
      if (single) out.tax = lastAmount(single);
    }
  }

  out.currency = extractCurrency(text);
  out.line_items = extractLineItems(lines);

  if (!text.trim()) out.warnings.push('No readable text was found in this file.');
  return out;
}
