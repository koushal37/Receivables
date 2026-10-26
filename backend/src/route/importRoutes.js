import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireBusiness, requireRole, audit } from '../middleware/auth.js';
import { supabase } from '../supabase.js';

const router = Router();

// Indian Currency Parser
export function parseIndianAmount(raw) {
  if (typeof raw === 'number') return raw > 0 ? raw : null;
  if (!raw || typeof raw !== 'string') return null;

  // Strip ₹, INR, commas, whitespace
  const sanitized = raw.replace(/[₹\s,INR]/gi, '');
  const parsed = Number(sanitized);
  return !isNaN(parsed) && parsed > 0 ? parsed : null;
}

// Explicit dd/mm/yyyy & Excel Serial Date Parser
export function parseDateExplicit(raw) {
  if (!raw) return null;

  // Handle Excel Serial Dates (e.g. 45385 -> 2024-04-03)
  if (typeof raw === 'number' || (!isNaN(raw) && !raw.toString().includes('/') && !raw.toString().includes('-'))) {
    const serial = Number(raw);
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    const fractional_day = serial - Math.floor(serial) + 0.0000001;
    let total_seconds = Math.floor(86400 * fractional_day);
    const seconds = total_seconds % 60;
    total_seconds -= seconds;
    const hours = Math.floor(total_seconds / (60 * 60));
    const minutes = Math.floor(total_seconds / 60) % 60;
    const d = new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }

  const str = String(raw).trim();
  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
      return date.toISOString().split('T')[0];
    }
    return null;
  }

  // Fallback ISO YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
      return date.toISOString().split('T')[0];
    }
  }

  return null;
}

// POST /api/import/preview - Validates, dedupes, categorizes
router.post('/preview', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'Payload must contain rows array' });
    }

    const valid = [];
    const errors = [];
    const duplicates = [];

    // Check existing invoices for this business
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('business_id', req.businessId);

    const existingSet = new Set((existingInvoices || []).map((i) => i.invoice_number.toLowerCase()));
    const seenInFile = new Set();

    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const invNum = row.invoice_number ? String(row.invoice_number).trim() : null;
      const custName = row.customer_name ? String(row.customer_name).trim() : null;
      const parsedAmt = parseIndianAmount(row.amount);
      const parsedDate = parseDateExplicit(row.due_date);

      if (!invNum) {
        errors.push({ row: rowNum, reason: 'Missing Invoice Number', data: row });
        return;
      }

      if (!custName) {
        errors.push({ row: rowNum, reason: 'Missing Customer Name', data: row });
        return;
      }

      if (parsedAmt === null) {
        errors.push({ row: rowNum, reason: `Invalid amount: "${row.amount}"`, data: row });
        return;
      }

      if (parsedDate === null) {
        errors.push({ row: rowNum, reason: `Invalid date format: "${row.due_date}". Use DD/MM/YYYY`, data: row });
        return;
      }

      const lowerInv = invNum.toLowerCase();
      if (seenInFile.has(lowerInv)) {
        duplicates.push({ row: rowNum, reason: 'Duplicate invoice number within file', data: row });
        return;
      }
      seenInFile.add(lowerInv);

      if (existingSet.has(lowerInv)) {
        duplicates.push({ row: rowNum, reason: 'Invoice number already exists in business database', data: row });
        return;
      }

      valid.push({
        row: rowNum,
        name: custName,
        phone: row.phone ? String(row.phone).trim() : null,
        invoice_number: invNum,
        amount: parsedAmt,
        due_date: parsedDate,
      });
    });

    res.json({ valid, duplicates, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/commit - Atomic commit via RPC
router.post('/commit', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided for commit' });
    }

    // Call atomic Postgres RPC
    const { data, error } = await supabase.rpc('commit_import_batch', {
      p_business_id: req.businessId,
      p_rows: rows,
    });

    if (error) throw error;

    await audit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'IMPORT_COMMITTED',
      entity: 'invoices',
      afterState: { count: data.count },
    });

    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;